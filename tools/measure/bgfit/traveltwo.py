# How far the travelling spot's centre rises and falls, read as spec 33 says it has to be read: not from the level of the
# row-by-row profile across the middle of the frame at one hour (an exposure change looks much the same there), but from
# the profile at two hours of the same day against each other, with one free scale on the pair. The ratio cancels the
# painted picture, which is the same at both hours, and the free scale cancels the exposure; what is left is how much the
# light moved up or down the frame between the two. The pairs that carry it straddle the morning rise or the evening
# fall - a pair taken within the working day is blind to it.
# usage: python traveltwo.py PAGE [FIT.json] [--pairs 04:09,18:21]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]; pairs = ('04:09', '18:21', '06:12', '15:20')
if '--pairs' in argv:
    i = argv.index('--pairs'); pairs = tuple(argv[i + 1].split(',')); del argv[i:i + 2]
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
p = json.load(open(argv[1]))['p'] if len(argv) > 1 else {}
idx = {(c['time'][:10], c['time'][11:13]): j for j, c in enumerate(meta)}
JS = sorted({j for d, h in idx for j in [idx[(d, h)]]})
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), argv[0]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline()
imgs = {}
for i in range(0, len(JS), 12):
    cs = JS[i:i + 12]
    w.stdin.write(json.dumps({'id': 0, 'p': dict(p, conds=cs), 'imgs': True}) + '\n'); w.stdin.flush()
    r = json.loads(w.stdout.readline())
    for j, im in zip(cs, r['imgs']): imgs[j] = np.array(im, dtype=np.float32).reshape(135, 240, 4)[..., :3]
w.stdin.write('{"quit":1}\n'); w.stdin.flush()

ROWS = slice(27, 108)   # the middle of the frame, where the vertical travel shows (the lowest rows barely move)
def rowprof(A, keep):
    a = A[ROWS].mean(2); k = (keep[ROWS] > 0).astype(np.float32)
    s = (a * k).sum(1); n = k.sum(1)
    pr = np.where(n > 20, s / np.maximum(n, 1), np.nan)
    ok = ~np.isnan(pr)
    return np.interp(np.arange(len(pr)), np.flatnonzero(ok), pr[ok])[::-1]   # bottom first

print('row profile across the middle of the frame at two hours of one day, as a ratio, with one free scale on the pair')
print('%-16s %-6s %s' % ('day', 'pair', '  '.join('%5.2f' % y for y in np.linspace(0, 1, 9)) + '   rms'))
out = []
for pr in pairs:
    h1, h2 = pr.split(':')
    for d in sorted({k[0] for k in idx}):
        if (d, h1) not in idx or (d, h2) not in idx: continue
        j1, j2 = idx[(d, h1)], idx[(d, h2)]
        keep = (K[j1] > 0) & (K[j2] > 0)
        f = rowprof(T[j1], keep) / np.maximum(rowprof(T[j2], keep), 1e-3)
        b = rowprof(imgs[j1], keep) / np.maximum(rowprof(imgs[j2], keep), 1e-3)
        g = np.exp(np.mean(np.log(np.maximum(f, 1e-3)) - np.log(np.maximum(b, 1e-3))))   # the one free scale
        b = b * g
        sel = np.linspace(0, len(f) - 1, 9).astype(int)
        rms = float(np.sqrt(np.mean((np.log(np.maximum(f, 1e-3)) - np.log(np.maximum(b, 1e-3))) ** 2)))
        out.append(rms)
        print('%-16s %-6s %s   footage' % (d, pr, '  '.join('%5.2f' % v for v in f[sel])))
        print('%-16s %-6s %s   build (x%.2f) %.3f' % ('', '', '  '.join('%5.2f' % v for v in b[sel]), g, rms))
if out: print('mean log rms over %d pairs: %.3f' % (len(out), float(np.mean(out))))
