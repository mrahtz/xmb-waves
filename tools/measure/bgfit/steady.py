# The part of a build's background error that does not move with the hour (spec 23): per month, the mean over that
# month's conditions of (build - footage), per pixel and channel, and how large it is. The lights move over the day and
# this does not, so what is left here is what the month's own images cannot say.
# usage: python steady.py PAGE [SHEET.png]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline(); w.stdin.write(json.dumps({'id': 0, 'p': {}, 'imgs': True}) + '\n{"quit":1}\n'); w.stdin.flush()
r = json.loads(w.stdout.readline())
R = [np.array(im, dtype=np.float32).reshape(135, 240, 4)[..., :3] - T[j] for j, im in enumerate(r['imgs'])]
by = {}
for j, c in enumerate(meta): by.setdefault(c['time'][:7], []).append(j)
print('%-8s %6s %6s %6s  %s' % ('month', 'err', 'steady', 'moving', 'conditions'))
tot = []
for mon, js in sorted(by.items()):
    wgt = np.stack([K[j] for j in js]).astype(np.float32)[..., None]
    st = (np.stack([R[j] for j in js]) * wgt).sum(0) / np.maximum(wgt.sum(0), 1e-6)   # the hour-average residual
    keep = wgt.sum(0)[..., 0] > 0
    err = float(np.mean([np.abs(R[j])[K[j] > 0].mean() for j in js]))
    steady = float(np.abs(st[keep]).mean())
    moving = float(np.mean([np.abs(R[j] - st)[K[j] > 0].mean() for j in js]))
    tot.append((err, steady, moving))
    print('%-8s %6.2f %6.2f %6.2f  %d' % (mon, err, steady, moving, len(js)))
m = np.mean(tot, axis=0)
print('%-8s %6.2f %6.2f %6.2f' % ('mean', *m))
if len(sys.argv) > 2:
    from PIL import Image
    rows = []
    for mon, js in sorted(by.items()):
        wgt = np.stack([K[j] for j in js]).astype(np.float32)[..., None]
        st = (np.stack([R[j] for j in js]) * wgt).sum(0) / np.maximum(wgt.sum(0), 1e-6)
        rows.append(np.clip(128 + 8 * st, 0, 255).astype(np.uint8))
    Image.fromarray(np.concatenate(rows, axis=0)).save(sys.argv[2])
    print('wrote', sys.argv[2], '(x8 around mid grey)')
