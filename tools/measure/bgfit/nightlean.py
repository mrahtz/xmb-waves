# Which part of the night picture's lean is painted and which is lit (spec 33). The painted part cannot change within one
# night and the lit part travels across it, so what separates them is not the lean at one hour but the way that lean
# changes between the hours of one night:
#   - the lower part's left-to-right balance at every night hour the footage covers, in order through the night. In the
#     original it runs steadily one way, following the light's own travel across the width; a painted lean can move all
#     the readings together but can never reverse their order. A build whose balance changes the other way has no
#     travelling night light in its lower picture at all, however well its lean at any single hour agrees.
#   - the gentle arch along the very bottom of the frame: its height above the straight line between the ends of the
#     profile, and where across the width it sits. In the original there is one at every hour of the night and it moves
#     across the width; an arch painted into the picture can only be right at one hour and sits still at the rest.
# usage: python nightlean.py PAGE [FIT.json]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
p = json.load(open(argv[1]))['p'] if len(argv) > 1 else {}
NIGHT = lambda h: h >= 19 or h <= 5
JS = [j for j, c in enumerate(meta) if NIGHT(int(c['time'][11:13]))]
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), argv[0]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline()
imgs = {}
for i in range(0, len(JS), 12):
    cs = JS[i:i + 12]
    w.stdin.write(json.dumps({'id': 0, 'p': dict(p, conds=cs), 'imgs': True}) + '\n'); w.stdin.flush()
    r = json.loads(w.stdout.readline())
    for j, im in zip(cs, r['imgs']): imgs[j] = np.array(im, dtype=np.float32).reshape(135, 240, 4)[..., :3]
w.stdin.write('{"quit":1}\n'); w.stdin.flush()

LOW = slice(101, 135)   # the lower part of the picture (the lowest quarter)
EDGE = slice(127, 135)  # the very bottom of the frame
def xprof(A, keep, rows, bins=8):
    a = A[rows].mean(2); k = (keep[rows] > 0).astype(np.float32)
    a = a.reshape(a.shape[0], bins, -1); k = k.reshape(k.shape[0], bins, -1)
    s = (a * k).sum((0, 2)); n = k.sum((0, 2))
    return np.where(n > 20, s / np.maximum(n, 1), np.nan)
def balance(A, keep):
    """(right - left) / (right + left) over the lower part of the picture, the outer quarters of the width"""
    pr = xprof(A, keep, LOW)
    l = np.nanmean(pr[:2]); r = np.nanmean(pr[6:])
    return (r - l) / max(r + l, 1e-6)
def arch(A, keep):
    """the bottom edge's profile less the straight line between its ends: how high the arch stands (as a share of the
    profile's mean) and where across the width its top sits (0 = left edge, 1 = right)"""
    pr = xprof(A, keep, EDGE)
    if np.all(np.isnan(pr)) or np.isnan(pr[0]) or np.isnan(pr[-1]): return np.nan, np.nan
    x = np.arange(len(pr)); line = np.interp(x, [x[0], x[-1]], [pr[0], pr[-1]])
    d = pr - line
    if np.all(np.isnan(d)): return np.nan, np.nan
    i = int(np.nanargmax(d))
    return float(np.nanmax(d) / max(np.nanmean(pr), 1e-6)), i / (len(pr) - 1.0)

by = {}
for j in JS:
    c = meta[j]; h = int(c['time'][11:13])
    by.setdefault(c['time'][:10], []).append((h if h >= 12 else h + 24, j))
print('the lower picture\'s left-to-right balance and the bottom edge\'s arch, through the hours of one night')
print('%-12s %5s  %7s %7s   %6s %5s  %6s %5s' % ('night', 'hour', 'f.bal', 'b.bal', 'f.arch', 'at', 'b.arch', 'at'))
agree = dis = 0
for date, hs in sorted(by.items()):
    hs.sort()
    if len(hs) < 2: continue
    fb, bb = [], []
    for k, j in hs:
        f = balance(T[j], K[j]); b = balance(imgs[j], K[j])
        fa, fx = arch(T[j], K[j]); ba, bx = arch(imgs[j], K[j])
        fb.append(f); bb.append(b)
        print('%-12s %5d  %+7.3f %+7.3f   %6.3f %5.2f  %6.3f %5.2f' % (date, k % 24, f, b, fa, fx, ba, bx))
    df = fb[-1] - fb[0]; db = bb[-1] - bb[0]
    ok = (df > 0) == (db > 0)
    agree += ok; dis += not ok
    print('%-12s %5s  %+7.3f %+7.3f   over the night: %s' % ('', 'd', df, db, 'the same way' if ok else 'THE OTHER WAY'))
print('nights whose balance runs the same way as the original\'s: %d of %d' % (agree, agree + dis))
