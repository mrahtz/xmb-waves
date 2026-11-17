# Smoothness check (spec 23: "no edge or band appears anywhere in the frame at any hour"): a quadratic surface is fitted
# to every 3 x 3 window of the picture and the residual RMS reported, for the build and for the footage at the same
# conditions. A band or a kink from too coarse a grid would show as a larger residual than the footage's.
# usage: python smooth.py PAGE
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline(); w.stdin.write(json.dumps({'id': 0, 'p': {}, 'imgs': True}) + '\n{"quit":1}\n'); w.stdin.flush()
r = json.loads(w.stdout.readline())
# a quadratic in x and y over a 3 x 3 window has 6 terms; the residual of the least-squares fit is a fixed linear
# functional of the window, so the RMS can be found with three convolutions
xs, ys = np.meshgrid([-1, 0, 1], [-1, 0, 1])
A = np.stack([np.ones(9), xs.ravel(), ys.ravel(), (xs * xs).ravel(), (ys * ys).ravel(), (xs * ys).ravel()], 1)
P = np.eye(9) - A @ np.linalg.pinv(A)          # projector onto what a quadratic cannot fit
def resid(img):
    out = 0
    for k in range(9):
        c = P[k].reshape(3, 3)
        acc = sum(c[j, i] * img[j:img.shape[0] - 2 + j, i:img.shape[1] - 2 + i] for j in range(3) for i in range(3))
        out = out + acc ** 2
    return np.sqrt(out / 9)
print('%-17s %6s %6s' % ('condition', 'build', 'footage'))
bs, fs = [], []
for j, c in enumerate(meta):
    m = np.array(r['imgs'][j], dtype=np.float32).reshape(135, 240, 4)[..., :3].mean(2)
    f = T[j].mean(2); keep = K[j][1:-1, 1:-1] > 0
    b_ = resid(m)[keep].mean(); f_ = resid(f)[keep].mean()
    bs.append(b_); fs.append(f_)
    print('%-17s %6.3f %6.3f' % (c['time'][:16], b_, f_))
print('%-17s %6.3f %6.3f  (levels RMS, mean over the kept pixels)' % ('mean', np.mean(bs), np.mean(fs)))
