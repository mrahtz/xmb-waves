# sparkmapfit.py: fits the sparkle colour map's lobes and the lighting constants to the footage's per-sparkle colour and
# brightness distributions, in an offline model of the sparkle shader (diffuse + highlight tinted by the map, through the
# saturating curve, times the intensity and the tilt fade) evaluated on samples written by sparkdump.js.
# usage: python3 sparkmapfit.py 'DUMP_GLOB' SEED ITERATIONS TILTPOW OUT.json
# The candidate lobe places are a staggered 8 x 4 grid over the part of the map the highlights fall on; each gets one of
# six colour families or none (at least 35 % none, so near-neutral regions remain). Simulated annealing over the families
# and the continuous constants (lobe radius, map strength, diffuse, highlight, shininess, saturating gain, brightness
# scale). Targets: spark21.py's measures of the footage (16 lossless renders and 48 noise clips), with the colour targets
# lowered by the measuring floor (dither and background) and the brightness targets by the model-to-render bias, both
# measured on renders of the build. The model reproduces a render's per-sparkle saturation and hue exactly.
import sys, json, glob, numpy as np
DUMPS, SEED, ITERS, TILTPOW, OUT = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
D = np.concatenate([np.array(json.load(open(f))) for f in sorted(glob.glob(DUMPS))])
D = D[np.random.default_rng(0).permutation(len(D))[:60000]]
qx, qy, diff, ndh, c, Iv, px = (D[:, i] for i in range(7))
def iri(lobes, mapStr=1.0, mapR=1.0):
    acc = np.zeros((len(qx), 3)); W = np.zeros(len(qx))
    for (x, y, r, s, col) in lobes:
        w = s * mapStr * np.exp(-((qx - x) ** 2 + (qy - y) ** 2) / (r * mapR) ** 2)
        acc += w[:, None] * np.array(col)[None]; W += w
    m = np.minimum(W, 1)[:, None]; base = np.where(W[:, None] > 1e-4, acc / np.maximum(W, 1e-9)[:, None], 1.0)
    return 1 + (base - 1) * m
def model(lobes, kd=0.25, ks=1.5, shin=40, satGain=1.5, tiltPow=1.0, bright=1.0, mapStr=1.0, mapR=1.0):
    spec = ndh ** shin; ir = iri(lobes, mapStr, mapR)
    vC = 1 - np.exp(-satGain * (kd * diff[:, None] + ks * spec[:, None] * ir))
    tilt = 1 - (1 - c) ** tiltPow
    lev = 255 * vC * (Iv * tilt * bright)[:, None]
    mx = lev.max(1); sat = (mx - lev.min(1)) / np.maximum(mx, 1e-3); P = lev.mean(1)
    r, g, b = lev[:, 0], lev[:, 1], lev[:, 2]; hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
    return P, sat, hue
def stats(P, sat, hue, out=True):
    br = P >= 20; s = sat[br]; t1, t2 = np.percentile(P[br], [33.3, 66.7]); pb = P[br]
    J = dict(n_vis=np.mean(P >= 6), p50=np.percentile(P[P >= 6], 50), p90=np.percentile(P[P >= 6], 90), p99=np.percentile(P[P >= 6], 99),
             gt35=np.mean(s > .35), gt50=np.mean(s > .5), lo=np.mean(s[pb < t1] > .35), mid=np.mean(s[(pb >= t1) & (pb < t2)] > .35),
             hi=np.mean(s[pb >= t2] > .35), med_hi=np.median(s[pb >= t2]), s75=np.percentile(s, 75), p60=np.mean(sat[P >= 60] > .35), s90=np.percentile(s, 90), s95=np.percentile(s, 95))
    sc = br & (sat > .35)
    h = np.histogram(hue[sc], bins=[0, 30, 60, 90, 150, 210, 270, 330, 360])[0] / max(sc.sum(), 1)
    if out:
        print(' '.join('%s=%.3f' % kv for kv in J.items()))
        print('   hue r0-30 %.2f o30-60 %.2f y %.2f g %.2f c %.2f b210-270 %.2f m270-330 %.2f r330-360 %.2f' % tuple(h))
    return J, h

# fits the colour map's lobe colours and the lighting constants in the offline model to the footage's colour and brightness
rng = np.random.default_rng(SEED)
FAM = [None, (1.0, 0.35, 0.65), (0.90, 0.25, 0.95), (1.0, 0.62, 0.35), (1.0, 0.72, 0.22), (1.0, 0.30, 0.12), (0.55, 0.45, 1.0)]
NAMES = ['none', 'pink', 'magenta', 'peach', 'gold', 'red-orange', 'violet-blue']
CEN = []
for j, y in enumerate([-0.5, -0.2, 0.1, 0.4]):
    for i in range(8): CEN.append((-0.92 + i * 0.26 + (0.13 if j % 2 else 0), y))
T = dict(gt35=.075, gt50=.008, lo=.002, mid=.010, hi=.20, med_hi=.19, s75=.13, p60=.33, s90=.30, s95=.37, p50=18.3, p90=45.8, p99=128)
S = dict(gt35=.01, gt50=.004, lo=.006, mid=.008, hi=.025, med_hi=.03, s75=.02, p60=.04, s90=.03, s95=.03, p50=1.0, p90=3, p99=8)
HT = np.array([.165, .30, .0, .0, .025, .20, .25, .06])
def lobes_of(assign, r):
    return [(x, y, r, 1.5, FAM[a]) for (x, y), a in zip(CEN, assign) if a]
def loss(assign, th, out=False):
    r, mapStr, kd, ks, shin, satGain, bright = th
    J, h = stats(*model(lobes_of(assign, r), kd=kd, ks=ks, shin=shin, satGain=satGain, bright=bright, mapStr=mapStr, tiltPow=TILTPOW), out=out)
    L = sum(((J[k] - T[k]) / S[k]) ** 2 for k in T) + np.sum(np.abs(h - HT)) / 0.05
    neutral = np.mean([a == 0 for a in assign]); L += max(0, 0.35 - neutral) * 200   # keep broad neutral regions
    return L
assign = [rng.integers(0, len(FAM)) for _ in CEN]
th = np.array([0.11, 1.0, 0.25, 1.5, 40.0, 1.5, 1.0])
lo_ = np.array([0.05, 0.3, 0.05, 0.3, 10, 0.5, 0.5]); hi_ = np.array([0.25, 3, 0.6, 5, 150, 4, 3])
cur = loss(assign, th); best = (cur, list(assign), th.copy()); Tm = 30.0
for it in range(ITERS):
    a2 = list(assign); t2 = th.copy()
    if rng.random() < 0.6: a2[rng.integers(len(CEN))] = rng.integers(0, len(FAM))
    else: k = rng.integers(len(th)); t2[k] = np.clip(t2[k] * np.exp(rng.normal(0, 0.1)), lo_[k], hi_[k])
    l2 = loss(a2, t2)
    if l2 < cur or rng.random() < np.exp((cur - l2) / Tm): assign, th, cur = a2, t2, l2
    if cur < best[0]: best = (cur, list(assign), th.copy())
    Tm = max(0.05, Tm * 0.999)
print('best loss', best[0]); print('theta r, mapStr, kd, ks, shin, satGain, bright:', np.round(best[2], 4).tolist())
loss(best[1], best[2], out=True)
print([NAMES[a] for a in best[1]])
json.dump({'loss': best[0], 'assign': [int(a) for a in best[1]], 'theta': best[2].tolist(), 'cen': CEN}, open(OUT, 'w'))
