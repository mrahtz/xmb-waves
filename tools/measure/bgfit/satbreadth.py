# How far through the month the mid-month lowering of the saturation reaches, and how deep it goes (spec 34).
#
# The mean saturation of a band along the very bottom of the frame - the band no wave ever covers - at one fixed
# daytime hour, read through the days of one month with that month's own level divided out: each day's reading is
# divided by the straight line between the month's first and last days, which are the two days the lowering has least
# hold of, so what is left is the lowering itself. The breadth and the depth are two numbers, and a mid-month day
# together with an end-of-month day give only one reading between them, so the days read are the first and last days,
# the middle one, and days about a quarter and about three quarters of the way through.
#
# usage: python satbreadth.py PAGE [FIT.json] [--month 4] [--hour 12]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]; month = 4; hour = '12'
for k in ('--month', '--hour'):
    if k in argv:
        i = argv.index(k); v = argv[i + 1]; del argv[i:i + 2]
        if k == '--month': month = int(v)
        else: hour = v
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
p = json.load(open(argv[1]))['p'] if len(argv) > 1 else {}
JS = sorted([j for j, c in enumerate(meta) if int(c['time'][5:7]) == month and c['time'][11:13] == hour],
            key=lambda j: meta[j]['time'])
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), argv[0]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline()
imgs = {}
for i in range(0, len(JS), 12):
    cs = JS[i:i + 12]
    w.stdin.write(json.dumps({'id': 0, 'p': dict(p, conds=cs), 'imgs': True}) + '\n'); w.stdin.flush()
    r = json.loads(w.stdout.readline())
    for j, im in zip(cs, r['imgs']): imgs[j] = np.array(im, dtype=np.float32).reshape(135, 240, 4)[..., :3]
w.stdin.write('{"quit":1}\n'); w.stdin.flush()

BOT = slice(125, 135)    # the band along the very bottom of the frame, which no wave ever covers
def sat(A, keep):
    a = A[BOT]; k = keep[BOT] > 0
    mx = a.max(2); mn = a.min(2); ok = k & (mx > 24)
    return float(((mx - mn) / np.maximum(mx, 1e-6))[ok].mean()) if ok.sum() > 100 else np.nan

days = [int(meta[j]['time'][8:10]) for j in JS]
import calendar
nd = calendar.monthrange(2026, month)[1]
prog = [(d - 1) / nd for d in days]
fs = [sat(T[j], K[j]) for j in JS]; bs = [sat(imgs[j], K[j]) for j in JS]
def level(v):
    """the straight line between the first and the last day read, as that month's own level"""
    p0, p1 = prog[0], prog[-1]
    return [v[0] + (v[-1] - v[0]) * (q - p0) / max(p1 - p0, 1e-6) for q in prog]
lf, lb = level(fs), level(bs)
print('the bottom band\'s saturation through the days of month %d at %s:00, that month\'s own level divided out '
      '(spec 34)' % (month, hour))
print('%-12s %8s %15s %15s' % ('day', 'progress', 'footage', 'build'))
print('%-12s %8s %7s %7s %7s %7s' % ('', '', 'sat', 'rel', 'sat', 'rel'))
rows = []
for d, q, a, b, la, lb_ in zip(days, prog, fs, bs, lf, lb):
    print('%-12d %8.3f %7.4f %7.3f %7.4f %7.3f' % (d, q, a, a / la, b, b / lb_))
    rows.append((q, a / la, b / lb_))
mid = [r for r in rows if 0.4 <= r[0] <= 0.6]
qtr = [r for r in rows if 0.15 <= r[0] <= 0.35 or 0.65 <= r[0] <= 0.85]
end = [r for r in rows if r[0] < 0.1 or r[0] > 0.9]
for name, g in (('the middle of the month', mid), ('a quarter and three quarters through', qtr), ("the month's ends", end)):
    if g: print('%-38s footage %.3f  build %.3f  (%d days)'
                % (name, float(np.nanmean([a for _, a, _ in g])), float(np.nanmean([b for _, _, b in g])), len(g)))
