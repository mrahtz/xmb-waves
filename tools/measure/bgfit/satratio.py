# The saturation shaping down the frame, read as spec 33 says it can be read at all: as a ratio, at and below the middle
# of the frame, with the wave's own pixels left out.
#   - the saturation of a band across the middle of the frame against the saturation of a band at the bottom;
#   - at one hour of the late-evening shoulder and one in the small hours, the only stretches where the shaping's clock is
#     open and the day image still has light to colour (through the working day it does nothing);
#   - never at the top of the frame, where the composite crushes the dark picture until it reads fully pure whatever the
#     picture says.
# It is also what keeps a fit honest while the proportion between the two rates is being settled, so it is worth taking
# before anything is changed.
# usage: python satratio.py PAGE [FIT.json] [--hours 20,21,22,02,03,04]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]; hours = ('20', '21', '22', '02', '03', '04')
if '--hours' in argv:
    i = argv.index('--hours'); hours = tuple(argv[i + 1].split(',')); del argv[i:i + 2]
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
p = json.load(open(argv[1]))['p'] if len(argv) > 1 else {}
JS = [j for j, c in enumerate(meta) if c['time'][11:13] in hours]
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), argv[0]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline()
imgs = {}
for i in range(0, len(JS), 12):
    cs = JS[i:i + 12]
    w.stdin.write(json.dumps({'id': 0, 'p': dict(p, conds=cs), 'imgs': True}) + '\n'); w.stdin.flush()
    r = json.loads(w.stdout.readline())
    for j, im in zip(cs, r['imgs']): imgs[j] = np.array(im, dtype=np.float32).reshape(135, 240, 4)[..., :3]
w.stdin.write('{"quit":1}\n'); w.stdin.flush()

MID = slice(54, 82)    # a band across the middle of the frame (0.39 to 0.61 of the height)
BOT = slice(121, 135)  # a band at the bottom edge (the lowest 10 %)
def sat(A, keep, rows):
    """the mean saturation (the largest channel less the smallest, over the largest) over a band, of the pixels the wave
    does not cover and that have light enough for a hue to mean anything"""
    a = A[rows]; k = keep[rows] > 0
    mx = a.max(2); mn = a.min(2)
    ok = k & (mx > 24)      # dark enough and the composite crushes the picture until it reads fully pure, whatever it says
    if ok.sum() < 200: return np.nan
    return float((((mx - mn) / np.maximum(mx, 1e-6))[ok]).mean())

print('saturation of a mid-frame band over that of a band at the bottom edge (the wave left out)')
print('%-17s %6s %6s %6s   %6s %6s %6s' % ('condition', 'f.mid', 'f.bot', 'f.rat', 'b.mid', 'b.bot', 'b.rat'))
acc = {}
for j in JS:
    c = meta[j]
    fm, fb = sat(T[j], K[j], MID), sat(T[j], K[j], BOT)
    bm, bb = sat(imgs[j], K[j], MID), sat(imgs[j], K[j], BOT)
    fr, br = fm / fb, bm / bb
    print('%-17s %6.3f %6.3f %6.3f   %6.3f %6.3f %6.3f  %+.3f' % (c['time'][:16], fm, fb, fr, bm, bb, br, br - fr))
    acc.setdefault('evening' if c['time'][11:13] >= '12' else 'small hours', []).append((fr, br))
for k, v in acc.items():
    f = np.nanmean([a for a, _ in v]); b = np.nanmean([a for _, a in v])
    n = int(np.sum([a == a and c == c for a, c in v]))
    print('%-17s footage %.3f  build %.3f  (%d conditions of %d read)' % (k, f, b, n, len(v)))
