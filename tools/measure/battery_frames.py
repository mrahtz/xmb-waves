# usage: python3 battery_frames.py extract OUTDIR SPEC.json   -> the frames the battery measures, from footage or a clean render
#        python3 battery_frames.py bgprep OUTDIR                  -> the clip's background estimate and wave mask (bgest.npz)
# Part of battery.py (see README.md, "The fixed battery"); not normally run by hand.
#
# SPEC.json: {"source": "footage", "path": CLIP, "seconds": S, "fps": F}
#        or  {"source": "clean", "page": PAGE, "opts": {time, theme, seed, w, h}, "since_start_s": T0, "seconds": S, "cpu": false}
#
# Frames are taken at times t = k / 30 s from the clip's first frame (footage: frame round(t * F); clean: simulation frame
# 60 * T0 + round(60 * t), spec section 9) and written as PNG:
#   stills/tSS.png   full size RGB at t = 1, 5, 9, ... s (every 4 s from 1 s)
#   motion/NNNN.png  full size RGB at 10 fps over the whole clip
#   spark/NNNN.png   RGB scaled to 720 px high (Lanczos) at 30 fps over the first 8 s
# Footage is decoded with ffmpeg to 8-bit RGB: H.264 (YUV) through the colour matrix and range the stream is tagged with
# (BT.709 limited range when untagged), which is what a plain `ffmpeg -i clip.mp4 frame%04d.png` does with these files;
# RGB sources (the lossless clip.mkv renders) are converted to rgb24 without any matrix.
import os, sys, json, subprocess, threading, queue
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
    S = float(spec['seconds'])
    if spec['source'] == 'footage':
        st = probe(spec['path'])
        if not spec.get('fps'):  # not in the index: the stream's own frame rate
            n_, d_ = st.get('r_frame_rate', '60/1').split('/'); spec['fps'] = float(n_) / float(d_ or 1)
    fps = float(spec.get('fps') or 60)
    if spec['source'] == 'footage':
        nb = int(st['nb_frames']) if str(st.get('nb_frames', '')).isdigit() else int(S * fps)
        S = min(S, nb / fps)
    P = plan(S, fps, spec.get('kinds', ('motion', 'spark', 'still')))
    if spec['source'] == 'footage':
        idx = [min(int(round(t * fps)), nb - 1) for k, t, kinds in P]; gen = footage_frames(spec['path'], sorted(set(idx)))
    else:
        t0 = int(round(60 * float(spec.get('since_start_s', 0))))
        idx = [t0 + int(round(60 * t)) for k, t, kinds in P]; gen = clean_frames(spec, sorted(set(idx)))
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

if __name__ == '__main__':
    cmd, out = sys.argv[1], sys.argv[2]
    if cmd == 'extract': extract(out, json.load(open(sys.argv[3])))
    elif cmd == 'bgprep': bgprep(out)
    else: sys.exit('unknown command ' + cmd)
