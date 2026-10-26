# sparks.py: sparkle statistics of a frame sequence: detection, look classes, colour, and motion from tracks.
# usage: python3 sparks.py DIR FPS [--hp]
#   DIR holds the frames in order (png). Without --hp the frames are expected to show the sparkles alone on black
#   (a 'sparkles' layer render); with --hp each frame is high-passed first (frame minus a 15 px median), for footage.
# Per frame: local maxima above a threshold, each measured at half its peak (area, elongation, colour). Classes: streak
# (elongation >= 2.2), disc (round, half-peak area >= 40 px, i.e. a large soft spot), dot (the rest). Motion: maxima linked
# between consecutive frames by mutual nearest neighbour; tracks of 0.5 s or more give a velocity (straight-line fit),
# tracks of 1.5 s or more an acceleration (quadratic fit). Sizes and speeds are in px at the frames' size, scaled to 1080p.
import sys, os, glob
import numpy as np
from PIL import Image
from scipy import ndimage as nd

d = sys.argv[1]; fps = float(sys.argv[2]); hp = '--hp' in sys.argv
files = sorted(glob.glob(os.path.join(d, '*.png')))
THR = 6.0
dets = []; looks = []; sums = []; tops = []; Hpx = None
for f in files:
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
    if Hpx is None: Hpx = a.shape[0]
    if hp: a = a - nd.median_filter(a, size=(15, 15, 1))
    g = a.mean(2)
    mx = nd.maximum_filter(g, size=5)
    ys, xs = np.nonzero((g == mx) & (g > THR))
    pts = []
    lab_src = g.copy()
    for y, x in zip(ys, xs):
        p = g[y, x]
        y0, y1, x0, x1 = max(0, y - 24), min(g.shape[0], y + 25), max(0, x - 24), min(g.shape[1], x + 25)
        win = lab_src[y0:y1, x0:x1] >= 0.5 * p
        lab, _ = nd.label(win); L = lab[y - y0, x - x0]
        if L == 0: continue
        m = lab == L; area = int(m.sum())
        yy, xx = np.nonzero(m)
        if area >= 3:
            c = np.cov(np.vstack([xx, yy])); ev = np.sort(np.linalg.eigvalsh(c))
            el = float(np.sqrt(max(ev[1], 1e-6) / max(ev[0], 0.08)))
        else: el = 1.0
        rgb = a[y, x]; sat = float((rgb.max() - rgb.min()) / max(rgb.max(), 1e-3))
        touches = yy.min() == 0 or xx.min() == 0 or yy.max() == m.shape[0] - 1 or xx.max() == m.shape[1] - 1
        if touches: continue  # part of something larger than a sparkle (a band line)
        cls = 'streak' if el >= 2.2 else ('disc' if area >= 40 else 'dot')
        pts.append((x, y, p, area, el, sat, cls))
    dets.append(np.array([(q[0], q[1]) for q in pts], dtype=float).reshape(-1, 2))
    looks.extend(pts)
    s = sorted([q[2] for q in pts], reverse=True)
    sums.append(sum(s)); tops.append(np.mean(s[:10]) if s else 0.0)

sc = 1080.0 / Hpx
n = np.array([len(x) for x in dets])
print('%-58s %s' % ('frames, fps:', '%d, %g' % (len(files), fps)))
print('%-58s %s' % ('sparkles per frame: median, p10-p90:', '%d, %d-%d' % (np.median(n), np.percentile(n, 10), np.percentile(n, 90))))
print('%-58s %s' % ('peak level: median, p90, brightest 10 per frame (mean):', '%.1f, %.1f, %.1f' % (np.median([q[2] for q in looks]), np.percentile([q[2] for q in looks], 90), np.mean(tops))))
print('%-58s %s' % ('summed peak levels per frame (median):', '%.0f' % np.median(sums)))
cl = [q[6] for q in looks]; N = max(len(cl), 1)
print('%-58s %s' % ('classes: dot / streak / disc share:', '%.2f / %.2f / %.2f' % (cl.count('dot') / N, cl.count('streak') / N, cl.count('disc') / N)))
br = [q for q in looks if q[2] >= 20]
print('%-58s %s' % ('colour saturation at the peak: median; share > 0.35 (peak >= 20):', '%.2f; %.2f (n=%d)' % (np.median([q[5] for q in br]) if br else float('nan'), np.mean([q[5] > 0.35 for q in br]) if br else float('nan'), len(br))))
dsc = [q for q in looks if q[6] == 'disc']
if dsc: print('%-58s %s' % ('discs: half-peak diameter median (px@1080p), peak median:', '%.1f, %.1f' % (2 * np.sqrt(np.median([q[3] for q in dsc]) / np.pi) * sc, np.median([q[2] for q in dsc]))))

# tracking
R = 450.0 / fps / sc  # px per frame at the frames' size (450 px/s at 1080p)
tracks = []; live = {}
for i in range(len(dets) - 1):
    A, B = dets[i], dets[i + 1]
    newlive = {}
    if len(A) and len(B):
        D = np.sqrt(((A[:, None, :] - B[None, :, :]) ** 2).sum(2))
        ab = D.argmin(1); ba = D.argmin(0)
        for ia in range(len(A)):
            ib = ab[ia]
            if ba[ib] == ia and D[ia, ib] <= R:
                tr = live.get(ia, [(i, A[ia, 0], A[ia, 1])]); tr.append((i + 1, B[ib, 0], B[ib, 1])); newlive[ib] = tr
    kept = {id(tr) for tr in newlive.values()}
    for tr in live.values():
        if id(tr) not in kept: tracks.append(tr)
    live = newlive
tracks.extend(live.values())
k05 = int(round(0.5 * fps)); k15 = int(round(1.5 * fps))
vel = []; acc = []; dev = []
for tr in tracks:
    if len(tr) < k05: continue
    t = np.array([p[0] for p in tr]) / fps; x = np.array([p[1] for p in tr]) * sc; y = np.array([p[2] for p in tr]) * sc
    vx = np.polyfit(t, x, 1)[0]; vy = np.polyfit(t, y, 1)[0]
    if np.hypot(vx, vy) < 0.5: continue  # a fixed feature, not a sparkle
    vel.append((vx, vy))
    if len(tr) >= k15:
        cy = np.polyfit(t, y, 2); acc.append(2 * cy[0])
        cx = np.polyfit(t, x, 2); dev.append(np.hypot(2 * cx[0], 2 * cy[0]))
vel = np.array(vel).reshape(-1, 2)
if len(vel):
    sp = np.hypot(vel[:, 0], vel[:, 1])
    print('%-58s %s' % ('tracks >= 0.5 s: count; moving up share (screen):', '%d; %.2f' % (len(vel), np.mean(vel[:, 1] < 0))))
    print('%-58s %s' % ('speed median, p10-p90 (px/s @1080p):', '%.1f, %.1f-%.1f' % (np.median(sp), np.percentile(sp, 10), np.percentile(sp, 90))))
    print('%-58s %s' % ('vertical speed |vy| median (px/s @1080p):', '%.1f' % np.median(np.abs(vel[:, 1]))))
if acc:
    print('%-58s %s' % ('tracks >= 1.5 s: vertical acceleration median (+ = down), |a| median (px/s^2):', '%+.1f, %.1f (n=%d)' % (np.median(acc), np.median(dev), len(acc))))
