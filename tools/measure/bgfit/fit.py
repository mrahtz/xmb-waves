# CMA-ES fit of the background settings and palettes against the footage backgrounds (bgworker.js, GPU renders)
# usage: python fit.py PAGE OUT.json [GENS] [WORKERS] [--start best.json] [--only light|pal] [--sigma 0.08]
import sys, json, subprocess, threading, time, math, numpy as np, os
D = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[1:]; args = []; opt = {}
i = 0
while i < len(argv):
    if argv[i].startswith('--'): opt[argv[i][2:]] = argv[i + 1]; i += 2
    else: args.append(argv[i]); i += 1
PAGE, OUT = args[0], args[1]; GENS = int(args[2]) if len(args) > 2 else 200; NW = int(args[3]) if len(args) > 3 else 6
np.random.seed(int(opt.get('seed', 1)))

class Worker:
    def __init__(s):
        s.p = subprocess.Popen(['node', os.path.join(D, 'bgworker.js'), PAGE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        s.ready = json.loads(s.p.stdout.readline())
    def ev(s, p, imgs=False):
        s.p.stdin.write(json.dumps({'id': 0, 'p': p, 'imgs': imgs}) + '\n'); s.p.stdin.flush()
        return json.loads(s.p.stdout.readline())

WS = [Worker() for _ in range(NW)]
DEF = WS[0].ready['def']
for _mo in (0, 1, 3, 4, 6, 7, 9, 10):   # every fitted month gets a middle colour (three stops down the image)
    _P = DEF['PAL'][_mo]
    if 'mid' not in _P: _P['mid'] = [(a + b) / 2 for a, b in zip(_P['top'], _P['bottom'])]
LIGHT = [('BGL', 'base', .3, 1), ('BGL', 'spot', 0, 1), ('BGL', 'ovalX', .55, 1.5), ('BGL', 'ovalY', .5, 1.2), ('BGL', 'spotW', .35, 1.5),
         ('BGL', 'spotH', .3, 1.2), ('BGL', 'glow', 0, 1), ('BGL', 'bandX', 0, .45), ('BGL', 'bandW', .35, 1.5), ('BGL', 'bandY', -.3, 0),
         ('BGL', 'bandH', .2, 1.2), ('BGL', 'pale', 0, .9), ('BGL', 'midSat', .3, .8), ('BGL', 'topDark', 1, 4), ('BGL', 'topSat', .5, 8),
         ('BGL', 'topPow', .3, 3), ('BGL', 'nightMix', .3, .8), ('BGL', 'nightBase', 0, .9), ('BGL', 'nightFloor', .3, .8),
         ('BGW', 'warp', .2, .9), ('BGW', 'noon', 11.5, 12.5), ('BGW', 'dayPow', .5, 5), ('BGW', 'dayFloor', 0, .05), ('BGW', 'a0', 1.0, 2.4),
         ('BGW', 'a1', 1.2, 3.1), ('BGW', 'envPow', .3, 8), ('NI', 'top', 0, .6), ('NI', 'pow', .5, 3), ('NI', 'side', 0, .5)]
PAL = []
for mo in (0, 1, 3, 4, 6, 7, 9, 10):
    P = DEF['PAL'][mo]
    for k in ('top', 'mid', 'bottom', 'glow'):
        if k in P: PAL += [('PAL', mo, k, i, 0, 1) for i in range(3)]
    PAL += [('PAL', mo, 'night', i, 0, 1) for i in range(3)]
    PAL += [('PAL', mo, 'glowPos', 0, 0, 1), ('PAL', mo, 'glowPos', 1, 0, .6), ('PAL', mo, 'glowSize', None, .35, .8), ('PAL', mo, 'tilt', None, -.4, .4)]
SPEC = (LIGHT if opt.get('only') != 'pal' else []) + (PAL if opt.get('only') != 'light' else [])
start = json.load(open(opt['start']))['p'] if 'start' in opt else {}

def merged():
    pal = json.loads(json.dumps(DEF['PAL']))
    for mo, P in start.get('PAL', {}).items(): pal[int(mo)].update(P)
    return {'BGL': {**DEF['BGL'], **start.get('BGL', {})}, 'BGW': {**DEF['BGW'], **start.get('BGW', {})},
            'NI': {**DEF['NI'], **start.get('NI', {})}, 'PAL': pal}
def getv(s, src):
    if s[0] != 'PAL': return src[s[0]][s[1]]
    v = src['PAL'][s[1]][s[2]]
    if s[2] == 'night': return v[0][s[3]]
    return v[s[3]] if s[3] is not None else v
SRC = merged()
lo = np.array([s[-2] for s in SPEC], dtype=float); hi = np.array([s[-1] for s in SPEC], dtype=float)
x0 = np.clip(np.array([getv(s, SRC) for s in SPEC], dtype=float), lo, hi)
pal0 = np.array([getv(s, DEF) for s in SPEC], dtype=float)
ispal = np.array([s[0] == 'PAL' for s in SPEC])

def build(x):
    src = json.loads(json.dumps(SRC))
    for s, v in zip(SPEC, x):
        if s[0] != 'PAL': src[s[0]][s[1]] = float(v); continue
        P = src['PAL'][s[1]]
        if s[2] == 'night': P['night'][0][s[3]] = float(v)
        elif s[3] is not None: P[s[2]][s[3]] = float(v)
        else: P[s[2]] = float(v)
    return {'BGL': src['BGL'], 'BGW': src['BGW'], 'NI': src['NI'], 'PAL': {str(mo): P for mo, P in enumerate(src['PAL'])}}

def spec_pen(cv, b):
    """soft penalties for what the spec asks of the picture over the day (N8, the night floor), on October 4"""
    A = {c['h']: c for c in cv}; a = lambda h: A[h]['all']; noon = a(12.0); pen = 0
    mn = min((A[h]['all'], h) for h in np.arange(0, 6.5, 0.5))
    pen += 50 * max(0, a(2.0) - 0.95 * a(0.0)) / noon                 # darkest after midnight, darker than at midnight
    pen += 5 * (max(0, 1.5 - mn[1]) + max(0, mn[1] - 3.0))            # the minimum about 02:00
    pen += 20 * max(0, a(3.0) / noon - 0.45) + 20 * max(0, 0.75 - a(6.0) / noon)   # steep rise 03:00-06:00
    pen += 20 * max(0, 0.6 - a(19.0) / noon) + 20 * max(0, a(22.0) / noon - 0.3)   # fades 19:00-22:00
    for h in (19.0, 4.5): pen += 30 * max(0, A[h]['env'] - b['BGL']['nightFloor'])  # at its floor near dusk and dawn
    # the night glow's brighter side: on one side early in the night (the right, as the footage at 21:30 shows), on the
    # other by morning
    pen += 30 * max(0, 0.03 - A[22.0]['asym']) + 30 * max(0, A[2.0]['asym'] + 0.03) + 30 * max(0, A[3.0]['asym'] + 0.03)
    pen += 30 * max(0, 1.5 * b['BGL']['nightFloor'] - A[0.0]['env'] * 1.0)              # clear of it in the middle of the night
    return pen

import colorsys
def family_pen(b):
    """keeps each fitted month in its colour family (spec 7): silver (January) near neutral, the others' top, middle and
    bottom colours within 30 degrees of hue of the starting palettes'"""
    pen = 0
    for mo in (0, 1, 3, 4, 6, 7, 9, 10):
        P = b['PAL'][str(mo)]; P0 = DEF['PAL'][mo]
        for k in ('top', 'mid', 'bottom'):
            if k not in P: continue
            h, sv, _ = colorsys.rgb_to_hsv(*P[k]); h0, s0, _ = colorsys.rgb_to_hsv(*P0[k])
            v = max(P[k]); v0 = max(P0[k])
            pen += 20 * max(0, abs(math.log(max(v, 1e-3) / v0)) - math.log(1.5))   # brightness within a factor 1.5
            if mo == 0: pen += 100 * max(0, sv - 0.12) + 100 * max(0, 0.4 - v); continue
            dh = abs((h - h0 + 0.5) % 1 - 0.5) * 360
            if sv > 0.1: pen += 0.2 * max(0, dh - 20)
        h, sv, _ = colorsys.rgb_to_hsv(*P['night'][0]); h0, s0, _ = colorsys.rgb_to_hsv(*P0['night'][0])
        if mo == 0: pen += 20 * max(0, sv - 0.35)
        elif sv > 0.1: pen += 0.2 * max(0, abs((h - h0 + 0.5) % 1 - 0.5) * 360 - 40)
    return pen

def loss(x, w):
    b = build(x); b['curve'] = '2026-10-04'
    r = w.ev(b); e = np.array(r['err']); sp = spec_pen(r['curve'], b)
    reg = 20 * np.mean((x[ispal] - pal0[ispal]) ** 2) if ispal.any() else 0
    pen = 10 * max(0, b['BGW']['a0'] + 0.1 - b['BGW']['a1']) + sp + family_pen(b)
    return float(e.mean() + reg + pen), e

def evalall(X):
    res = [None] * len(X); q = list(range(len(X))); lk = threading.Lock()
    def run(w):
        while True:
            with lk:
                if not q: return
                i = q.pop()
            res[i] = loss(X[i], w)
    th = [threading.Thread(target=run, args=(w,)) for w in WS]; [t.start() for t in th]; [t.join() for t in th]
    return res

def save(best):
    json.dump({'loss': best[0], 'err': list(best[2]), 'p': build(best[1]),
               'named': {('%s.%s' % (s[0], s[1]) if s[0] != 'PAL' else 'PAL.%d.%s.%s' % (s[1], s[2], s[3])): float(v) for s, v in zip(SPEC, best[1])}},
              open(OUT, 'w'), indent=1)

if 'explain' in opt:
    b = build(x0); b['curve'] = '2026-10-04'; r = WS[0].ev(b)
    print('err %.3f  spec %.3f  family %.3f  reg %.3f' % (np.mean(r['err']), spec_pen(r['curve'], b), family_pen(b), 20 * np.mean((x0[ispal] - pal0[ispal]) ** 2)))
    for mo in (0, 1, 3, 4, 6, 7, 9, 10):
        P = b['PAL'][str(mo)]; P0 = DEF['PAL'][mo]
        for k in ('top', 'mid', 'bottom'):
            h, sv, v = colorsys.rgb_to_hsv(*P[k]); h0, s0, v0 = colorsys.rgb_to_hsv(*P0[k])
            print(mo + 1, k, 'hue %.0f/%.0f sat %.2f/%.2f val %.2f/%.2f' % (h * 360, h0 * 360, sv, s0, v, v0))
    for w in WS: w.p.stdin.write('{"quit":1}' + chr(10)); w.p.stdin.flush()
    sys.exit()
n = len(SPEC); z0 = (x0 - lo) / (hi - lo)
lam = max(4 + int(3 * math.log(n)), 2 * NW); lam = (lam + NW - 1) // NW * NW; mu = lam // 2
wts = np.log(mu + 0.5) - np.log(np.arange(1, mu + 1)); wts /= wts.sum(); mueff = 1 / np.sum(wts ** 2)
cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n); cs = (mueff + 2) / (n + mueff + 5)
c1 = 2 / ((n + 1.3) ** 2 + mueff); cmu = min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff))
damps = 1 + 2 * max(0, math.sqrt((mueff - 1) / (n + 1)) - 1) + cs; chiN = math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n))
sigma = float(opt.get('sigma', 0.08)); m = z0.copy(); C = np.eye(n); pc = np.zeros(n); ps = np.zeros(n)
f0, e0 = loss(x0, WS[0]); best = (f0, x0, e0)
print('n %d lambda %d start %.3f  per condition %s' % (n, lam, f0, np.round(e0, 1)), flush=True)
t0 = time.time()
for g in range(GENS):
    Dg, B = np.linalg.eigh(C); Dg = np.sqrt(np.maximum(Dg, 1e-20))
    Z = np.random.randn(lam, n); Y = (Z * Dg) @ B.T; Zs = m + sigma * Y
    X = lo + np.clip(Zs, 0, 1) * (hi - lo)
    R = evalall(X); F = np.array([r[0] for r in R]) + 1.0 * np.sum((Zs - np.clip(Zs, 0, 1)) ** 2, axis=1)
    idx = np.argsort(F)
    if R[idx[0]][0] < best[0]: best = (R[idx[0]][0], X[idx[0]], R[idx[0]][1])
    yw = wts @ Y[idx[:mu]]; m = m + sigma * yw
    invsq = (B / Dg) @ B.T
    ps = (1 - cs) * ps + math.sqrt(cs * (2 - cs) * mueff) * invsq @ yw
    hs = np.linalg.norm(ps) / math.sqrt(1 - (1 - cs) ** (2 * (g + 1))) / chiN < 1.4 + 2 / (n + 1)
    pc = (1 - cc) * pc + hs * math.sqrt(cc * (2 - cc) * mueff) * yw
    C = (1 - c1 - cmu) * C + c1 * (np.outer(pc, pc) + (1 - hs) * cc * (2 - cc) * C) + cmu * (Y[idx[:mu]].T * wts) @ Y[idx[:mu]]
    sigma *= math.exp((cs / damps) * (np.linalg.norm(ps) / chiN - 1))
    if g % 10 == 0 or g == GENS - 1:
        print('gen %d  best %.3f  gen-best %.3f  sigma %.4f  %.0f s' % (g, best[0], F[idx[0]], sigma, time.time() - t0), flush=True)
        save(best)
print('final %.3f per condition %s' % (best[0], np.round(best[2], 1)))
save(best)
for w in WS: w.p.stdin.write('{"quit":1}\n'); w.p.stdin.flush()
