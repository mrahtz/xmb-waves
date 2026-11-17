# What pins the fixed share, the two lifts and the paling (spec 28), footage beside the build. The share and the lifts act
# on the brightest of a pixel's three channels, while the paling leaves that channel alone, so they can be read apart:
# take the per-pixel largest of the three channels over a place one light passes over, at the hour that light is over it
# and at the hour it has gone to the other side of the width. The painted image cancels between the two hours (it is the
# same picture at both) and through the middle of the day the clock's own curves are flat, so what is left is how far that
# light carries the brightest channel above the unlit share. A place high in the frame reads the travelling spot, a place
# low in the frame the glow along the bottom edge. The smallest channel over the largest, at the same places and hours,
# then pins the paling. Compare builds by the difference between the hours, not by the level at either one (the
# composite's exposure is not the same in every mood). Where across the width the brightest channel peaks says nothing -
# it travels over the day in the original as much as in any build - so it is not measured here.
# usage: python lifts.py PAGE [FIT.json] [--date 2026-10-15] [--hours 09,15]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]; date = '2026-10-15'; hours = ('09', '15')
if '--date' in argv: i = argv.index('--date'); date = argv[i + 1]; del argv[i:i + 2]
if '--hours' in argv: i = argv.index('--hours'); hours = tuple(argv[i + 1].split(',')); del argv[i:i + 2]
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
p = json.load(open(argv[1]))['p'] if len(argv) > 1 else {}
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), argv[0]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline(); w.stdin.write(json.dumps({'id': 0, 'p': p, 'imgs': True}) + '\n{"quit":1}\n'); w.stdin.flush()
r = json.loads(w.stdout.readline())
# places (x and y ranges as fractions of the width and of the height above the bottom edge): high in the frame on either
# side for the spot, low in the frame on either side for the bottom glow
PLACES = {'high left': (0.05, 0.30, 0.72, 0.95), 'high right': (0.70, 0.95, 0.72, 0.95),
          'low left': (0.05, 0.30, 0.02, 0.18), 'low right': (0.70, 0.95, 0.02, 0.18)}
def box(A, keep, b):
    x0, x1, y0, y1 = b
    xs = slice(int(x0 * 240), int(x1 * 240)); ys = slice(135 - int(y1 * 135), 135 - int(y0 * 135))
    a = A[ys, xs]; k = keep[ys, xs] > 0
    if k.sum() < 50: return np.nan, np.nan
    mx = a.max(2)[k]; mn = a.min(2)[k]
    return float(mx.mean()), float((mn / np.maximum(mx, 1e-6)).mean())
rows = {}
for j, c in enumerate(meta):
    if not c['time'].startswith(date) or c['time'][11:13] not in hours: continue
    m = np.array(r['imgs'][j], dtype=np.float32).reshape(135, 240, 4)[..., :3]
    for name, A in (('footage', T[j]), ('build', m)):
        for pl, b in PLACES.items(): rows[(pl, c['time'][11:13], name)] = box(A, K[j], b)
print('%s: the largest channel (levels) and the smallest over the largest, per place and hour' % date)
print('%-11s %-8s %s' % ('place', 'what', ' '.join('%6s %6s' % ('max' + h, 'min/max') for h in hours) + '   max diff'))
for pl in PLACES:
    for name in ('footage', 'build'):
        v = [rows.get((pl, h, name), (np.nan, np.nan)) for h in hours]
        d = v[0][0] - v[1][0]
        print('%-11s %-8s %s   %+7.2f' % (pl if name == 'footage' else '', name,
              ' '.join('%6.1f %6.3f' % (a, b) for a, b in v), d))
