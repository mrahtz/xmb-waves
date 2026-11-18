# looksweep.py: the look lane's band-structure measures, mood by mood, for a list of variants, with real GPU renders.
# usage:
#   python3 looksweep.py OUT.json NAME=edit,edit ... [--seed 1] [--procs 4] [--times 1,5,9]
#   python3 looksweep.py footage OUT.json [--procs 4]           (the footage's own figures by the same code)
#   python3 looksweep.py table OUT.json [OUT2.json ...]         (the per-mood table, side by side)
# A variant is 'NAME=key=value,key=value' in mkvar.py's keys ('NAME=' alone is the current sources unchanged).
# Each variant is rendered at the four mood holds of the footage index - 15 January 00:00 (night), 15 April 06:00 (dawn),
# 15 October 12:00 (day), 15 July 18:00 (dusk), 40 s after the start, 1920 x 1080, every layer on - at the battery's own
# still times, and measured exactly as the battery measures its stills: bgremove.wave, then spec46.analyse, fill.measure
# and cycle.stats, with skirt.moment beside them. So these figures are the battery's own, restricted to one condition per
# mood, and the footage column is the median over that condition's recording and its lossless render.
# Spec 4.5 (version 36) is what this is for: it tells apart three faults from the band's fill, its face level, its
# fold-to-face ratio and the number and length of its partings, kept apart by mood, and it prices the three mechanisms
# that move them. The skirt columns are the faint light just outside the band, which version 36 says to measure mood by
# mood before moving any of the three.
import sys, os, json, subprocess
from concurrent.futures import ThreadPoolExecutor
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import bgremove, spec46, fill, cycle, skirt, bandcolour

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('MEASURE_WORK', os.path.join(HERE, 'work'))
INDEX = os.environ.get('FOOTAGE_INDEX', r'C:\xmb-share\footage\INDEX.json')
# one condition per mood: the mood holds of the measured index, at 40 s after the start
CONDS = [('night', '2026-01-15', '00:00:00'), ('dawn', '2026-04-15', '06:00:00'),
         ('day', '2026-10-15', '12:00:00'), ('dusk', '2026-07-15', '18:00:00')]
# the battery's own names for the measures this lane reads, with the spec46 key each comes from
SPEC46 = [('face_level_median', 'face_med'), ('face_level_p90', 'face_p90'), ('fold_over_face_median', 'foldface_med'),
          ('partings_per_column', 'partcol'), ('partings_length_median', 'partings_len_med'), ('peaks12_mean', 'peaks12'),
          ('peaks25_mean', 'peaks25'), ('line_width_median', 'width_lines'), ('brightest_line_width', 'bwidth'),
          ('sheen_width_median', 'width_sheen'), ('line_peak_over_band_median', 'linepk'), ('edge_rise_median', 'edge_med'),
          ('edge_rise_p90', 'edge_p90'), ('thickness_median', 'thick_med')]
KEYS = ([k for k, _ in SPEC46] + ['fill_above_40pct', 'fill_mean_over_max', 'fill_dark_below_8pct',
        'band_peak_over_background', 'band_mean_over_background', 'skirt_1_10', 'skirt_11_25', 'skirt_26_60',
        'skirt_rel_1_10'])


def opt(a, k, d):
    return a[a.index(k) + 1] if k in a else d


def measure(frames):
    """The battery's still measures on 8-bit RGB frames, with skirt.py's light outside the band beside them."""
    rows = []
    for f in frames:
        w = bgremove.wave(f)
        spec46.analyse(Image.fromarray(w))
        n = spec46.analyse.num
        a40, a25, mean, dark = fill.measure(Image.fromarray(w))
        pk, mn = cycle.stats(Image.fromarray(np.asarray(f)))
        r = {k: float(n[s]) for k, s in SPEC46}
        r.update({'fill_above_40pct': float(a40), 'fill_above_25pct': float(a25), 'fill_mean_over_max': float(mean),
                  'fill_dark_below_8pct': float(dark), 'band_peak_over_background': float(pk),
                  'band_mean_over_background': float(mn)})
        r.update(skirt.moment(f))
        rows.append(r)
    return {k: float(np.median([r[k] for r in rows])) for k in rows[0]}


def footage_clips(date, time_):
    return [c for c in json.load(open(INDEX))['clips']
            if c['date'] == date and c['time'] == time_ and c['since_start_s'] == 40 and c['kind'] in ('recording', 'render')]


def render(page, date, time_, times, seed, w=1920, h=1080):
    o = {'time': date + 'T' + time_, 'seed': seed, 'w': w, 'h': h, 'theme': 0}
    frames = [60 * 40 + int(round(60 * t)) for t in times]
    r = subprocess.run(['node', os.path.join(HERE, 'battery_render.js'), page, json.dumps(o), ','.join(map(str, frames))],
                       capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr.decode()[-900:])
    a = np.frombuffer(r.stdout, np.uint8); n = w * h * 3
    return [a[i * n:(i + 1) * n].reshape(h, w, 3) for i in range(len(frames))]


def main():
    a = sys.argv[1:]
    if a[0] == 'table':
        outs = [(os.path.basename(p)[:-5], json.load(open(p))) for p in a[1:]]
        print('%-28s %-6s' % ('measure', 'mood') + ''.join('%14s' % n[-14:] for n, _ in outs))
        for k in KEYS:
            for m, _, _ in CONDS:
                row = ''
                for _, J in outs:
                    v = J.get(m, {}).get(k)
                    row += '%14.3f' % v if v is not None else '%14s' % '-'
                print('%-28s %-6s' % (k, m) + row)
            print()
        return
    times = [float(x) for x in opt(a, '--times', '1,5,9').split(',')]
    procs = int(opt(a, '--procs', 4)); seed = int(opt(a, '--seed', 1))
    pos = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or a[i - 1] not in ('--seed', '--procs', '--times'))]
    if pos[0] == 'footage':
        outf = pos[1]

        def runf(c):
            mood, date, time_ = c
            rows = [measure(list(bandcolour.vframes(cl['path'], times))) for cl in footage_clips(date, time_)]
            return mood, {k: float(np.median([r[k] for r in rows])) for k in rows[0]}
        out = {}
        with ThreadPoolExecutor(procs) as ex:
            for mood, r in ex.map(runf, CONDS):
                out[mood] = r
                print('%-14s %-6s' % ('footage', mood) + ' '.join('%s %.3f' % (k, r[k]) for k in KEYS if k in r), flush=True)
        json.dump(out, open(outf, 'w'))
        return
    outf, variants = pos[0], pos[1:]
    for v in variants:
        name, _, edits = v.partition('=')
        eds = [e for e in edits.split(',') if e]
        subprocess.run([sys.executable, os.path.join(HERE, 'mkvar.py'), name] + eds, check=True, stdout=subprocess.DEVNULL)
        page = os.path.join(WORK, 'var_%s.html' % name)

        def runb(c):
            mood, date, time_ = c
            return mood, measure(render(page, date, time_, times, seed))
        out = {}
        with ThreadPoolExecutor(min(procs, 4)) as ex:
            for mood, r in ex.map(runb, CONDS):
                out[mood] = r
                print('%-14s %-6s' % (name, mood) + ' '.join('%s %.3f' % (k, r[k]) for k in KEYS if k in r), flush=True)
        p = outf if len(variants) == 1 else outf.replace('.json', '_%s.json' % name)
        json.dump(out, open(p, 'w'))
        print('wrote', p, flush=True)


if __name__ == '__main__':
    main()
