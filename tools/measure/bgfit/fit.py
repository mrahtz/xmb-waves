# CMA-ES fit of the background settings and the months' painted images against the footage backgrounds (bgworker.js, GPU
# renders). Spec 23: each image is a coarse grid of freely chosen colours, so the images and the lighting terms are fitted
# together, in blocks and then jointly.
# usage: python fit.py PAGE OUT.json [GENS] [WORKERS] [--start best.json] [--block light|pal|all|MONTHS] [--sigma 0.08]
#   --block light        the lighting terms only (every condition)
#   --block 0,1          the images of those months only (the conditions that show them)
#   --block all          everything at once (the default)
import sys, json, subprocess, threading, time, math, numpy as np, os
D = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[1:]; args = []; opt = {}
i = 0
while i < len(argv):
    if argv[i].startswith('--'): opt[argv[i][2:]] = argv[i + 1]; i += 2
    else: args.append(argv[i]); i += 1
PAGE, OUT = args[0], args[1]; GENS = int(args[2]) if len(args) > 2 else 200; NW = int(args[3]) if len(args) > 3 else 6
np.random.seed(int(opt.get('seed', 1)))
META = json.load(open(os.path.join(D, '..', 'work', 'bgfit', 'meta.json')))
MONTHS = (0, 1, 3, 4, 6, 7, 9, 10)   # the months the footage shows (the 15th of a month shows it mixed with the next)

class Worker:
    def __init__(s):
        s.p = subprocess.Popen(['node', os.path.join(D, 'bgworker.js'), PAGE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        s.ready = json.loads(s.p.stdout.readline())
    def ev(s, p, imgs=False):
        s.p.stdin.write(json.dumps({'id': 0, 'p': p, 'imgs': imgs}) + '\n'); s.p.stdin.flush()
        return json.loads(s.p.stdout.readline())

WS = [Worker() for _ in range(NW)]
DEF = WS[0].ready['def']
GW, GH, NGH = DEF['grid']          # the grids' shape (columns, day rows, night rows)
NDAY, NNIGHT = GW * GH * 3, GW * NGH * 3
LIGHT = [('BGL', 'base', .25, .9), ('BGL', 'spot', 0, .75), ('BGL', 'ovalX', .55, 1.5), ('BGL', 'ovalY', .5, 1.6),
         ('BGL', 'spotW', .35, 1.5), ('BGL', 'spotH', .3, 1.4), ('BGL', 'glow', 0, .75), ('BGL', 'bandX', 0, .45),
         ('BGL', 'bandW', .35, 1.5), ('BGL', 'bandY', -.3, 0), ('BGL', 'bandH', .2, 1.2), ('BGL', 'bandWide', 0, 2),
         ('BGL', 'bandWidePow', .5, 8), ('BGL', 'pale', 0, 2.2), ('BGL', 'midSat', .3, .8), ('BGL', 'topDark', 1, 4),
         ('BGL', 'topSat', .5, 8), ('BGL', 'topPow', .3, 3), ('BGL', 'nightMix', .3, .8), ('BGL', 'nightBase', 0, .9),
         ('BGL', 'nightFloor', .3, .8), ('BGW', 'warp', .2, .9), ('BGW', 'noon', 11.5, 12.5), ('BGW', 'dayFloor', 0, .05),
         ('BGW', 'mornAt', 0, 2.4), ('BGW', 'mornW', .3, 3.1), ('BGW', 'eveAt', 0, 2.4), ('BGW', 'eveW', .3, 3.1),
         ('BGW', 'topMornW', .05, 3.1), ('BGW', 'topEveW', .05, 3.1), ('BGW', 'envPow', .3, 8)]
def palspec(months):
    out = []
    for mo in months:
        out += [('PAL', mo, 'day', i, 0, 1.5) for i in range(NDAY)]
        out += [('PAL', mo, 'night', i, 0, 1.5) for i in range(NNIGHT)]
    return out

block = opt.get('block', 'all')
if block == 'light': SPEC, BMON = LIGHT, ()
elif block == 'all': SPEC, BMON = LIGHT + palspec(MONTHS), MONTHS
else:
    BMON = tuple(int(x) for x in block.split(','))
    SPEC = palspec(BMON)
# the conditions a block needs: all of them when the lighting is fitted, else those that show one of its months
def condmonths(t):
    mon = int(t[5:7]); return (mon - 1, mon % 12)
CONDS = list(range(len(META))) if block in ('light', 'all') else \
    [j for j, c in enumerate(META) if set(condmonths(c['time'])) & set(BMON)]
HASLIGHT = block in ('light', 'all')
start = json.load(open(opt['start']))['p'] if 'start' in opt else {}

def merged():
    pal = json.loads(json.dumps(DEF['PAL']))
    for mo, P in start.get('PAL', {}).items(): pal[int(mo)].update(P)
    return {'BGL': {**DEF['BGL'], **start.get('BGL', {})}, 'BGW': {**DEF['BGW'], **start.get('BGW', {})}, 'PAL': pal}
def getv(s, src):
    if s[0] != 'PAL': return src[s[0]][s[1]]
    return src['PAL'][s[1]][s[2]][s[3]]
SRC = merged()
lo = np.array([s[-2] for s in SPEC], dtype=float); hi = np.array([s[-1] for s in SPEC], dtype=float)
x0 = np.clip(np.array([getv(s, SRC) for s in SPEC], dtype=float), lo, hi)
pal0 = np.array([getv(s, SRC) for s in SPEC], dtype=float)
ispal = np.array([s[0] == 'PAL' for s in SPEC])

def build(x):
    src = json.loads(json.dumps(SRC))
    for s, v in zip(SPEC, x):
        if s[0] != 'PAL': src[s[0]][s[1]] = float(v)
        else: src['PAL'][s[1]][s[2]][s[3]] = float(v)
    return {'BGL': src['BGL'], 'BGW': src['BGW'], 'PAL': {str(mo): P for mo, P in enumerate(src['PAL'])}}

def light_pen(b):
    """what the spec asks of the lights themselves (23): the two lifts add and their total cannot carry the picture past
    the image's own colour; the spot's centre crosses the bottom edge towards the warped end of the daylight hours and is
    far below the picture at midnight; the evening fall of the daylight factor is the steeper side"""
    L, W = b['BGL'], b['BGW']; pen = 0
    pen += 50 * max(0, L['base'] + L['spot'] + L['glow'] - 1) + 50 * max(0, L['nightBase'] + L['spot'] + L['glow'] - 1)
    ce = math.pi - W['eveAt'] - W['eveW'] / 2                     # the evening turn of the daylight factor
    pen += 30 * max(0, 1 - L['ovalY'] * (1 - math.cos(ce)))       # crosses the bottom edge by then
    pen += 30 * max(0, 0.75 - L['ovalY'])                         # far below the picture at midnight
    pen += 10 * max(0, W['eveW'] - W['mornW'])                    # the evening fall the steeper of the two
    return pen

def spec_pen(cv, b):
    """soft penalties for what the spec asks of the picture over the day (N8, the night floor, the daylight factor's peak
    in the later afternoon), on October 4"""
    A = {c['h']: c for c in cv}; a = lambda h: A[h]['all']; noon = a(12.0); pen = 0
    mn = min((A[h]['all'], h) for h in np.arange(0, 6.5, 0.5))
    pen += 50 * max(0, a(2.0) - 0.95 * a(0.0)) / noon                 # darkest after midnight, darker than at midnight
    pen += 5 * (max(0, 1.5 - mn[1]) + max(0, mn[1] - 3.0))            # the minimum about 02:00
    pen += 20 * max(0, a(3.0) / noon - 0.45) + 20 * max(0, 0.75 - a(6.0) / noon)   # steep rise 03:00-06:00
    pen += 20 * max(0, 0.6 - a(19.0) / noon) + 20 * max(0, a(22.0) / noon - 0.3)   # fades 19:00-22:00
    # the night image at its floor almost everywhere near dusk and dawn, and clear of it in the middle of the night: the
    # enveloped level is compared with the floor at a typical lit place (half of what the two lights can lift) and, at
    # midnight, where they lift most
    L = b['BGL']; lit = L['nightBase'] + 0.5 * (L['spot'] + L['glow']); full = min(1.0, L['nightBase'] + L['spot'] + L['glow'])
    for h in (19.0, 4.5): pen += 30 * max(0, A[h]['env'] * lit - L['nightFloor'])
    pen += 30 * max(0, 1.5 * L['nightFloor'] - A[0.0]['env'] * full)
    # (spec 23: which side of the lower part is the brighter at night is partly painted into the month's night image and
    # is read from the footage at 21:30, so it is no longer asked of the picture here; the night light's travel across the
    # night is in the model's own clock)
    hp = max(cv, key=lambda c: c['day'])['h']                         # the daylight factor peaks in the later afternoon
    pen += 5 * (max(0, 13.0 - hp) + max(0, hp - 18.0))
    return pen

import colorsys
def rows(G, gw, nr):
    return [[sum(G[(j * gw + i) * 3 + c] for i in range(gw)) / gw for c in range(3)] for j in range(nr)]
def family_pen(b):
    """keeps each fitted month in its colour family (spec 7): silver (January) near neutral, the others' rows within 20
    degrees of hue of the starting images' and within a factor 1.5 in value"""
    pen = 0
    for mo in BMON:
        P = b['PAL'][str(mo)]; P0 = DEF['PAL'][mo]
        for k, nr in (('day', GH), ('night', NGH)):
            for r, r0 in zip(rows(P[k], GW, nr), rows(P0[k], GW, nr)):
                h, sv, v = colorsys.rgb_to_hsv(*r); h0, s0, v0 = colorsys.rgb_to_hsv(*r0)
                if v0 < 0.02: continue                              # a row the starting image leaves black
                pen += 20 * max(0, abs(math.log(max(v, 1e-3) / v0)) - math.log(1.5))
                if mo == 0:
                    pen += 100 * max(0, sv - (0.12 if k == 'day' else 0.35)); continue
                if sv > 0.1: pen += 0.2 * max(0, abs((h - h0 + 0.5) % 1 - 0.5) * 360 - (20 if k == 'day' else 40))
    return pen

def pal_pen(b):
    """keeps each painted image a picture of one palette: its hue stays in a band about the image's own mean hue, and the
    variation across the width stays gentle beside the one down the image (3.1). Without this the fit paints two
    consecutive months in complementary colours that cancel in the mid-month mix, which the footage cannot tell apart."""
    pen = 0
    for mo in BMON:
        P = b['PAL'][str(mo)]
        for k, nr in (('day', GH), ('night', NGH)):
            G = np.array(P[k]).reshape(nr * GW, 3)
            mean = G.mean(0)
            if max(mean) < 1e-3: continue
            h0 = colorsys.rgb_to_hsv(*mean)[0]
            for c in G:
                if max(c) < 0.08: continue
                h, sv, _ = colorsys.rgb_to_hsv(*c)
                if sv < 0.15: continue           # hue means nothing in a near-neutral corner of the image
                pen += 0.02 * max(0, abs((h - h0 + 0.5) % 1 - 0.5) * 360 - 30)
            R = G.reshape(nr, GW, 3)
            pen += 5 * float(np.maximum(R.max(1) - R.min(1) - 0.45, 0).sum())
    return pen

def rough_pen(b):
    """the images stay coarse and smooth: the second differences of each grid, across and down, are kept small, so the fit
    cannot take in the footage's noise or paint in what belongs to the lighting"""
    s = 0.0; n = 0
    for mo in BMON:
        P = b['PAL'][str(mo)]
        for k, nr in (('day', GH), ('night', NGH)):
            G = np.array(P[k]).reshape(nr, GW, 3)
            if GW > 2: d = G[:, :-2] - 2 * G[:, 1:-1] + G[:, 2:]; s += float((d * d).sum()); n += d.size
            if nr > 2: d = G[:-2] - 2 * G[1:-1] + G[2:]; s += float((d * d).sum()); n += d.size
    return 20 * s / max(n, 1)

def loss(x, w):
    b = build(x)
    if HASLIGHT: b['curve'] = '2026-10-04'
    b['conds'] = CONDS
    r = w.ev(b); e = np.array(r['err'])
    pen = light_pen(b) + family_pen(b) + pal_pen(b) + rough_pen(b) + (spec_pen(r['curve'], b) if HASLIGHT else 0)
    reg = 5 * np.mean((x[ispal] - pal0[ispal]) ** 2) if ispal.any() else 0
    # (the worker also returns the signed mean difference per region, as the battery's bgpixel measures take it; adding
    # its square to the objective with weight 2 was tried and dropped: it lowered the regional bias by 9 % and raised the
    # absolute difference by 6 %, see the tuning log)
    pen += float(opt.get('regions', 0)) * float(np.mean(np.asarray(r['regs']) ** 2))
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
    json.dump({'loss': best[0], 'conds': CONDS, 'err': list(best[2]), 'p': build(best[1]),
               'named': {('%s.%s' % (s[0], s[1]) if s[0] != 'PAL' else 'PAL.%d.%s.%d' % (s[1], s[2], s[3])): float(v) for s, v in zip(SPEC, best[1])}},
              open(OUT, 'w'), indent=1)

if 'explain' in opt:
    b = build(x0); b['conds'] = CONDS
    if HASLIGHT: b['curve'] = '2026-10-04'
    r = WS[0].ev(b)
    print('err %.3f  light %.3f  spec %.3f  family %.3f  pal %.3f  rough %.3f  reg %.3f  | regional bias RMS %.3f' % (
        np.mean(r['err']), light_pen(b), spec_pen(r['curve'], b) if HASLIGHT else 0, family_pen(b), pal_pen(b),
        rough_pen(b), 5 * np.mean((x0[ispal] - pal0[ispal]) ** 2) if ispal.any() else 0,
        np.sqrt(np.mean(np.asarray(r['regs']) ** 2))))
    print('conditions', [META[j]['time'] for j in CONDS])
    print('per condition', np.round(r['err'], 2))
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
print('n %d lambda %d conditions %d start %.3f  per condition %s' % (n, lam, len(CONDS), f0, np.round(e0, 1)), flush=True)
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
