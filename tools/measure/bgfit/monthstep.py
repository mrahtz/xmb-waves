# Where the month handover's step sits and how broad it is, day by day (spec 34).
#
# At one fixed daytime hour, through the days of one month: the height of the row at which the picture is halfway
# between the colours that same month shows on its own first day and on its last, and the height over which that
# halfway crossing is spread. Both are read from the bottom edge upwards, where next month's picture comes in.
#
# Per row, the picture of day d is projected onto the line between the first day's row and the last day's row, in the
# three channels together: f = <row(d) - row(A), row(B) - row(A)> / |row(B) - row(A)|^2, so f = 0 is this month alone
# and f = 1 is next month's alone. The crossing is the lowest height at which the smoothed f passes 0.5, and the spread
# is the height between its passing 0.25 and 0.75. Rows where the two end days differ too little to divide by are left
# out. Which end of the reading is which is checked against a night condition, where the picture is bright along the
# bottom and black at the top (--check); an inverted reading turns this observable's answer upside down.
#
# usage: python monthstep.py PAGE [FIT.json] [--month 4] [--hour 12] [--check 2026-04-15T00:00:00]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]; month = 4; hour = '12'; check = None
for k, cast in (('--month', int), ('--hour', str), ('--check', str)):
    if k in argv:
        i = argv.index(k); v = cast(argv[i + 1]); del argv[i:i + 2]
        if k == '--month': month = v
        elif k == '--hour': hour = v
        else: check = v
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
p = json.load(open(argv[1]))['p'] if len(argv) > 1 else {}
JS = [j for j, c in enumerate(meta) if int(c['time'][5:7]) == month and c['time'][11:13] == hour]
JS.sort(key=lambda j: meta[j]['time'])
if check is not None: JS += [j for j, c in enumerate(meta) if c['time'] == check]
JS = sorted(set(JS))     # the worker returns the images in the conditions' own order, so ask for them in that order
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), argv[0]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline()
imgs = {}
for i in range(0, len(JS), 12):
    cs = JS[i:i + 12]
    w.stdin.write(json.dumps({'id': 0, 'p': dict(p, conds=cs), 'imgs': True}) + '\n'); w.stdin.flush()
    r = json.loads(w.stdout.readline())
    for j, im in zip(cs, r['imgs']): imgs[j] = np.array(im, dtype=np.float32).reshape(135, 240, 4)[..., :3]
w.stdin.write('{"quit":1}\n'); w.stdin.flush()

def rowmeans(A, keep):
    """the mean colour of each row over the pixels no clip of the condition shows the wave in, bottom row first"""
    k = (keep > 0)[::-1, :, None].astype(np.float32); a = A[::-1] * k
    n = k.sum(1)
    return np.where(n > 20, a.sum(1) / np.maximum(n, 1), np.nan)
def crossing(rA, rB, rD):
    """the height (0 at the bottom edge, 1 at the top) at which the picture is halfway from rA to rB, and the height
    over which that crossing is spread"""
    d = rB - rA; w = (d * d).sum(1)
    f = np.where(w > 1.0, ((rD - rA) * d).sum(1) / np.maximum(w, 1e-6), np.nan)
    y = np.arange(len(f)) / (len(f) - 1.0)
    ok = np.isfinite(f)
    if ok.sum() < 20: return np.nan, np.nan
    f = np.interp(y, y[ok], f[ok])
    f = np.convolve(f, np.ones(9) / 9, mode='same')
    def at(level):
        for i in range(1, len(f)):
            if (f[i - 1] - level) * (f[i] - level) <= 0 and f[i] != f[i - 1]:
                return y[i - 1] + (y[i] - y[i - 1]) * (level - f[i - 1]) / (f[i] - f[i - 1])
        return np.nan
    return at(0.5), at(0.75) - at(0.25)

DAYS = [j for j in JS if meta[j]['time'][11:13] == hour]
A, B = DAYS[0], DAYS[-1]
print('the month handover read from the bottom edge upwards (spec 34): month %d at %s:00' % (month, hour))
print('the ends of the reading are %s (this month alone) and %s (next month alone)'
      % (meta[A]['time'][:10], meta[B]['time'][:10]))
print('%-12s %14s %14s' % ('day', 'halfway height', 'spread'))
print('%-12s %6s %6s  %6s %6s' % ('', 'foot', 'build', 'foot', 'build'))
rows = []
for j in DAYS:
    c = meta[j]
    fh, fs = crossing(rowmeans(T[A], K[A]), rowmeans(T[B], K[B]), rowmeans(T[j], K[j]))
    bh, bs = crossing(rowmeans(imgs[A], K[A]), rowmeans(imgs[B], K[B]), rowmeans(imgs[j], K[j]))
    print('%-12s %6.3f %6.3f  %6.3f %6.3f' % (c['time'][:10], fh, bh, fs, bs))
    rows.append((fh, bh, fs, bs))
d = [abs(a - b) for a, b, _, _ in rows if a == a and b == b]
print('mean absolute difference in the halfway height: %.3f of the frame over %d days' % (float(np.mean(d)), len(d)))
if check is not None:
    j = [k for k, c in enumerate(meta) if c['time'] == check][0]
    r = rowmeans(T[j], K[j]).mean(1); rb = rowmeans(imgs[j], K[j]).mean(1)
    print('which end is which, on %s (bright along the bottom, black at the top): footage %.1f levels at the bottom '
          'against %.1f at the top, build %.1f against %.1f'
          % (check, np.nanmean(r[:14]), np.nanmean(r[-14:]), np.nanmean(rb[:14]), np.nanmean(rb[-14:])))
