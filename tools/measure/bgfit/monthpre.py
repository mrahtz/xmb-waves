# A coarse first move for each month's images before the grids themselves are fitted (spec 33: every month wants footage
# of its own month, and the months a measurement set never covered start far from it). Per month, the day image and the
# night image are each scaled by one factor per channel - six numbers for the month - by coordinate descent against the
# conditions that show that month alone (the 4th, inside the first week, where next month's images have not begun to
# rise). That takes the gross colour and level of a month to where the footage wants it; the grids' own shape is left to
# the fit that follows, which cannot make a move this large in one step.
# usage: python monthpre.py PAGE START.json OUT.json [--months 0,1,..] [--steps 0.12]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]
months = tuple(range(12)); step0 = 0.12
if '--months' in argv:
    i = argv.index('--months'); months = tuple(int(x) for x in argv[i + 1].split(',')); del argv[i:i + 2]
if '--steps' in argv:
    i = argv.index('--steps'); step0 = float(argv[i + 1]); del argv[i:i + 2]
PAGE, START, OUT = argv[0], argv[1], argv[2]
meta = json.load(open(os.path.join(D, 'meta.json')))
start = json.load(open(START))['p'] if START != '-' else {}

w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), PAGE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
DEF = json.loads(w.stdout.readline())['def']
PAL = json.loads(json.dumps(DEF['PAL']))
for mo, P in start.get('PAL', {}).items():
    for k, v in P.items(): PAL[int(mo)][k] = v
BASE = {'BGL': dict(DEF['BGL'], **start.get('BGL', {})), 'BGW': dict(DEF['BGW'], **start.get('BGW', {}))}

def ev(pal, conds):
    p = dict(BASE); p['PAL'] = {str(m): {'day': list(pal[m]['day']), 'night': list(pal[m]['night'])} for m in range(12)}
    p['conds'] = conds
    w.stdin.write(json.dumps({'id': 0, 'p': p}) + '\n'); w.stdin.flush()
    return float(np.mean(json.loads(w.stdout.readline())['err']))

print('%-7s %7s %7s   %s' % ('month', 'before', 'after', 'day and night gains per channel'))
for m in months:
    # the conditions that show this month alone
    conds = [j for j, c in enumerate(meta) if int(c['time'][5:7]) - 1 == m and c['time'][8:10] == '04']
    if not conds: print('%-7d no condition shows this month alone' % m); continue
    G0 = {k: np.array(PAL[m][k], dtype=float) for k in ('day', 'night')}
    g = np.ones(6)
    def apply(g):
        out = json.loads(json.dumps(PAL))
        for k, off in (('day', 0), ('night', 3)):
            A = G0[k].reshape(-1, 3) * g[off:off + 3]
            out[m][k] = list(np.clip(A, 0, 1.5).reshape(-1))
        return out
    best = ev(apply(g), conds); before = best
    stp = step0
    for sweep in range(4):
        moved = False
        for i in range(6):
            for d in (+1, -1):
                t = g.copy(); t[i] *= (1 + d * stp)
                e = ev(apply(t), conds)
                if e < best - 1e-4: best, g, moved = e, t, True
        if not moved: stp *= 0.5
    PAL[m] = apply(g)[m]
    print('%-7d %7.2f %7.2f   %s' % (m + 1, before, best, ' '.join('%.3f' % v for v in g)))
w.stdin.write('{"quit":1}\n'); w.stdin.flush()
json.dump({'p': {'BGL': BASE['BGL'], 'BGW': BASE['BGW'],
                 'PAL': {str(m): {'day': list(PAL[m]['day']), 'night': list(PAL[m]['night'])} for m in range(12)}}},
          open(OUT, 'w'), indent=1)
print('wrote', OUT)
