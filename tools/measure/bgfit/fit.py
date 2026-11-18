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
MONTHS = tuple(range(12))   # every month (spec 33: every month wants footage of its own month, and the set now has it:
# the 4th of each month shows it alone, the 15th shows it mixed with the next)

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
# spec 28: the clock's curves are all products of one pair of steps at two rates in fixed proportion (BGW.stepW and
# BGW.stepRatio), placed where the spot's centre crosses the bottom edge (so BGL.ovalY places them too); the glow's
# broadening now has a window (bandWideW) instead of an exponent; the shapings down the frame are proportional in the
# height (no topPow); and no floor stands in for a step's tail (no dayFloor). Spec 33: one rate in the height
# (BGL.heightRate) serves all three falls and only their clocks differ, so there is no topDark, topSat or nightTop to fit;
# what the saturation's raise needs instead is the ceiling it levels off towards (BGL.satCeil).
# Spec 34: one unlit share serves both arms, so there is no nightBase to fit; the floor under the night level is a share
# of that one share (nightFloorF below 1), so it always lies below it and a night arm cannot be fitted under its own
# floor; the breadth of the mid-month lowering (midW) and the trace of it that survives the month's ends (midTrace) are
# fitted beside its depth; and where the month handover's step sits and how broad it is (monC0, monC1, monP0, monP1,
# monW0, monWMid, monWP) are fitted from footage like anything else.
LIGHT = [('BGL', 'base', .25, .9), ('BGL', 'spot', 0, .75), ('BGL', 'ovalX', .55, 1.5), ('BGL', 'ovalY', .5, 1.6),
         ('BGL', 'spotW', .35, 1.5), ('BGL', 'spotH', .3, 1.4), ('BGL', 'glow', 0, .75), ('BGL', 'bandX', 0, .45),
         ('BGL', 'bandW', .35, 1.5), ('BGL', 'bandY', 0, .25), ('BGL', 'bandH', .2, 1.2), ('BGL', 'bandWide', 0, 2),
         ('BGL', 'bandWideW', .03, .6), ('BGL', 'pale', 0, 2.2), ('BGL', 'midSat', .3, .8),
         ('BGL', 'midW', .1, .7), ('BGL', 'midTrace', 0, .5),
         ('BGL', 'monC0', -1.2, .3), ('BGL', 'monC1', .7, 2.2), ('BGL', 'monP0', .02, .45), ('BGL', 'monP1', .55, 1.1),
         ('BGL', 'monW0', .03, .8), ('BGL', 'monWMid', 0, 5), ('BGL', 'monWP', .04, .4),
         ('BGL', 'heightRate', .5, 12), ('BGL', 'satCeil', 0, 8), ('BGL', 'nightMix', .3, .8),
         ('BGL', 'nightFloorF', .05, .95), ('BGW', 'warp', .2, .9), ('BGW', 'noon', 11.5, 12.5),
         ('BGW', 'stepW', .15, 1.2), ('BGW', 'stepRatio', .15, .95)]
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
# The conditions of the measured footage index weigh more than the rest (--iw, default 3). The set is a mixture of two
# kinds of reference: the measured index, which holds the only recordings of the original and is what every lane is
# scored on from round to round, and the renders asked for to reach the months, the days and the hours it cannot (spec
# 33 and 34 ask for all three). An unweighted mean over the set lets 119 supplementary conditions outvote the 19 the
# project is judged on, and where one lighting model cannot satisfy both at once it is then fitted quietly away from
# them. The weight is on the condition, not on the clip.
MEASURED = set()
for _c in json.load(open(opt.get('measured', os.path.join('C:' + os.sep, 'xmb-share', 'footage', 'INDEX.json'))))['clips']:
    if _c['kind'] != 'noise': MEASURED.add(_c['date'] + 'T' + _c['time'])
IW = float(opt.get('iw', 3))
CW = np.array([IW if META[j]['time'] in MEASURED else 1.0 for j in CONDS], dtype=float)
CW /= CW.mean()
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

# the true largest lift the two lights ever put over one place, over the frame and over the whole turn of the angle
# (spec 34: nothing is clamped, and what keeps the picture inside the image's own colour is that the two lights are never
# over the same place; so what has to hold is base + this maximum < 1, and the sum of the two lifts is far too pessimistic
# a stand-in for it)
_GX, _GY = np.meshgrid(np.linspace(0, 1, 21), np.linspace(0, 1, 15))
def max_lift(L):
    best = 0.0
    for a in np.linspace(-np.pi, np.pi, 73):
        sx = (_GX - 0.5 - L['ovalX'] * np.sin(a)) / L['spotW']; sy = (_GY - 1 + L['ovalY'] * (1 - np.cos(a))) / L['spotH']
        bw = L['bandW'] * (1 + L['bandWide'] * np.exp(-(a / L['bandWideW']) ** 2))
        gx = (_GX - 0.5 + L['bandX'] * np.sin(a)) / bw; gy = (_GY - L['bandY']) / L['bandH']
        v = L['spot'] * np.exp(-sx * sx - sy * sy) + L['glow'] * np.exp(-gx * gx - gy * gy)
        best = max(best, float(v.max()))
    return best

def light_pen(b):
    """what the spec asks of the lights themselves (23, 34): the two lifts add, nothing is clamped, and the share and the
    largest total the geometry ever brings together over one place must stay inside the image's own colour - a build that
    would need a clamp has them too large between them; the spot's centre rises past the top edge and is far below the
    picture at midnight. (Spec 28: the crossing of the bottom edge is where the clock's steps are placed, so it no longer
    needs asking for; which end of the day is the sharp one is in the structure, not in the fit.)"""
    L = b['BGL']; pen = 0
    pen += 50 * max(0, L['base'] + max_lift(L) - 1)
    pen += 30 * max(0, 0.75 - L['ovalY'])                         # far below the picture at midnight
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
    L = b['BGL']; floor = L['base'] * L['nightFloorF']
    lit = L['base'] + 0.5 * (L['spot'] + L['glow']); full = L['base'] + max_lift(L)
    for h in (19.0, 4.5): pen += 30 * max(0, A[h]['env'] * lit - floor)
    pen += 30 * max(0, 1.5 * floor - A[0.0]['env'] * full)
    # (spec 23: which side of the lower part is the brighter at night is partly painted into the month's night image and
    # is read from the footage at 21:30, so it is no longer asked of the picture here; the night light's travel across the
    # night is in the model's own clock)
    hp = max(cv, key=lambda c: c['day'])['h']                         # the daylight factor peaks in the later afternoon
    pen += 5 * (max(0, 13.0 - hp) + max(0, hp - 18.0))
    # spec 28: the day's own light holds up - at nearly its full height from the middle of the morning right through to
    # the early evening - and its lowest point is local midnight
    dm = max(c['day'] for c in cv)
    for h in (9.0, 18.0): pen += 20 * max(0, 0.85 - A[h]['day'] / dm)
    pen += 20 * max(0, A[0.0]['day'] - min(c['day'] for c in cv) * 1.02)
    return pen

import colorsys
def rows(G, gw, nr):
    return [[sum(G[(j * gw + i) * 3 + c] for i in range(gw)) / gw for c in range(3)] for j in range(nr)]
def family_pen(b):
    """keeps each fitted month in its colour family (spec 7): silver (January) near neutral, the others' rows within 45
    degrees of hue of the starting images' and within a factor 2 in value. The bands were half this while most months
    had no footage of their own and their starting images were the only evidence there was; with every month's own
    footage in the set (spec 33) the footage is the better evidence, and the band only has to keep the month inside the
    family section 7 names for it."""
    pen = 0
    for mo in BMON:
        P = b['PAL'][str(mo)]; P0 = DEF['PAL'][mo]
        for k, nr in (('day', GH), ('night', NGH)):
            for r, r0 in zip(rows(P[k], GW, nr), rows(P0[k], GW, nr)):
                h, sv, v = colorsys.rgb_to_hsv(*r); h0, s0, v0 = colorsys.rgb_to_hsv(*r0)
                if v0 < 0.02: continue                              # a row the starting image leaves black
                pen += 20 * max(0, abs(math.log(max(v, 1e-3) / v0)) - math.log(2.0))
                if mo == 0:
                    pen += 100 * max(0, sv - (0.12 if k == 'day' else 0.35)); continue
                if sv > 0.1: pen += 0.2 * max(0, abs((h - h0 + 0.5) % 1 - 0.5) * 360 - (45 if k == 'day' else 60))
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
    """a light hand against the footage's own noise: the second differences of each grid, across and down, are kept small.
    Spec 33 withdraws the stronger form of this - smoothness is not the test of whether a description is too fine, and the
    description has to be free to put a bend away from the middle of the width and a knee above the bottom edge - so the
    weight is a quarter of what it was."""
    s = 0.0; n = 0
    for mo in BMON:
        P = b['PAL'][str(mo)]
        for k, nr in (('day', GH), ('night', NGH)):
            G = np.array(P[k]).reshape(nr, GW, 3)
            if GW > 2: d = G[:, :-2] - 2 * G[:, 1:-1] + G[:, 2:]; s += float((d * d).sum()); n += d.size
            if nr > 2: d = G[:-2] - 2 * G[1:-1] + G[2:]; s += float((d * d).sum()); n += d.size
    return 5 * s / max(n, 1)

# How high the night glow climbs (spec 28): read from the footage month by month at the dead of night as a property of
# the night image - the share of the bottom band's level left at 0.1, 0.2, 0.3 and 0.5 of the height - and asked of the
# build at the same conditions, because the lights move it very little and one painted fall has to serve the whole night.
ROWH = [13, 27, 40, 67]
ROWCONDS = [j for j, c in enumerate(META) if c['time'][11:13] == '00' and j in CONDS]
def rowshare(A, keep):
    a = (A.mean(2) * keep)[::-1].sum(1); n = keep[::-1].sum(1)
    pr = np.where(n > 20, a / np.maximum(n, 1), np.nan)
    return np.array([pr[y] for y in ROWH]) / max(np.nanmean(pr[:7]), 1e-6)
if ROWCONDS:
    _T = np.fromfile(os.path.join(D, '..', 'work', 'bgfit', 'targets.f32'), dtype=np.float32).reshape(len(META), 135, 240, 3)
    _K = np.fromfile(os.path.join(D, '..', 'work', 'bgfit', 'keep.u8'), dtype=np.uint8).reshape(len(META), 135, 240).astype(np.float32)
    ROWREF = {j: rowshare(_T[j], _K[j]) for j in ROWCONDS}
    del _T, _K
ROWW = float(opt.get('rows', 20))

def loss(x, w):
    b = build(x)
    if HASLIGHT: b['curve'] = '2026-10-04'
    b['conds'] = CONDS
    if ROWCONDS and ROWW: b['rows'] = ROWCONDS
    r = w.ev(b); e = np.array(r['err'])
    pen = light_pen(b) + family_pen(b) + pal_pen(b) + rough_pen(b) + (spec_pen(r['curve'], b) if HASLIGHT else 0)
    reg = 5 * np.mean((x[ispal] - pal0[ispal]) ** 2) if ispal.any() else 0
    # (the worker also returns the signed mean difference per region, as the battery's bgpixel measures take it; adding
    # its square to the objective with weight 2 was tried and dropped: it lowered the regional bias by 9 % and raised the
    # absolute difference by 6 %, see the tuning log)
    pen += float(opt.get('regions', 0)) * float(np.mean(np.asarray(r['regs']) ** 2))
    if ROWCONDS and ROWW and 'rows' in r:
        d = [np.asarray(r['rows'][str(j)], dtype=float) - ROWREF[j] for j in ROWCONDS]
        pen += ROWW * float(np.nanmean(np.asarray(d) ** 2))
    return float(np.average(e, weights=CW)) + reg + pen, e

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
    if ROWCONDS: b['rows'] = ROWCONDS
    r = WS[0].ev(b)
    rowd = np.asarray([np.asarray(r['rows'][str(j)], dtype=float) - ROWREF[j] for j in ROWCONDS]) if ROWCONDS else np.zeros(1)
    print('err %.3f  light %.3f  spec %.3f  family %.3f  pal %.3f  rough %.3f  reg %.3f  | regional bias RMS %.3f  night climb RMS %.3f' % (
        np.mean(r['err']), light_pen(b), spec_pen(r['curve'], b) if HASLIGHT else 0, family_pen(b), pal_pen(b),
        rough_pen(b), 5 * np.mean((x0[ispal] - pal0[ispal]) ** 2) if ispal.any() else 0,
        np.sqrt(np.mean(np.asarray(r['regs']) ** 2)), np.sqrt(np.nanmean(rowd ** 2))))
    print('conditions', [META[j]['time'] for j in CONDS])
    print('measured-index conditions in this block: %d of %d, at weight %g' % (int((CW > CW.min()).sum()), len(CONDS), IW))
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
print('n %d lambda %d conditions %d (%d of the measured index at weight %g) start %.3f  per condition %s'
      % (n, lam, len(CONDS), int((CW > CW.min()).sum()), IW, f0, np.round(e0, 1)), flush=True)
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
