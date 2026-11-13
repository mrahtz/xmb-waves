#!/usr/bin/env python3
"""The fixed measurement battery: the same measures on every footage clip and on the clean build at the same conditions.

usage: python3 battery.py [--commit REV|worktree] [--lanes background,motion,look,sparkles] [--index INDEX.json]
                             [--out DIR] [--clips REGEX] [--seed N] [--browsers 8] [--procs 16] [--cpu]
                             [--no-clean-noise] [--footage-only] [--force] [--keep-frames]

For every clip in the footage index not marked "heldout" (recordings, renders and noise clips), the clean build is rendered at
the same condition through the deterministic score mode (spec section 9): the clip's console date and time as `time`, its
colour as `theme`, its seed (or --seed, default 1, where the clip has none), its size, and simulation frames
60 * since_start_s + round(60 * t) for the clip's sample times t. The clip and the render are then measured with the same code
(see battery_frames.py for the frames taken):

  stills (t = 1, 5, 9, ... s, full size): bgremove.py, then spec46.py and fill.py (the wave); cycle.py's band peak and mean
          over the background; bgcompare.py's four background regions
  10 fps over the clip (full size):      bgremove.py, then spec46m.py, motion2.py and thick.py (the wave's motion)
  30 fps over the first 8 s (720 px high): sparks.py --hp (the sparkles)
  1 fps (480 x 270):                     the background with the wave masked out (each clip's own mask: its background-removed
          light), compared pixel by pixel between the clean render and the footage clip of the same condition, and
          between noise clips of the same condition: mean and percentile differences per channel and region

A clip's value of a still measure is the median over its stills (the mean for cycle.py and bgcompare.py, as cycleorig.py and
bgcompare.py average their frames). Measures are grouped by lane (background: spec 3 and 7; motion: 4.1 and 4.4; look: 4.5
and 5; sparkles: 6) and written as metrics.json (the measurer's format): `original` over the recordings and renders, `noise`
over the noise clips of the same conditions, `clean` over the clean renders at the recordings' and renders' conditions;
`within` when the clean median lies inside the wider of the original's and the noise range. For the pixel comparison the
original is the footage compared with itself (0) and the noise range the comparison between noise clips.

Output (--out, default work/battery/out/<commit>/): metrics.json, clips.json (every measure per clip, original and clean),
bgpixel.json (the pixel comparison per clip, region and channel), noise.json (the spread of every measure over each noise
set), timings.json, and summary.txt (the table that is also printed).

Caching: per clip and tool, in work/battery/footage/<clip> and work/battery/clean/<commit>/<condition> (MEASURE_WORK moves
work/). A commit's page is its committed index.html; `worktree` assembles the working tree's src/ (as mkvar.py does).
Changing a measure means raising BATTERY_VERSION, which invalidates every cached result.
"""
import os, re, sys, json, time, glob, shutil, hashlib, argparse, threading, subprocess, traceback
from concurrent.futures import ThreadPoolExecutor
import numpy as np

BATTERY_VERSION = 1
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
WORK = os.environ.get('MEASURE_WORK', os.path.join(HERE, 'work')); BW = os.path.join(WORK, 'battery')
PY = [sys.executable]  # (not -I: on some machines numpy is in the user site, which -I hides)
LANES = ('background', 'motion', 'look', 'sparkles')
# which tools each lane needs, and which frames each tool needs
TOOLS_FOR_LANE = {'background': ['bgregions', 'bgprep'], 'motion': ['spec46', 'spec46m', 'motion2', 'thick'],
                  'look': ['spec46', 'fill', 'cycle'], 'sparkles': ['sparks']}
FRAMES_FOR_TOOL = {'spec46': 'still', 'fill': 'still', 'cycle': 'still', 'bgregions': 'still',
                   'spec46m': 'motion', 'motion2': 'motion', 'thick': 'motion', 'bgprep': 'motion', 'sparks': 'spark'}

# ---------------------------------------------------------------------------------------------------------------------------
# Measures: name, lane, unit, tool, key, method. A clip's value: the tool's number (sequence tools) or the median over the
# clip's stills (spec46, fill) or their mean (cycle, bgregions).
M = []
def _m(lane, tool, method, rows):
    for name, key, unit in rows: M.append(dict(name=name, lane=lane, unit=unit, tool=tool, key=key, method=method))
S46 = 'spec46.py on bgremove.py output of the stills (t = 1, 5, 9.. s, full size); median over the stills'
_m('motion', 'spec46', S46, [
    ('wave.centre_median', 'centre_med', 'H'), ('wave.centre_min', 'centre_min', 'H'), ('wave.centre_max', 'centre_max', 'H'),
    ('wave.centre_range', 'centre_range', 'H'), ('wave.top_edge_min', 'top_min', 'H'), ('wave.bottom_edge_max', 'bot_max', 'H'),
    ('wave.tilt', 'tilt', 'H'), ('wave.tilt_abs', 'tilt_abs', 'H'), ('wave.arch', 'arch', 'H'),
    ('wave.thickness_median', 'thick_med', 'H'), ('wave.thickness_p10', 'thick_p10', 'H'), ('wave.thickness_p90', 'thick_p90', 'H'),
    ('wave.thickest_over_thinnest', 'thick_ratio', ''), ('wave.pinch_below_0.08H', 'pinch8', '% of columns'),
    ('wave.pinch_below_0.05H', 'pinch5', '% of columns')])
_m('look', 'spec46', S46, [
    ('wave.peaks12_mean', 'peaks12', 'peaks/column')] + [('wave.peaks12_share_%s' % k, 'peaks12_share_%s' % k, '% of columns') for k in ('1', '2', '3', '4', '5', '6', '7up')] + [
    ('wave.peaks25_mean', 'peaks25', 'peaks/column'), ('wave.peaks40_mean', 'peaks40', 'peaks/column'),
    ('wave.peaks12_left_third', 'peaks_left', 'peaks/column'), ('wave.peaks12_middle_third', 'peaks_mid', 'peaks/column'),
    ('wave.peaks12_right_third', 'peaks_right', 'peaks/column'),
    ('wave.face_level_median', 'face_med', 'of column max'), ('wave.face_level_p10', 'face_p10', 'of column max'), ('wave.face_level_p90', 'face_p90', 'of column max'),
    ('wave.fold_over_face_median', 'foldface_med', ''), ('wave.fold_over_face_p90', 'foldface_p90', ''), ('wave.avg_peak_over_face_median', 'avgface_med', ''),
    ('wave.overlap_ratio_median', 'overlap_med', ''),
    ('wave.line_width_median', 'width_lines', 'px@1080p'), ('wave.peak_width_all_median', 'width_all', 'px@1080p'),
    ('wave.sheen_width_median', 'width_sheen', 'px@1080p'), ('wave.brightest_line_width', 'bwidth', 'px@1080p'),
    ('wave.edge_rise_median', 'edge_med', 'px@1080p'), ('wave.edge_rise_p10', 'edge_p10', 'px@1080p'), ('wave.edge_rise_p90', 'edge_p90', 'px@1080p'),
    ('wave.partings_per_column', 'partcol', ''), ('wave.partings_count', 'partings', 'per frame'),
    ('wave.partings_length_median', 'partings_len_med', 'W'), ('wave.partings_length_max', 'partings_len_max', 'W'),
    ('wave.lines_10pct_count', 'lines10', 'per frame'), ('wave.lines_25pct_count', 'lines25', 'per frame'),
    ('wave.lines_length_median', 'lines_len_med', 'W'), ('wave.lines_outer_fifths_share', 'outer', ''),
    ('wave.line_peak_over_band_median', 'linepk', '')])
_m('look', 'fill', 'fill.py on bgremove.py output of the stills; median over the stills', [
    ('wave.fill_above_40pct', 'a40', 'share'), ('wave.fill_above_25pct', 'a25', 'share'),
    ('wave.fill_mean_over_max', 'mean', ''), ('wave.fill_dark_below_8pct', 'dark', 'share')])
_m('look', 'cycle', "cycle.py's stats() on the full stills (grey, 1 px blur, seven columns); mean over the stills", [
    ('band.peak_over_background', 'peak', 'levels'), ('band.mean_over_background', 'mean', 'levels')])
MOT = 'spec46m.py on bgremove.py output at 10 fps over the clip (full size)'
_m('motion', 'spec46m', MOT, [
    ('motion.centre_speed_median', 'cspeed', 'H/s'), ('motion.centre_speed_p90', 'cspeed_p90', 'H/s'),
    ('motion.mean_height_change', 'height_change40', 'H (within the clip, at most 40 s)'), ('motion.drift_5s', 'drift5', 'H/s'),
    ('motion.swell_shift_median', 'shift', 'W/s'), ('motion.swell_shift_p10', 'shift_p10', 'W/s'), ('motion.swell_shift_p90', 'shift_p90', 'W/s'),
    ('motion.corr_1s', 'corr1', ''), ('motion.corr_5s', 'corr5', ''),
    ('motion.adjacent_speed_diff', 'adjdiff', 'px/s@1080p'), ('motion.peak_speed_median', 'peakspeed', 'px/s@1080p'),
    ('motion.parting_speed', 'pspeed', 'px/s@1920'), ('motion.parting_right_share', 'pright', 'share'),
    ('motion.parting_life_median', 'plife_med', 's'), ('motion.parting_life_max', 'plife_max', 's')])
_m('motion', 'motion2', 'motion2.py on bgremove.py output at 10 fps (scaled to 960 x 540 by the tool)', [
    ('motion.kymo_vy_median', 'kymo_vy_med', 'px/s@1080p'), ('motion.kymo_vx_median', 'kymo_vx_med', 'px/s@1920'),
    ('motion.kymo_right_share', 'kymo_right', 'share'),
    ('motion.spectrum_below_0.3Hz', 'spec_lo', 'share'), ('motion.spectrum_0.3_1Hz', 'spec_mid', 'share'),
    ('motion.spectrum_above_1Hz', 'spec_hi', 'share'), ('motion.spectrum_centroid', 'spec_centroid', 'Hz'),
    ('motion.flow_median', 'flow_med', 'px/s@1080p'), ('motion.flow_p90', 'flow_p90', 'px/s@1080p'),
    ('motion.flow_vy_median', 'flow_vy_med', 'px/s@1080p'), ('motion.flow_vx_median', 'flow_vx_med', 'px/s@1080p'),
    ('motion.flow_textured_share', 'flow_tex_share', 'share'), ('motion.flow_textured_vx_median', 'flow_tex_vx_med', 'px/s@1080p'),
    ('motion.flow_textured_vy_median', 'flow_tex_vy_med', 'px/s@1080p'),
    ('motion.flow_left_third', 'flow_left', 'px/s@1080p'), ('motion.flow_right_third', 'flow_right', 'px/s@1080p')])
_m('motion', 'thick', 'thick.py on bgremove.py output at 10 fps: per-frame median thickness and centre, over the clip', [
    ('motion.frame_thickness_median', 'th_med', 'H'), ('motion.frame_thickness_min', 'th_min', 'H'),
    ('motion.frame_thickness_max', 'th_max', 'H'), ('motion.frame_centre_range', 'cen_range', 'H')])
_m('sparkles', 'sparks', 'sparks.py --hp at 30 fps over the first 8 s, frames scaled to 1280 x 720 (Lanczos)', [
    ('sparkles.count_median', 'n_med', 'per frame'), ('sparkles.count_p10', 'n_p10', 'per frame'), ('sparkles.count_p90', 'n_p90', 'per frame'),
    ('sparkles.peak_median', 'peak_med', 'levels'), ('sparkles.peak_p90', 'peak_p90', 'levels'),
    ('sparkles.brightest10_mean', 'top10', 'levels'), ('sparkles.summed_peaks_median', 'sum_med', 'levels'),
    ('sparkles.dot_share', 'dot', 'share'), ('sparkles.streak_share', 'streak', 'share'), ('sparkles.disc_share', 'disc', 'share'),
    ('sparkles.saturation_median', 'sat_med', ''), ('sparkles.saturated_share', 'sat_share', 'share'),
    ('sparkles.disc_diameter', 'disc_diam', 'px@1080p'), ('sparkles.disc_peak', 'disc_peak', 'levels'),
    ('sparkles.tracks', 'tracks', 'count'), ('sparkles.up_share', 'up_share', 'share'),
    ('sparkles.speed_median', 'speed_med', 'px/s@1080p'), ('sparkles.speed_p10', 'speed_p10', 'px/s@1080p'),
    ('sparkles.speed_p90', 'speed_p90', 'px/s@1080p'), ('sparkles.vy_median', 'vy_med', 'px/s@1080p'),
    ('sparkles.accel_median', 'acc_med', 'px/s^2 (+ down)'), ('sparkles.accel_abs_median', 'acc_abs', 'px/s^2')])
_m('background', 'bgregions', "bgcompare.py's regions() on the full stills (480 x 270, median per region); mean over the stills",
   [('bg.%s_%s.%s' % (r, c, ch), '%s_%s_%s' % (r, c, ch), 'levels') for r in ('top', 'bottom') for c in ('left', 'right') for ch in 'RGB'])
REGIONS = ['all'] + ['%s_%s' % (r, c) for r in ('top', 'middle', 'bottom') for c in ('left', 'centre', 'right')]
PIXM = ('background pixels at 480 x 270, temporal median of the 1 fps frames, wave masked out (union of both clips\' masks); '
        'clean minus footage of the same condition')
PIXEL_MEASURES = ([dict(name='bgpixel.all.%s_%s' % (ch, st), lane='background', unit='levels', key=('all', ch, st), method=PIXM)
                   for ch in 'RGB' for st in ('mean', 'absmean', 'p50', 'p90', 'p99')] +
                  [dict(name='bgpixel.%s.%s_mean' % (r, ch), lane='background', unit='levels', key=(r, ch, 'mean'), method=PIXM)
                   for r in REGIONS[1:] for ch in 'RGB'])

# ---------------------------------------------------------------------------------------------------------------------------
TIMES = {}; TLOCK = threading.Lock()
def timed(part, dt):
    with TLOCK: t = TIMES.setdefault(part, [0.0, 0]); t[0] += dt; t[1] += 1
LOG = threading.Lock()
def say(*a):
    with LOG: print(time.strftime('%H:%M:%S'), *a, flush=True)

class Runner:
    def __init__(self, procs, browsers):
        self.py = threading.BoundedSemaphore(procs); self.br = threading.BoundedSemaphore(browsers)
    def run(self, part, cmd, log, browser=False):
        if browser: self.br.acquire()
        self.py.acquire()
        t0 = time.time()   # time running, not waiting for a slot
        try:
            with open(log, 'a') as f:
                f.write('$ ' + ' '.join(cmd) + '\n'); f.flush()
                r = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT, cwd=HERE)
        finally:
            self.py.release()
            if browser: self.br.release()
        timed(part, time.time() - t0)
        if r.returncode: raise RuntimeError('%s failed (exit %d); see %s' % (part, r.returncode, log))

def clip_id(c):
    s = '%s_%s_%s_t%g_%gs_c%s_%s' % (c['kind'], c['date'], c['time'].replace(':', ''), c['since_start_s'], c['seconds'], c.get('colour', 0), c['size'])
    if c.get('seed') is not None: s += '_s%s' % c['seed']
    if float(c.get('fps', 60)) != 60: s += '_%gfps' % float(c['fps'])
    return s

def cond_of(c, seed):
    return dict(date=c['date'], time=c['time'], since_start_s=c['since_start_s'], seed=c['seed'] if c.get('seed') is not None else seed,
                colour=c.get('colour', 0), seconds=c['seconds'], size=c['size'], fps=float(c.get('fps', 60)))

def cond_key(d, cpu):
    return '%s_%s_t%g_%gs_c%s_%s_s%s%s%s' % (d['date'], d['time'].replace(':', ''), d['since_start_s'], d['seconds'], d['colour'], d['size'],
                                         d['seed'], '' if d['fps'] == 60 else '_%gfps' % d['fps'], '_cpu' if cpu else '')

def noise_group(c):  # noise clips vary seed and time since start; the condition is the rest
    return '%s_%s_c%s_%s' % (c['date'], c['time'].replace(':', ''), c.get('colour', 0), c['size'])

def resolve_page(commit):
    if commit == 'worktree':
        sys.path.insert(0, HERE); from buildsrc import read_sources, assemble
        texts, order = read_sources(); page = assemble(texts, order)
        h = 'worktree-' + hashlib.sha1(page.encode('utf-8')).hexdigest()[:12]
    else:
        h = subprocess.run(['git', 'rev-parse', commit + '^{commit}'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        page = subprocess.run(['git', 'show', h + ':index.html'], cwd=ROOT, capture_output=True, check=True).stdout.decode('utf-8')
    d = os.path.join(BW, 'pages', h); os.makedirs(d, exist_ok=True); p = os.path.join(d, 'index.html')
    if not os.path.exists(p): open(p, 'w', encoding='utf-8', newline='').write(page)
    return h, p

# ---------------------------------------------------------------------------------------------------------------------------
def tool_json(d, tool): return os.path.join(d, '%s.v%d.json' % (tool, BATTERY_VERSION))

def chunks(lst, n): return [lst[i:i + n] for i in range(0, len(lst), n)]

def measure_clip(R, label, d, spec, tools, keep, force):
    """Frames from spec (footage or clean render) into d/frames, then every tool in tools; one JSON per tool in d."""
    os.makedirs(d, exist_ok=True); log = os.path.join(d, 'log.txt')
    need = [t for t in tools if force or not os.path.exists(tool_json(d, t))]
    if not need: return
    fr = os.path.join(d, 'frames'); kinds = sorted({FRAMES_FOR_TOOL[t] for t in need})
    if os.path.exists(fr): shutil.rmtree(fr)
    os.makedirs(fr)
    spec = dict(spec, kinds=kinds); sp = os.path.join(d, 'spec.json'); json.dump(spec, open(sp, 'w'), indent=1)
    t0 = time.time(); say('start', label, '(%s)' % ', '.join(need))
    R.run('render' if spec['source'] == 'clean' else 'decode', PY + [os.path.join(HERE, 'battery_frames.py'), 'extract', fr, sp], log,
          browser=spec['source'] == 'clean')
    # background removal (bgremove.py), in chunks of 40 frames in parallel
    jobs = []
    for src, dst in (('stills', 'wstills'), ('motion', 'wmotion')):
        files = sorted(glob.glob(os.path.join(fr, src, '*.png')))
        if files and any(FRAMES_FOR_TOOL[t] == ('still' if src == 'stills' else 'motion') for t in need):
            jobs += [(dst, c) for c in chunks(files, 40)]
    with ThreadPoolExecutor(max(1, len(jobs))) as ex:
        list(ex.map(lambda j: R.run('bgremove', PY + [os.path.join(HERE, 'bgremove.py'), os.path.join(fr, j[0])] + j[1], log), jobs))
    stills = sorted(glob.glob(os.path.join(fr, 'stills', '*.png'))); wst = sorted(glob.glob(os.path.join(fr, 'wstills', '*.png')))
    def one(t):
        out = tool_json(d, t)
        if t == 'spec46': R.run(t, PY + [os.path.join(HERE, 'spec46.py')] + wst + ['--json', out], log)
        elif t == 'fill': R.run(t, PY + [os.path.join(HERE, 'fill.py'), 'S=' + ','.join(wst), '--json', out], log)
        elif t == 'spec46m': R.run(t, PY + [os.path.join(HERE, 'spec46m.py'), os.path.join(fr, 'wmotion'), '10', '--json', out], log)
        elif t == 'motion2': R.run(t, PY + [os.path.join(HERE, 'motion2.py'), os.path.join(fr, 'wmotion'), '10', '--json', out], log)
        elif t == 'thick': R.run(t, PY + [os.path.join(HERE, 'thick.py'), os.path.join(fr, 'wmotion'), '--json', out], log)
        elif t == 'sparks': R.run(t, PY + [os.path.join(HERE, 'sparks.py'), os.path.join(fr, 'spark'), '30', '--hp', '--json', out], log)
        elif t == 'bgprep':
            R.run(t, PY + [os.path.join(HERE, 'battery_frames.py'), 'bgprep', fr], log)
            shutil.copy(os.path.join(fr, 'bgest.npz'), os.path.join(d, 'bgest.npz'))
            json.dump({'npz': 'bgest.npz'}, open(out, 'w'))
        elif t in ('cycle', 'bgregions'):
            R.run(t, PY + [os.path.join(HERE, 'battery.py'), '--_still-measure', t, out] + stills, log)
    with ThreadPoolExecutor(len(need)) as ex:
        for f in [ex.submit(one, t) for t in need]: f.result()
    # keep the stills (small, for looking) and drop the rest of the frames
    if stills:
        os.makedirs(os.path.join(d, 'stills'), exist_ok=True)
        for s in stills: shutil.copy(s, os.path.join(d, 'stills', os.path.basename(s)))
    if not keep: shutil.rmtree(fr, ignore_errors=True)
    say('done ', label, '%.0f s' % (time.time() - t0))

def still_measure(tool, out, files):
    """cycle.py's band brightness, or bgcompare.py's regions, per still (run as a subprocess by measure_clip)."""
    sys.path.insert(0, HERE)
    if tool == 'cycle':
        from cycle import stats
        per = [dict(zip(('peak', 'mean'), map(float, stats(f)))) for f in files]
    else:
        from bgcompare import regions
        per = []
        for f in files:
            a = regions(f); r = {}
            for i, rn in enumerate(('top', 'bottom')):
                for j, cn in enumerate(('left', 'right')):
                    for k, ch in enumerate('RGB'): r['%s_%s_%s' % (rn, cn, ch)] = float(a[i, j, k])
            per.append(r)
    json.dump({'frames': files, 'per_frame': per}, open(out, 'w'), indent=1)

def clip_values(d):
    """-> {measure name: value} for one measured clip directory (NaN where a tool is missing or gave none)."""
    J = {}
    for t in FRAMES_FOR_TOOL:
        p = tool_json(d, t)
        if os.path.exists(p): J[t] = json.load(open(p))
    v = {}
    for m in M:
        t, k = m['tool'], m['key']; x = float('nan')
        if t in J:
            j = J[t]
            if t in ('spec46', 'cycle', 'bgregions'):
                per = j['per_frame']
                if t == 'spec46':
                    for q in per: q['centre_range'] = q['centre_max'] - q['centre_min']; q['tilt_abs'] = abs(q['tilt'])
                arr = np.array([q.get(k, np.nan) for q in per], dtype=float); arr = arr[~np.isnan(arr)]
                if len(arr): x = float(np.median(arr) if t == 'spec46' else np.mean(arr))
            elif t == 'fill':
                arr = np.array([q[k] for q in j['S']], dtype=float); arr = arr[~np.isnan(arr)]
                if len(arr): x = float(np.median(arr))
            elif t == 'thick':
                th = np.array(j['thick'], dtype=float); cen = np.array(j['centre'], dtype=float)
                x = {'th_med': np.nanmedian(th), 'th_min': np.nanmin(th), 'th_max': np.nanmax(th), 'cen_range': np.nanmax(cen) - np.nanmin(cen)}[k]
            else:
                x = j.get(k, float('nan'))
        v[m['name']] = float(x) if x is not None else float('nan')
    return v

def bg_compare(da, db):
    """Pixel comparison of two clips' background estimates (b minus a), the wave masked out with both clips' masks."""
    A = np.load(os.path.join(da, 'bgest.npz')); B = np.load(os.path.join(db, 'bgest.npz'))
    keep = ~(A['mask'] | B['mask']); diff = B['bg'] - A['bg']; H, W = keep.shape; out = {}
    rows = {'all': slice(0, H), 'top': slice(0, H // 3), 'middle': slice(H // 3, 2 * H // 3), 'bottom': slice(2 * H // 3, H)}
    cols = {'left': slice(0, W // 3), 'centre': slice(W // 3, 2 * W // 3), 'right': slice(2 * W // 3, W)}
    for r in REGIONS:
        rs, cs = (rows['all'], slice(0, W)) if r == 'all' else (rows[r.split('_')[0]], cols[r.split('_')[1]])
        k = keep[rs, cs]; e = {'n': {'share': float(k.mean())}}
        for c, ch in enumerate('RGB'):
            x = diff[rs, cs, c][k]
            if x.size < 20: e[ch] = {s: float('nan') for s in ('mean', 'absmean', 'p50', 'p90', 'p99')}; continue
            ax = np.abs(x)
            e[ch] = {'mean': float(x.mean()), 'absmean': float(ax.mean()), 'p50': float(np.percentile(ax, 50)),
                     'p90': float(np.percentile(ax, 90)), 'p99': float(np.percentile(ax, 99))}
        out[r] = e
    return out

def summ(vals):
    a = np.array([x for x in vals if x is not None and not np.isnan(x)], dtype=float)
    if not len(a): return {'median': None, 'lo': None, 'hi': None, 'n': 0}
    return {'median': float(np.median(a)), 'lo': float(a.min()), 'hi': float(a.max()), 'n': int(len(a))}

def within(o, nz, c):
    if c['median'] is None: return False
    rngs = [r for r in (o, nz) if r and r.get('n') and r['lo'] is not None]
    if not rngs: return False
    r = max(rngs, key=lambda r: r['hi'] - r['lo'])
    return bool(r['lo'] - 1e-12 <= c['median'] <= r['hi'] + 1e-12)

def fmt(x):
    if x is None: return '-'
    a = abs(x)
    return '%.0f' % x if a >= 100 else '%.1f' % x if a >= 10 else '%.3g' % x

# ---------------------------------------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog='\n\n'.join(__doc__.split('\n\n')[1:]))
    ap.add_argument('--commit', default='HEAD', help="revision whose committed index.html is measured, or 'worktree' (default HEAD)")
    ap.add_argument('--lanes', default=','.join(LANES), help='comma-separated subset of %s (default all)' % ','.join(LANES))
    ap.add_argument('--index', default=r'C:\xmb-share\footage\INDEX.json', help='footage index (default %(default)s)')
    ap.add_argument('--out', help='output directory (default work/battery/out/<commit>/)')
    ap.add_argument('--clips', help='only clips whose id matches this regular expression (ids look like recording_2026-10-15_120000_t40_10s_c0_1920x1080)')
    ap.add_argument('--seed', type=int, default=1, help='seed for the clean render where the clip has none (default 1)')
    ap.add_argument('--browsers', type=int, default=8, help='headless browsers at once (default 8)')
    ap.add_argument('--procs', type=int, default=16, help='Python processes at once (default 16)')
    ap.add_argument('--cpu', action='store_true', help='render with SwiftShader instead of the GPU (cached separately)')
    ap.add_argument('--no-clean-noise', action='store_true', help='do not render the clean build at the noise clips\' conditions')
    ap.add_argument('--footage-only', action='store_true', help='measure the footage only')
    ap.add_argument('--force', action='store_true', help='ignore cached results for the selected clips')
    ap.add_argument('--keep-frames', action='store_true', help='keep the extracted frames (several hundred MB per clip)')
    ap.add_argument('--_still-measure', nargs='+', help=argparse.SUPPRESS)
    a = ap.parse_args()
    if a._still_measure: return still_measure(a._still_measure[0], a._still_measure[1], a._still_measure[2:])
    T0 = time.time()
    lanes = [l.strip() for l in a.lanes.split(',') if l.strip()]
    bad = [l for l in lanes if l not in LANES]
    if bad: ap.error('unknown lane(s): %s' % ', '.join(bad))
    tools = sorted({t for l in lanes for t in TOOLS_FOR_LANE[l]})
    idx = json.load(open(a.index))['clips']
    clips = [c for c in idx if not c.get('heldout')]
    for c in clips: c['_id'] = clip_id(c)
    seen = {}
    for c in clips:  # unique ids
        n = seen.get(c['_id'], 0); seen[c['_id']] = n + 1
        if n: c['_id'] += '_%d' % n
    if a.clips: clips = [c for c in clips if re.search(a.clips, c['_id'])]
    if not clips: sys.exit('no clips selected')
    t = time.time(); commit, page = (resolve_page(a.commit) if not a.footage_only else ('footage-only', None)); timed('setup', time.time() - t)
    say('battery v%d: commit %s, lanes %s, %d clips (%d held out), tools %s' % (BATTERY_VERSION, commit, ','.join(lanes), len(clips),
        sum(1 for c in idx if c.get('heldout')), ' '.join(tools)))
    R = Runner(a.procs, a.browsers)
    tasks = []  # (label, dir, spec)
    conds = {}
    for c in clips:
        sig = hashlib.sha1(('%s|%s|%s' % (c['path'], os.path.getsize(c['path']), int(os.path.getmtime(c['path'])))).encode()).hexdigest()[:8]
        c['_dir'] = os.path.join(BW, 'footage', c['_id'] + '_' + sig)
        tasks.append(('footage ' + c['_id'], c['_dir'], {'source': 'footage', 'path': c['path'], 'seconds': c['seconds'], 'fps': c.get('fps')}))
        if a.footage_only or (c['kind'] == 'noise' and a.no_clean_noise): c['_cdir'] = None; continue
        cd = cond_of(c, a.seed); ck = cond_key(cd, a.cpu); c['_cdir'] = os.path.join(BW, 'clean', commit, ck)
        if ck not in conds:
            w, h = (int(x) for x in cd['size'].split('x'))
            conds[ck] = (c['_cdir'], {'source': 'clean', 'page': page, 'cpu': a.cpu, 'since_start_s': cd['since_start_s'], 'seconds': cd['seconds'],
                                      'fps': cd['fps'], 'opts': {'time': '%sT%s' % (cd['date'], cd['time']), 'theme': int(cd['colour']),
                                                                 'seed': int(cd['seed']), 'w': w, 'h': h}})
    tasks = [('clean ' + k, d, s) for k, (d, s) in conds.items()] + tasks   # renders first: they are the long pole
    errors = []
    def go(tk):
        try: measure_clip(R, tk[0], tk[1], tk[2], tools, a.keep_frames, a.force)
        except Exception as e:
            errors.append((tk[0], str(e))); say('FAILED', tk[0], e); traceback.print_exc()
    t = time.time()
    with ThreadPoolExecutor(max(1, len(tasks))) as ex: list(ex.map(go, tasks))
    timed('measure (wall)', time.time() - t)

    # ---- collect
    t = time.time()
    orig = [c for c in clips if c['kind'] != 'noise']; noise = [c for c in clips if c['kind'] == 'noise']
    groups = {noise_group(c) for c in orig}
    noise_m = [c for c in noise if noise_group(c) in groups] if orig else noise
    V = {c['_id']: clip_values(c['_dir']) for c in clips}
    CV = {}
    for c in clips:
        if c.get('_cdir') and os.path.isdir(c['_cdir']): CV[c['_cdir']] = clip_values(c['_cdir'])
    names = [m['name'] for m in M if m['lane'] in lanes]
    measures = []
    clean_dirs = list(dict.fromkeys(c['_cdir'] for c in orig if c.get('_cdir')))
    for m in M:
        if m['lane'] not in lanes: continue
        nm = m['name']
        o = summ([V[c['_id']][nm] for c in orig]); cl = summ([CV[d][nm] for d in clean_dirs if d in CV])
        e = {'name': nm, 'lane': m['lane'], 'unit': m['unit'], 'method': m['method'], 'original': o}
        if noise_m:
            nz = summ([V[c['_id']][nm] for c in noise_m]); e['noise'] = {'lo': nz['lo'], 'hi': nz['hi'], 'n': nz['n']}
        e['clean'] = cl; e['within'] = within(o, e.get('noise'), cl); measures.append(e)
    # pixel comparison of the background
    bgpix = {'clean_vs_footage': {}, 'noise_pairs': {}}
    if 'background' in lanes:
        for c in orig:
            if c.get('_cdir') and os.path.exists(os.path.join(c['_cdir'], 'bgest.npz')) and os.path.exists(os.path.join(c['_dir'], 'bgest.npz')):
                bgpix['clean_vs_footage'][c['_id']] = bg_compare(c['_dir'], c['_cdir'])
        by = {}
        for c in noise_m: by.setdefault(noise_group(c), []).append(c)
        for g, cs in by.items():
            cs = [c for c in cs if os.path.exists(os.path.join(c['_dir'], 'bgest.npz'))]
            for i in range(len(cs)):
                for j in range(i + 1, min(len(cs), i + 1 + 10)):   # each clip against up to 10 others
                    bgpix['noise_pairs']['%s | %s' % (cs[i]['_id'], cs[j]['_id'])] = bg_compare(cs[i]['_dir'], cs[j]['_dir'])
        for pm in PIXEL_MEASURES:
            r, ch, st = pm['key']; get = lambda e: e[r][ch][st]
            cl = summ([get(e) for e in bgpix['clean_vs_footage'].values()])
            n0 = len(bgpix['clean_vs_footage']) or len(orig)
            o = {'median': 0.0, 'lo': 0.0, 'hi': 0.0, 'n': n0}
            e = {'name': pm['name'], 'lane': 'background', 'unit': pm['unit'], 'method': pm['method'], 'original': o}
            if bgpix['noise_pairs']:
                nz = summ([get(x) for x in bgpix['noise_pairs'].values()])
                if st == 'mean':  # signed: the spread is symmetric (either clip of a pair could come first)
                    m_ = max(abs(nz['lo']), abs(nz['hi'])) if nz['n'] else None; nz['lo'], nz['hi'] = (-m_, m_) if m_ is not None else (None, None)
                e['noise'] = {'lo': nz['lo'], 'hi': nz['hi'], 'n': nz['n']}
            e['clean'] = cl; e['within'] = within(o, e.get('noise'), cl); measures.append(e)
    # noise sets: the spread of every measure
    noise_out = {}
    for g in sorted({noise_group(c) for c in noise}):
        cs = [c for c in noise if noise_group(c) == g]; e = {'clips': [c['_id'] for c in cs], 'measures': {}, 'clean': {}}
        for nm in names:
            a_ = np.array([V[c['_id']][nm] for c in cs], dtype=float); a_ = a_[~np.isnan(a_)]
            if len(a_): e['measures'][nm] = {'min': float(a_.min()), 'median': float(np.median(a_)), 'max': float(a_.max()), 'std': float(a_.std()), 'n': int(len(a_))}
            b_ = np.array([CV[c['_cdir']][nm] for c in cs if c.get('_cdir') in CV], dtype=float); b_ = b_[~np.isnan(b_)]
            if len(b_): e['clean'][nm] = {'min': float(b_.min()), 'median': float(np.median(b_)), 'max': float(b_.max()), 'std': float(b_.std()), 'n': int(len(b_))}
        noise_out[g] = e
    timed('collect', time.time() - t)

    out = a.out or os.path.join(BW, 'out', commit); os.makedirs(out, exist_ok=True)
    metrics = {'commit': commit, 'lanes': lanes, 'measures': measures, 'visible_gaps': []}
    json.dump(metrics, open(os.path.join(out, 'metrics.json'), 'w'), indent=1)
    json.dump({'battery_version': BATTERY_VERSION, 'commit': commit, 'renderer': 'swiftshader' if a.cpu else 'gpu (ANGLE d3d11)',
               'clips': [{'id': c['_id'], 'kind': c['kind'], 'condition': {k: c.get(k) for k in ('date', 'time', 'since_start_s', 'seconds', 'size', 'colour', 'seed', 'fps')},
                          'path': c['path'], 'original': {n: V[c['_id']][n] for n in names},
                          'clean': {n: CV[c['_cdir']][n] for n in names} if c.get('_cdir') in CV else None,
                          'clean_dir': c.get('_cdir'), 'footage_dir': c['_dir']} for c in clips]},
              open(os.path.join(out, 'clips.json'), 'w'), indent=1)
    if 'background' in lanes: json.dump(bgpix, open(os.path.join(out, 'bgpixel.json'), 'w'), indent=1)
    json.dump(noise_out, open(os.path.join(out, 'noise.json'), 'w'), indent=1)
    TIMES['total (wall)'] = [time.time() - T0, 1]
    json.dump({k: {'seconds': round(v[0], 2), 'count': v[1]} for k, v in TIMES.items()}, open(os.path.join(out, 'timings.json'), 'w'), indent=1)
    # table
    L = ['battery v%d  commit %s  lanes %s  clips: %d original, %d noise; clean conditions %d%s' % (BATTERY_VERSION, commit, ','.join(lanes),
         len(orig), len(noise_m), len(clean_dirs), '' if not errors else '  ERRORS: %d' % len(errors)),
         '%-38s %-10s %-26s %-18s %-26s %s' % ('measure', 'lane', 'original median [lo-hi] n', 'noise [lo-hi] n', 'clean median [lo-hi] n', 'within')]
    for e in measures:
        o, c = e['original'], e['clean']; nz = e.get('noise')
        L.append('%-38s %-10s %-26s %-18s %-26s %s' % (e['name'], e['lane'], '%s [%s-%s] %d' % (fmt(o['median']), fmt(o['lo']), fmt(o['hi']), o['n']),
                 '%s-%s %d' % (fmt(nz['lo']), fmt(nz['hi']), nz['n']) if nz else '-', '%s [%s-%s] %d' % (fmt(c['median']), fmt(c['lo']), fmt(c['hi']), c['n']),
                 'yes' if e['within'] else 'NO'))
    L.append('within: %d of %d measures' % (sum(e['within'] for e in measures), len(measures)))
    L.append('timings (s; each part summed over its processes (count), wall-clock where marked): ' + ', '.join('%s %.1f%s' % (k, v[0], '' if 'wall' in k else ' (x%d)' % v[1]) for k, v in TIMES.items()))
    for lab, err in errors: L.append('ERROR %s: %s' % (lab, err))
    open(os.path.join(out, 'summary.txt'), 'w').write('\n'.join(L) + '\n')
    print('\n'.join(L)); print('wrote', out)
    if errors: sys.exit(1)

if __name__ == '__main__':
    main()
