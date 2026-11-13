# sparks.py: sparkle statistics of a frame sequence: detection, look classes, colour, and motion from tracks.
# usage: python3 sparks.py DIR FPS [--hp] [--dedupe] [--json OUT]
#   DIR holds the frames in order (png). Without --hp the frames are expected to show the sparkles alone on black
#   (a 'sparkles' layer render); with --hp each frame is high-passed first (frame minus a 15 px median), for footage.
#   --dedupe drops frames that repeat the previous one (clips re-timed to a higher frame rate), keeping true times.
#   --json OUT also writes the numbers. The 15 px median of --hp uses OpenCV when it is installed (on a reflect-padded copy,
#   so the result is identical to scipy's median_filter, about 100 times faster), scipy otherwise.
# Per frame: local maxima above a threshold, each measured at half its peak (area, elongation, colour). Classes: streak
# (elongation >= 2.2), disc (round, half-peak area >= 40 px, i.e. a large soft spot), dot (the rest). Motion: maxima linked
# between consecutive frames by mutual nearest neighbour; tracks of 0.5 s or more give a velocity (straight-line fit),
# tracks of 1.5 s or more an acceleration (quadratic fit). Sizes and speeds are in px at the frames' size, scaled to 1080p.
# (battery.py imports detect() for each frame as it arrives and summarise() at the end; the numbers are the same as from files.)
import sys, os, glob
import numpy as np
from PIL import Image
from scipy import ndimage as nd

try:
    import cv2
except ImportError:
    cv2 = None
THR = 6.0
def median15(a):
    # 15 x 15 median per channel, edges reflected as scipy.ndimage.median_filter's default mode ('reflect': d c b a | a b c d)
    if cv2 is None or a.dtype != np.uint8: return nd.median_filter(a.astype(np.float32), size=(15, 15, 1))
    p = np.pad(a, ((7, 7), (7, 7), (0, 0)), mode='symmetric')
    if a.ndim == 3 and a.shape[2] in (1, 3, 4):  # all channels in one call (each channel's median on its own, as below)
        return cv2.medianBlur(np.ascontiguousarray(p), 15).reshape(p.shape)[7:-7, 7:-7].astype(np.float32)
    return np.stack([cv2.medianBlur(np.ascontiguousarray(p[..., c]), 15)[7:-7, 7:-7] for c in range(a.shape[2])], 2).astype(np.float32)

def detect(a8, hp, a=None):
    """one 8-bit RGB frame -> the sparkles found in it: [(x, y, peak, area, elongation, saturation, class), ...]
    Each local maximum's half-peak region is its 4-connected component of the 49 x 49 window at >= half the peak (OpenCV's
    connected components when installed, scipy's label otherwise: the same pixels); a region that reaches the window's edge
    is part of something larger and is dropped before its shape is measured."""
    if a is None: a = a8.astype(np.float32)
    if hp: a = a - median15(a8)
    g = a.mean(2)
    # 5 x 5 maximum (with OpenCV: its dilation; scipy's reflected edge only repeats pixels already inside the window)
    mx = cv2.dilate(g, np.ones((5, 5), np.uint8)) if cv2 is not None and g.dtype == np.float32 else nd.maximum_filter(g, size=5)
    ys, xs = np.nonzero((g == mx) & (g > THR))
    pts = []
    for y, x in zip(ys, xs):
        p = g[y, x]
        y0, y1, x0, x1 = max(0, y - 24), min(g.shape[0], y + 25), max(0, x - 24), min(g.shape[1], x + 25)
        win = g[y0:y1, x0:x1] >= 0.5 * p
        if cv2 is not None:
            _, lab, st, _ = cv2.connectedComponentsWithStats(win.view(np.uint8), connectivity=4); L = lab[y - y0, x - x0]
            if L == 0: continue
            left, top, wd, ht, area = (int(v) for v in st[L])
            if top == 0 or left == 0 or top + ht == win.shape[0] or left + wd == win.shape[1]: continue  # touches the edge
            m = lab == L
        else:
            lab, _ = nd.label(win); L = lab[y - y0, x - x0]
            if L == 0: continue
            m = lab == L; area = int(m.sum())
        yy, xx = np.nonzero(m)
        touches = yy.min() == 0 or xx.min() == 0 or yy.max() == m.shape[0] - 1 or xx.max() == m.shape[1] - 1
        if touches: continue  # part of something larger than a sparkle (a band line)
        if area >= 3:
            c = np.cov(np.vstack([xx, yy])); ev = np.sort(np.linalg.eigvalsh(c))
            el = float(np.sqrt(max(ev[1], 1e-6) / max(ev[0], 0.08)))
        else: el = 1.0
        rgb = a[y, x]; sat = float((rgb.max() - rgb.min()) / max(rgb.max(), 1e-3))
        cls = 'streak' if el >= 2.2 else ('disc' if area >= 40 else 'dot')
        pts.append((x, y, p, area, el, sat, cls))
    return pts

def summarise(frames_pts, times, Hpx, nfiles, fps, out=print):
    """frames_pts: detect()'s result per kept frame; times: their times (s) -> dict of the numbers (as --json writes them)"""
    J = {}; dets = []; looks = []; sums = []; tops = []
    for pts in frames_pts:
        dets.append(np.array([(q[0], q[1]) for q in pts], dtype=float).reshape(-1, 2))
        looks.extend(pts)
        s = sorted([q[2] for q in pts], reverse=True)
        sums.append(sum(s)); tops.append(np.mean(s[:10]) if s else 0.0)
    sc = 1080.0 / Hpx
    n = np.array([len(x) for x in dets])
    out('%-58s %s' % ('frames, fps; distinct frames, their rate:', '%d, %g; %d, %.1f/s' % (nfiles, fps, len(times), (len(times) - 1) / max(times[-1] - times[0], 1e-6))))
    J.update(n_med=np.median(n), n_p10=np.percentile(n, 10), n_p90=np.percentile(n, 90), rate=(len(times) - 1) / max(times[-1] - times[0], 1e-6))
    out('%-58s %s' % ('sparkles per frame: median, p10-p90:', '%d, %d-%d' % (np.median(n), np.percentile(n, 10), np.percentile(n, 90))))
    if looks: J.update(peak_med=np.median([q[2] for q in looks]), peak_p90=np.percentile([q[2] for q in looks], 90))
    J.update(top10=np.mean(tops), sum_med=np.median(sums))
    out('%-58s %s' % ('peak level: median, p90, brightest 10 per frame (mean):', '%.1f, %.1f, %.1f' % (np.median([q[2] for q in looks]), np.percentile([q[2] for q in looks], 90), np.mean(tops))))
    out('%-58s %s' % ('summed peak levels per frame (median):', '%.0f' % np.median(sums)))
    cl = [q[6] for q in looks]; N = max(len(cl), 1)
    out('%-58s %s' % ('classes: dot / streak / disc share:', '%.2f / %.2f / %.2f' % (cl.count('dot') / N, cl.count('streak') / N, cl.count('disc') / N)))
    br = [q for q in looks if q[2] >= 20]
    J.update(dot=cl.count('dot') / N, streak=cl.count('streak') / N, disc=cl.count('disc') / N, sat_n=len(br))
    if br: J.update(sat_med=np.median([q[5] for q in br]), sat_share=np.mean([q[5] > 0.35 for q in br]))
    out('%-58s %s' % ('colour saturation at the peak: median; share > 0.35 (peak >= 20):', '%.2f; %.2f (n=%d)' % (np.median([q[5] for q in br]) if br else float('nan'), np.mean([q[5] > 0.35 for q in br]) if br else float('nan'), len(br))))
    dsc = [q for q in looks if q[6] == 'disc']
    if dsc: J.update(disc_diam=2 * np.sqrt(np.median([q[3] for q in dsc]) / np.pi) * sc, disc_peak=np.median([q[2] for q in dsc]))
    if dsc: out('%-58s %s' % ('discs: half-peak diameter median (px@1080p), peak median:', '%.1f, %.1f' % (2 * np.sqrt(np.median([q[3] for q in dsc]) / np.pi) * sc, np.median([q[2] for q in dsc]))))

    # tracking
    tracks = []; live = {}
    for i in range(len(dets) - 1):
        A, B = dets[i], dets[i + 1]
        newlive = {}
        R = 450.0 * (times[i + 1] - times[i]) / sc  # px between these frames at the frames' size (450 px/s at 1080p)
        if len(A) and len(B):
            D = np.sqrt(((A[:, None, :] - B[None, :, :]) ** 2).sum(2))
            ab = D.argmin(1); ba = D.argmin(0); ia_ = np.arange(len(A))
            for ia in np.nonzero((ba[ab] == ia_) & (D[ia_, ab] <= R))[0].tolist():   # mutual nearest neighbours within R, in order
                ib = ab[ia]
                tr = live.get(ia, [(i, A[ia, 0], A[ia, 1])]); tr.append((i + 1, B[ib, 0], B[ib, 1])); newlive[ib] = tr
        kept = {id(tr) for tr in newlive.values()}
        for tr in live.values():
            if id(tr) not in kept: tracks.append(tr)
        live = newlive
    tracks.extend(live.values())
    vel = []; acc = []; dev = []
    for tr in tracks:
        t = np.array([times[p[0]] for p in tr])
        if len(tr) < 4 or t[-1] - t[0] < 0.5: continue
        x = np.array([p[1] for p in tr]) * sc; y = np.array([p[2] for p in tr]) * sc
        vx = np.polyfit(t, x, 1)[0]; vy = np.polyfit(t, y, 1)[0]
        if np.hypot(vx, vy) < 0.5: continue  # a fixed feature, not a sparkle
        vel.append((vx, vy))
        if t[-1] - t[0] >= 1.5 and len(tr) >= 6:
            cy = np.polyfit(t, y, 2); acc.append(2 * cy[0])
            cx = np.polyfit(t, x, 2); dev.append(np.hypot(2 * cx[0], 2 * cy[0]))
    vel = np.array(vel).reshape(-1, 2)
    if len(vel):
        sp = np.hypot(vel[:, 0], vel[:, 1])
        J.update(tracks=len(vel), up_share=np.mean(vel[:, 1] < 0), speed_med=np.median(sp), speed_p10=np.percentile(sp, 10), speed_p90=np.percentile(sp, 90), vy_med=np.median(np.abs(vel[:, 1])))
        out('%-58s %s' % ('tracks >= 0.5 s: count; moving up share (screen):', '%d; %.2f' % (len(vel), np.mean(vel[:, 1] < 0))))
        out('%-58s %s' % ('speed median, p10-p90 (px/s @1080p):', '%.1f, %.1f-%.1f' % (np.median(sp), np.percentile(sp, 10), np.percentile(sp, 90))))
        out('%-58s %s' % ('vertical speed |vy| median (px/s @1080p):', '%.1f' % np.median(np.abs(vel[:, 1]))))
    if acc:
        J.update(acc_med=np.median(acc), acc_abs=np.median(dev), acc_n=len(acc))
        out('%-58s %s' % ('tracks >= 1.5 s: vertical acceleration median (+ = down), |a| median (px/s^2):', '%+.1f, %.1f (n=%d)' % (np.median(acc), np.median(dev), len(acc))))
    return {k: float(v) for k, v in J.items()}

if __name__ == '__main__':
    d = sys.argv[1]; fps = float(sys.argv[2]); hp = '--hp' in sys.argv; dedupe = '--dedupe' in sys.argv
    jout = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
    files = sorted(glob.glob(os.path.join(d, '*.png')))
    per = []; times = []; Hpx = None; prev = None
    for fi, f in enumerate(files):
        a8 = np.asarray(Image.open(f).convert('RGB')); a = a8.astype(np.float32)
        if Hpx is None: Hpx = a.shape[0]
        if dedupe:
            if prev is not None and np.abs(a - prev).mean() < 0.4: continue
            prev = a
        times.append(fi / fps)
        per.append(detect(a8, hp, a))
    J = summarise(per, times, Hpx, len(files), fps)
    if jout:
        import json; json.dump(J, open(jout, 'w'), indent=1)
