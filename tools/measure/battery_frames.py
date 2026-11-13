# usage: python3 battery_frames.py measure OUTDIR SPEC.json   -> what battery.py runs per clip: every tool on the frames, in memory
#        python3 battery_frames.py extract OUTDIR SPEC.json   -> the frames the battery measures, as PNG files (for looking)
#        python3 battery_frames.py bgprep OUTDIR                  -> the background estimate and wave mask (bgest.npz) from
#                                                                    OUTDIR/motion and OUTDIR/wmotion (bgremove.py's output)
# Part of battery.py (see README.md, "The fixed battery"); not normally run by hand.
#
# SPEC.json: {"source": "footage", "path": CLIP, "seconds": S, "fps": F}
#        or  {"source": "clean", "page": PAGE, "opts": {time, theme, seed, w, h}, "since_start_s": T0, "seconds": S, "cpu": false}
#        (measure: also "tools": [...], the tools to run, and "keep": true to write the frames as PNG too)
#
# Frames are taken at times t = k / 30 s from the clip's first frame (footage: frame round(t * F); clean: simulation frame
# 60 * T0 + round(60 * t), spec section 9):
#   stills/tSS.png   full size RGB at t = 1, 5, 9, ... s (every 4 s from 1 s)
#   motion/NNNN.png  full size RGB at 10 fps over the whole clip
#   spark/NNNN.png   RGB scaled to 720 px high (Lanczos) at 30 fps over the first 8 s
# `measure` keeps them in memory (and the stills as PNG, for looking); PNG is lossless, so the tools see the same 8-bit
# arrays as from the files.
# Footage is decoded with ffmpeg to 8-bit RGB: H.264 (YUV) through the colour matrix and range the stream is tagged with
# (BT.709 limited range when untagged), which is what a plain `ffmpeg -i clip.mp4 frame%04d.png` does with these files;
# RGB sources (the lossless clip.mkv renders) are converted to rgb24 without any matrix.
import os, sys, json, time, uuid, subprocess, threading, queue
import numpy as np
from PIL import Image

SPARK_S, STILL_EVERY, STILL_FROM = 8.0, 4, 1

def plan(seconds, fps, want=('motion', 'spark', 'still')):
    """-> list of (k, t, kinds) for the 30 fps sample times that are measured (only the kinds in want)."""
    out = []
    for k in range(int(round(seconds * 30 + 1e-6))):
        t = k / 30.0; kinds = []
        if k % 3 == 0 and 'motion' in want: kinds.append('motion')
        if t < SPARK_S - 1e-9 and 'spark' in want: kinds.append('spark')
        if k % 30 == 0 and k // 30 >= STILL_FROM and (k // 30 - STILL_FROM) % STILL_EVERY == 0 and 'still' in want: kinds.append('still')
        if kinds: out.append((k, t, kinds))
    return out

def probe(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                        'stream=width,height,pix_fmt,color_space,color_range,r_frame_rate,nb_frames', '-of', 'json', path],
                       capture_output=True, text=True, check=True)
    return json.loads(r.stdout)['streams'][0]

def footage_frames(path, wanted):
    """Yield (index, rgb array) for the wanted frame indices (sorted), decoding the whole clip once."""
    st = probe(path); w, h = int(st['width']), int(st['height']); pf = st.get('pix_fmt', '')
    if pf.startswith(('yuv', 'yuvj', 'nv')):
        cs = st.get('color_space') if st.get('color_space') in ('bt709', 'bt470bg', 'smpte170m', 'bt2020nc', 'fcc', 'smpte240m') else 'bt709'
        rng = 'pc' if (st.get('color_range') == 'pc' or pf.startswith('yuvj')) else 'tv'
        vf = 'scale=in_color_matrix=%s:in_range=%s:out_range=pc,format=rgb24' % ({'bt470bg': 'bt601', 'smpte170m': 'bt601', 'bt2020nc': 'bt2020'}.get(cs, cs), rng)
    else:
        vf = 'format=rgb24'
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', path, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    sz = w * h * 3; want = set(wanted); i = 0; last = max(wanted)
    try:
        while i <= last:
            b = p.stdout.read(sz)
            if len(b) < sz: break
            if i in want: yield i, np.frombuffer(b, np.uint8).reshape(h, w, 3)
            i += 1
    finally:
        p.stdout.close(); p.kill(); p.wait()

def clean_frames(spec, simframes):
    o = spec['opts']; w, h = int(o['w']), int(o['h']); sz = w * h * 3
    here = os.path.dirname(os.path.abspath(__file__))
    lst = os.path.join(spec['_out'], 'frames.txt'); open(lst, 'w').write('\n'.join(str(f) for f in simframes))
    cmd = ['node', os.path.join(here, 'battery_render.js'), spec['page'], json.dumps(o), '@' + lst] + (['--cpu'] if spec.get('cpu') else [])
    err = open(os.path.join(spec['_out'], 'render.log'), 'w')
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err)
    n = 0
    for f in simframes:
        b = p.stdout.read(sz)
        if len(b) < sz: break
        yield f, np.frombuffer(b, np.uint8).reshape(h, w, 3); n += 1
    p.stdout.close(); rc = p.wait(); err.close()
    if rc != 0 or n != len(simframes):
        raise RuntimeError('renderer failed (exit %s, %d of %d frames); see %s' % (rc, n, len(simframes), os.path.join(spec['_out'], 'render.log')))

def extract(out, spec):
    spec['_out'] = out
    for d in ('stills', 'motion', 'spark'): os.makedirs(os.path.join(out, d), exist_ok=True)
    P, idx, gen, S, fps = frame_source(spec, spec.get('kinds', ('motion', 'spark', 'still')))
    byidx = {}
    for (k, t, kinds), i in zip(P, idx): byidx.setdefault(i, []).append((k, t, kinds))
    q = queue.Queue(maxsize=32)
    def writer():
        while True:
            it = q.get()
            if it is None: return
            path, im = it; im.save(path, compress_level=1)
    th = [threading.Thread(target=writer) for _ in range(6)]
    for x in th: x.start()
    got = 0
    try:
        for i, a in gen:
            for k, t, kinds in byidx.get(i, []):
                im = Image.fromarray(a.copy())
                if 'motion' in kinds: q.put((os.path.join(out, 'motion', '%04d.png' % (k // 3)), im))
                if 'still' in kinds: q.put((os.path.join(out, 'stills', 't%02d.png' % (k // 30)), im))
                if 'spark' in kinds:
                    H, W = a.shape[:2]; sim = im if H == 720 else im.resize((int(round(W * 720 / H)), 720), Image.LANCZOS)
                    q.put((os.path.join(out, 'spark', '%04d.png' % k), sim))
                got += 1
    finally:
        for _ in th: q.put(None)
        for x in th: x.join()
    json.dump({'seconds': S, 'fps': fps, 'samples': got, 'planned': len(P), 'frame_index': idx}, open(os.path.join(out, 'frames.json'), 'w'))
    if got < len(P):  # footage a few frames shorter than its index entry: measured as far as it goes
        if spec['source'] != 'footage' or got < 0.9 * len(P): raise RuntimeError('only %d of %d frames' % (got, len(P)))
        sys.stderr.write('warning: %d of %d planned frames\n' % (got, len(P)))

def area(a, w=480, h=270):
    import cv2
    return cv2.resize(a.astype(np.float32), (w, h), interpolation=cv2.INTER_AREA)

def bgprep(out):
    """Background estimate and wave mask at 480 x 270 from the 1 fps frames: per pixel the temporal median of the RGB frames
    (removes sparkles and the moving fringes), and the wave mask: the background-removed light (bgremove.py's output in
    wmotion/), each frame through a 5 px median (drops single sparkles), at its maximum over the same frames, smoothed over
    3 px, above 2 levels, grown by 6 px (24 px at 1080p) to cover the glare around the band."""
    import cv2
    from scipy.ndimage import binary_dilation, gaussian_filter, median_filter
    names = sorted(f for f in os.listdir(os.path.join(out, 'motion')) if f.endswith('.png'))[::10]
    rgb = np.stack([area(np.asarray(Image.open(os.path.join(out, 'motion', f)).convert('RGB'))) for f in names])
    wav = np.stack([median_filter(area(np.asarray(Image.open(os.path.join(out, 'wmotion', f)).convert('L'))), 5) for f in names])
    bg = np.median(rgb, axis=0); wmax = gaussian_filter(wav.max(0), 3)
    mask = binary_dilation(wmax > 2.0, iterations=6)
    np.savez_compressed(os.path.join(out, 'bgest.npz'), bg=bg.astype(np.float32), mask=mask, wmax=wmax.astype(np.float32), n=len(names))

# ---------------------------------------------------------------------------------------------------------------------------
# measure: the battery's whole per-clip measurement in one process, on the frames as they arrive (no frame files). It runs the
# same functions of the same tools on the same 8-bit frames as extract + bgremove.py + the tools' command lines on the PNG
# files (PNG is lossless, so the arrays are identical), and writes the same JSON per tool.
STILL_TOOLS, WAVE_STILL_TOOLS, MOTION_TOOLS = ('cycle', 'bgregions'), ('spec46', 'fill'), ('spec46m', 'motion2', 'thick', 'bgprep')

def replace_retry(src, dst):
    """os.replace, retried while a reader in another process has dst open (Windows refuses to replace an open file)."""
    for i in range(40):
        try: return os.replace(src, dst)
        except PermissionError: time.sleep(0.05 * (i + 1))
    os.replace(src, dst)

def write_atomic(path, write, mode='w'):
    """write(f) into path under a temporary name in the same folder, then rename: readers see the whole file or none."""
    tmp = '%s.tmp-%d-%s' % (path, os.getpid(), uuid.uuid4().hex[:8])
    try:
        with open(tmp, mode) as f: write(f)
        replace_retry(tmp, path)
    finally:
        if os.path.exists(tmp): os.remove(tmp)

def json_atomic(obj, path, **kw): write_atomic(path, lambda f: json.dump(obj, f, **kw))

def frame_source(spec, kinds):
    """-> (plan, frame index per planned sample, generator of (index, frame), seconds, fps) for a footage clip or a clean render"""
    S = float(spec['seconds'])
    if spec['source'] == 'footage':
        st = probe(spec['path'])
        if not spec.get('fps'):  # not in the index: the stream's own frame rate
            n_, d_ = st.get('r_frame_rate', '60/1').split('/'); spec['fps'] = float(n_) / float(d_ or 1)
    fps = float(spec.get('fps') or 60)
    if spec['source'] == 'footage':
        nb = int(st['nb_frames']) if str(st.get('nb_frames', '')).isdigit() else int(S * fps)
        S = min(S, nb / fps)
    P = plan(S, fps, kinds)
    if spec['source'] == 'footage':
        idx = [min(int(round(t * fps)), nb - 1) for k, t, kinds_ in P]; gen = footage_frames(spec['path'], sorted(set(idx)))
    else:
        t0 = int(round(60 * float(spec.get('since_start_s', 0))))
        idx = [t0 + int(round(60 * t)) for k, t, kinds_ in P]; gen = clean_frames(spec, sorted(set(idx)))
    return P, idx, gen, S, fps

def prefetch(gen, n=12):
    """Run a frame generator in a thread, n frames ahead, so that decoding or rendering overlaps the measuring."""
    q = queue.Queue(maxsize=n); END = object(); err = []
    def run():
        try:
            for x in gen: q.put(x)
        except BaseException as e: err.append(e)
        finally: q.put(END)
    th = threading.Thread(target=run, daemon=True); th.start()
    while True:
        x = q.get()
        if x is END: break
        yield x
    th.join()
    if err: raise err[0]

def measure(out, spec):
    """The tools in spec['tools'] on one clip (spec as for extract, plus 'tools' and 'keep'); one JSON per tool in out, written
    atomically as '<tool>.json' (and bgest.npz for bgprep, the stills in out/stills/ for looking), plus times.json."""
    import cv2
    from scipy.ndimage import binary_dilation, gaussian_filter, median_filter
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import bgremove, spec46, fill, cycle, bgcompare, spec46m, motion2, thick, sparks
    T = {}; tc = [time.perf_counter()]
    def lap(part):  # time since the last lap, to part
        t = time.perf_counter(); T[part] = T.get(part, 0.0) + t - tc[0]; tc[0] = t
    tools = list(spec['tools']); keep = spec.get('keep'); spec['_out'] = out; os.makedirs(out, exist_ok=True)
    kinds = [k for k, ts in (('motion', MOTION_TOOLS), ('spark', ('sparks',)), ('still', STILL_TOOLS + WAVE_STILL_TOOLS))
             if any(t in tools for t in ts)]
    src = 'render' if spec['source'] == 'clean' else 'decode'
    P, idx, gen, S, fps = frame_source(spec, kinds)
    byidx = {}
    for (k, t, kk), i in zip(P, idx): byidx.setdefault(i, []).append((k, t, kk))
    want_wave_stills = any(t in tools for t in WAVE_STILL_TOOLS)
    stills = []; wst = []; wmo = []; bgrgb = []; bgwav = []; spk = []; got = 0
    if keep:
        fr = os.path.join(out, 'frames')
        for d in ('stills', 'motion', 'spark', 'wstills', 'wmotion'): os.makedirs(os.path.join(fr, d), exist_ok=True)
    lap('setup')
    for i, a in prefetch(gen):
        lap(src)
        for k, t, kk in byidx.get(i, []):
            w = None
            if 'motion' in kk or ('still' in kk and want_wave_stills):
                w = bgremove.wave(a); lap('bgremove')
            if 'motion' in kk:
                if 'bgprep' in tools and len(wmo) % 10 == 0:
                    bgrgb.append(area(a)); bgwav.append(median_filter(area(w), 5)); lap('bgprep')
                wmo.append(w)
                if keep:
                    Image.fromarray(a).save(os.path.join(fr, 'motion', '%04d.png' % (k // 3)), compress_level=1)
                    Image.fromarray(w).save(os.path.join(fr, 'wmotion', '%04d.png' % (k // 3))); lap('keep frames')
            if 'still' in kk:
                stills.append(('t%02d.png' % (k // 30), np.array(a)))
                if want_wave_stills: wst.append(('t%02d.png' % (k // 30), w))
                if keep:
                    Image.fromarray(a).save(os.path.join(fr, 'stills', 't%02d.png' % (k // 30)), compress_level=1)
                    if w is not None: Image.fromarray(w).save(os.path.join(fr, 'wstills', 't%02d.png' % (k // 30)))
                    lap('keep frames')
            if 'spark' in kk:
                im = Image.fromarray(a); H, W = a.shape[:2]
                sim = im if H == 720 else im.resize((int(round(W * 720 / H)), 720), Image.LANCZOS)
                if keep: sim.save(os.path.join(fr, 'spark', '%04d.png' % k), compress_level=1)
                lap('spark scale')
                spk.append(sparks.detect(np.asarray(sim), True)); lap('sparks')
            got += 1
    lap(src)
    if got < len(P):  # footage a few frames shorter than its index entry: measured as far as it goes
        if spec['source'] != 'footage' or got < 0.9 * len(P): raise RuntimeError('only %d of %d frames' % (got, len(P)))
        sys.stderr.write('warning: %d of %d planned frames\n' % (got, len(P)))
    # the stills, for looking
    if stills:
        os.makedirs(os.path.join(out, 'stills'), exist_ok=True)
        for n, a in stills: write_atomic(os.path.join(out, 'stills', n), lambda f: Image.fromarray(a).save(f, format='PNG', compress_level=1), 'wb')
        lap('stills')
    for tool in tools:
        p = os.path.join(out, tool + '.json')
        if tool == 'spec46':
            nums = []
            for n, w in wst: spec46.analyse(Image.fromarray(w)); nums.append(spec46.analyse.num)
            json_atomic({'frames': ['wstills/' + n for n, w in wst], 'per_frame': nums}, p, indent=1)
        elif tool == 'fill':
            r = np.array([fill.measure(Image.fromarray(w)) for n, w in wst])
            json_atomic({'S': [dict(zip(('a40', 'a25', 'mean', 'dark'), map(float, row))) for row in r]}, p, indent=1)
        elif tool == 'cycle':
            per = [dict(zip(('peak', 'mean'), map(float, cycle.stats(Image.fromarray(a))))) for n, a in stills]
            json_atomic({'frames': ['stills/' + n for n, a in stills], 'per_frame': per}, p, indent=1)
        elif tool == 'bgregions':
            per = []
            for n, a in stills:
                g = bgcompare.regions(Image.fromarray(a)); r = {}
                for i_, rn in enumerate(('top', 'bottom')):
                    for j_, cn in enumerate(('left', 'right')):
                        for c_, ch in enumerate('RGB'): r['%s_%s_%s' % (rn, cn, ch)] = float(g[i_, j_, c_])
                per.append(r)
            json_atomic({'frames': ['stills/' + n for n, a in stills], 'per_frame': per}, p, indent=1)
        elif tool == 'spec46m':
            json_atomic(spec46m.json_numbers(spec46m.analyse(wmo, 10.0)), p, indent=1)
        elif tool == 'motion2':
            json_atomic(motion2.analyse(np.stack([motion2.small(w) for w in wmo]), 10.0), p, indent=1)
        elif tool == 'thick':
            th = []; cen = []
            for w in wmo: x, y = thick.frame(w); th.append(x); cen.append(y)
            json_atomic({'thick': np.array(th).tolist(), 'centre': np.array(cen).tolist()}, p)
        elif tool == 'sparks':
            lines = []
            J = sparks.summarise(spk, [fi / 30.0 for fi in range(len(spk))], 720, len(spk), 30.0, out=lambda *x: lines.append(' '.join(map(str, x))))
            json_atomic(J, p, indent=1)
        elif tool == 'bgprep':
            rgb = np.stack(bgrgb); wav = np.stack(bgwav)
            bg = np.median(rgb, axis=0); wmax = gaussian_filter(wav.max(0), 3)
            mask = binary_dilation(wmax > 2.0, iterations=6)
            write_atomic(os.path.join(out, 'bgest.npz'), lambda f: np.savez_compressed(f, bg=bg.astype(np.float32), mask=mask,
                         wmax=wmax.astype(np.float32), n=len(bgrgb)), 'wb')
            json_atomic({'npz': 'bgest.npz'}, p)
        else:
            raise ValueError('unknown tool ' + tool)
        lap(tool)
    json_atomic({'parts': T, 'frames': got, 'pid': os.getpid()}, os.path.join(out, 'times.json'), indent=1)

if __name__ == '__main__':
    cmd, out = sys.argv[1], sys.argv[2]
    if cmd == 'extract': extract(out, json.load(open(sys.argv[3])))
    elif cmd == 'bgprep': bgprep(out)
    elif cmd == 'measure': measure(out, json.load(open(sys.argv[3])))
    else: sys.exit('unknown command ' + cmd)
