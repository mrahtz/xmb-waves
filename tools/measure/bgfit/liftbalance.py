# The balance between the two lights' lifts, read within one daytime frame (spec 34).
#
# On a single daytime frame each light is read against the picture away from both: the middle of the top band against the
# two top corners for the travelling spot, and the middle of the bottom band against the two bottom corners for the glow
# along the bottom edge, in the same units on the same frame. Re-fitting the palettes, the exposure or the tone curve
# raises or lowers everything together, so what the two readings pin is the balance between the two lifts, which no
# palette and no exposure can alter. They are taken at the hours around the middle of the day, when both lights are in or
# close to the frame, and at the ends of the day as a check, since the balance holds at every daytime hour.
#
# usage: python liftbalance.py PAGE [FIT.json] [--hours 09,12,15] [--json OUT.json]
import json, subprocess, numpy as np, os, sys, collections
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]; hours = ('09', '11', '12', '13', '15'); out = None
if '--hours' in argv:
    i = argv.index('--hours'); hours = tuple(argv[i + 1].split(',')); del argv[i:i + 2]
if '--json' in argv:
    i = argv.index('--json'); out = argv[i + 1]; del argv[i:i + 2]
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

TOP = slice(0, 20); BOT = slice(115, 135)          # a band at the top edge and one at the bottom (the outer 15 %)
MIDX = slice(80, 160); LX = slice(0, 40); RX = slice(200, 240)   # the middle third of the width and the two far sixths
def grey(A, keep, rows, cols):
    a = A[rows, cols].mean(2); k = keep[rows, cols] > 0
    return float(a[k].mean()) if k.sum() > 100 else np.nan
def read(A, keep):
    """for each light: the middle of its band over the two corners beside it, on the one frame"""
    o = []
    for rows in (TOP, BOT):
        m = grey(A, keep, rows, MIDX)
        c = np.nanmean([grey(A, keep, rows, LX), grey(A, keep, rows, RX)])
        o.append(m / c if c and c == c and c > 1e-6 else np.nan)
    return o

print('each light read against the picture away from both, within one frame (spec 34)')
print('%-17s %13s %13s   %13s' % ('condition', 'top mid/corner', 'bot mid/corner', 'their ratio'))
print('%-17s %6s %6s %6s %6s   %6s %6s' % ('', 'foot', 'build', 'foot', 'build', 'foot', 'build'))
rows_out = []
for j in JS:
    c = meta[j]
    ft, fb = read(T[j], K[j]); bt, bb = read(imgs[j], K[j])
    print('%-17s %6.3f %6.3f %6.3f %6.3f   %6.3f %6.3f' % (c['time'][:16], ft, bt, fb, bb, ft / fb, bt / bb))
    rows_out.append({'time': c['time'], 'foot_top': ft, 'build_top': bt, 'foot_bot': fb, 'build_bot': bb})
f = lambda k: np.nanmean([r[k] for r in rows_out])
print('mean over %d conditions: top %.3f against %.3f, bottom %.3f against %.3f, the balance %.3f against %.3f'
      % (len(rows_out), f('foot_top'), f('build_top'), f('foot_bot'), f('build_bot'),
         f('foot_top') / f('foot_bot'), f('build_top') / f('build_bot')))
if out: json.dump(rows_out, open(out, 'w'), indent=1)
