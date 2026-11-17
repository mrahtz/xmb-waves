# The two profiles spec 23 says to read from footage, for every condition: the bottom edge's left-to-right profile (the
# glow's width around the middle of the day) and the row-by-row profile across the middle of the frame (how far the
# spot's centre rises and falls). Footage beside the build, in levels (the mean of the three channels).
# usage: python profiles.py PAGE [FIT.json]   (FIT.json: a fit result to render instead of the page's own values)
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
p = json.load(open(sys.argv[2]))['p'] if len(sys.argv) > 2 else {}
w.stdout.readline(); w.stdin.write(json.dumps({'id': 0, 'p': p, 'imgs': True}) + '\n{"quit":1}\n'); w.stdin.flush()
r = json.loads(w.stdout.readline())
def prof(A, keep, rows, axis):
    """mean level over a band, as a profile along the other axis (8 bins), ignoring the masked pixels"""
    a = A[rows].mean(2); k = keep[rows].astype(np.float32)
    if axis == 'x': a = a.reshape(a.shape[0], 8, -1); k = k.reshape(k.shape[0], 8, -1); s = (a * k).sum((0, 2)); n = k.sum((0, 2))
    else: s = (a * k).sum(1); n = k.sum(1)
    return np.where(n > 20, s / np.maximum(n, 1), np.nan)
rows_b = slice(121, 135); rows_m = slice(27, 108)
print('bottom edge, left to right (8 bins across the width)')
print('%-17s %s' % ('condition', ' '.join('%5d' % i for i in range(8))))
for j, c in enumerate(meta):
    m = np.array(r['imgs'][j], dtype=np.float32).reshape(135, 240, 4)[..., :3]
    f = prof(T[j], K[j], rows_b, 'x'); b = prof(m, K[j], rows_b, 'x')
    print('%-17s %s   footage' % (c['time'][:16], ' '.join('%5.1f' % v for v in f)))
    print('%-17s %s   build  %+.1f' % ('', ' '.join('%5.1f' % v for v in b), np.nanmean(b - f)))
print()
print('middle of the frame, row by row (every 9th row of 27..107, top first)')
for j, c in enumerate(meta):
    if c['time'][11:13] not in ('06', '18'): continue
    m = np.array(r['imgs'][j], dtype=np.float32).reshape(135, 240, 4)[..., :3]
    f = prof(T[j], K[j], rows_m, 'y')[::9]; b = prof(m, K[j], rows_m, 'y')[::9]
    print('%-17s %s   footage' % (c['time'][:16], ' '.join('%5.1f' % v for v in f)))
    print('%-17s %s   build  %+.1f' % ('', ' '.join('%5.1f' % v for v in b), np.nanmean(b - f)))
