# cmaes.py: CMA-ES over the build's wave tunables, evaluated by fw_worker.js (fast evaluator) against the reference statistics.
# usage: python3 cmaes.py run [generations] [workers]   | python3 cmaes.py eval key=value ...  (one candidate, printed)
import os, sys, json, time, math, subprocess, csv
import numpy as np
OPT = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(os.path.dirname(OPT)))
SP = os.environ.get('MEASURE_WORK', os.path.join(ROOT, 'tools', 'measure', 'work'))
PAGE = os.environ.get('BASE_PAGE', os.path.join(ROOT, 'index.html'))   # the build whose code is used; its tunables are the defaults
DECAY_VS = os.environ.get('DECAY_VS', 'slower')  # the drive cycle the decay time is measured against: 'slower' or 'faster'
SEEDS = [11, 12, 13]; STILLS = [600, 1200, 1800]; MOTION = {'from': 600, 'count': 150, 'step': 12, 'fps': 5}

# ---- parameters: (name, kind, lo, hi, x0) ; kind 'log' or 'lin'. 'delta' is drivePhase2 - drivePhase1 (> 0: depth offset larger)
PARAMS = [
    ('NET.noise', 'log', 5e-6, 1.5e-4, 0.0001),
    ('NET.driveA', 'log', 0.02, 0.30, 0.05763), ('NET.driveB', 'log', 0.02, 0.50, 0.07898),
    ('NET.driveW1', 'log', 0.15, 0.9, 0.364), ('NET.driveW2', 'log', 0.08, 0.6, 0.1408),
    ('NET.drivePhase1', 'lin', 0.36, 1.3, 1.225), ('delta', 'lin', 0.02, 0.9, 0.807),
    # spec 9: across-springs comparable to the along ones (acrossK near 1), bending clearly stiffer (kBend = bendRatio x kStruct)
    ('NET.kStruct', 'log', 0.08, 1.5, 0.2104), ('bendRatio', 'log', 2.5, 12.0, 4.662), ('NET.acrossK', 'log', 0.75, 1.33, 1.064),
    ('decayRatio', 'log', 1.0, 4.0, 1.3),  # spec 13: velocity decay time over a drive period (DECAY_VS; > 1: light damping)
    ('NET.push', 'log', 0.002, 0.03, 0.005034),
    ('SCENE.wid', 'lin', 3.0, 6.0, 5.352), ('camPitch', 'lin', 1.0, 12.0, 2.7),
    # spec 11: the slow warp (rolling wave, sliding bump, bob, twist) and the uneven layout along the length
    ('LAT.rollAmp', 'log', 0.01, 0.12, 0.01262), ('LAT.rollW', 'log', 0.08, 1.2, 0.5), ('LAT.rollGrow', 'lin', 1.0, 5.0, 3.866),
    ('LAT.rollWaves', 'lin', 1.02, 1.6, 1.3), ('LAT.bumpAmp', 'log', 0.004, 0.06, 0.01146), ('LAT.twistAmp', 'log', 0.003, 0.04, 0.03137),
    ('LAT.spread', 'log', 3.0, 15.0, 3.513), ('SCENE.len', 'lin', 6.0, 16.0, 9.879), ('SCENE.x0', 'lin', -2.0, 4.0, 0.3146),
    ('baseC', 'log', 0.15, 2.0, 0.3202), ('baseK', 'lin', 1.0, 4.0, 2.209),  # the view-angle response (day mood)
]
D = len(PARAMS)
def to_z(vals):
    z = np.zeros(D)
    for i, (n, k, lo, hi, x0) in enumerate(PARAMS):
        v = vals[i]
        z[i] = math.log(v / lo) / math.log(hi / lo) if k == 'log' else (v - lo) / (hi - lo)
    return z
def from_z(z):
    vals = []
    for i, (n, k, lo, hi, x0) in enumerate(PARAMS):
        t = min(max(z[i], 0.0), 1.0)
        vals.append(lo * (hi / lo) ** t if k == 'log' else lo + (hi - lo) * t)
    return vals
def candidate(vals, cid):
    tune = {}; mood = {}
    for (n, k, lo, hi, x0), v in zip(PARAMS, vals):
        if n in ('delta', 'bendRatio', 'decayRatio'): continue
        if n in ('camPitch', 'baseC', 'baseK'): mood[n] = v
        else: tune[n] = v
    p1 = dict(zip([p[0] for p in PARAMS], vals))
    tune['NET.drivePhase2'] = p1['NET.drivePhase1'] + p1['delta']
    tune['NET.kBend'] = p1['NET.kStruct'] * p1['bendRatio']
    # damping per step from the decay time: tau = DT / damping = decayRatio x the longer drive period
    tune['NET.damping'] = 1.0 / (60.0 * p1['decayRatio'] * 2 * math.pi / (min if DECAY_VS == 'slower' else max)(p1['NET.driveW1'], p1['NET.driveW2']))
    return {'id': cid, 'tune': tune, 'mood': mood, 'seeds': SEEDS, 'stillFrames': STILLS, 'motion': MOTION}
def mkvar_args(vals):
    c = candidate(vals, 'x'); out = []
    for k, v in c['tune'].items():
        grp, key = k.split('.', 1); out.append('%s.%s=%s' % (grp.lower(), key, fmt(v)))
    for k in ('camPitch', 'baseC', 'baseK'): out.append('day.%s=%s' % (k, fmt(c['mood'][k])))
    return out
def fmt(v): return '%.4g' % v

# ---- objective: reference targets (medians under these tools), scales (about the reference's frame spread), weights, fast->full bias
OBJ = [  # key, target, scale, weight, bias (subtracted from the fast value)
    ('thick', 0.165, 0.02, 1.0, 0.002), ('peaks12', 3.3, 0.5, 1.0, 0.18), ('face', 0.21, 0.06, 1.0, -0.01), ('foldface', 5.6, 1.5, 1.0, 0.41),
    ('partcol', 0.85, 0.3, 3.0, 0.14), ('linepk', 1.67, 0.2, 1.0, -0.21), ('a40', 0.48, 0.08, 1.0, 0.014), ('dark', 0.14, 0.05, 3.0, 0.0),
    ('bwidth', 23.0, 8.0, 1.5, 1.0), ('partings', 5, 2.0, 1.5, -0.7), ('a25', 0.65, 0.08, 0.5, 0.013),
    ('widthLines', 8.5, 1.2, 0.5, 0.6), ('edge', 5.5, 2.0, 0.5, 0.37), ('peaks25', 2.8, 0.5, 0.5, 0.04), ('pinch8', 2, 8, 0.25, -0.4),
    ('lines10', 6, 3, 0.25, 0.3),
    ('shift', 0.075, 0.025, 3.0, -0.007), ('adjdiff', 5.7, 2.0, 0.75, -0.7), ('corr1', 0.41, 0.1, 2.0, 0.06), ('outer', 0.71, 0.15, 2.0, -0.018), ('cspeed', 0.015, 0.005, 0.5, 0.0),
    ('pspeed', 38.0, 12.0, 1.5, 0.0), ('pright', 0.78, 0.15, 1.5, 0.0),  # partings' drift along the band (px/s at 1920) and rightwards share
]
def objective(r):
    terms = {}; s = 0.0; w = 0.0; pen = {}
    if r.get('error'): return 50.0, {'error': r['error']}, {}
    for k, t, sc, wt, b in OBJ:
        v = r.get(k)
        if v is None or (isinstance(v, float) and math.isnan(v)): pen['missing_' + k] = 2.0 * wt; continue
        d = ((v - b) - t) / sc; terms[k] = d; s += wt * d * d; w += wt
    dist = math.sqrt(s / w) if w else 10.0
    # penalties: instability, excursions, the band leaving the frame, degenerate rasters
    p = 0.0
    if r.get('bad', 0): pen['bad'] = 5.0 * r['bad']
    ms0, ms1 = r.get('maxSpeed0', 0), r.get('maxSpeed1', 0)
    if ms1 > 1.6 * ms0 + 0.02: pen['speed_growth'] = 2.0 * (ms1 / max(ms0, 1e-6) - 1.6)
    if ms1 > 0.25: pen['speed_high'] = 4.0 * (ms1 - 0.25)      # net units / s (0.07 in the current build)
    if r.get('maxY', 0) > 0.35: pen['height'] = 4.0 * (r['maxY'] - 0.35)
    if r.get('maxZoff', 0) > 0.75: pen['depth'] = 4.0 * (r['maxZoff'] - 0.75)
    c = r.get('centre', 0.55) or 0.55
    if c < 0.35: pen['centre'] = 10 * (0.35 - c) ** 2 * 100
    if c > 0.75: pen['centre'] = 10 * (c - 0.75) ** 2 * 100
    cmin, cmax = r.get('centreMin', c), r.get('centreMax', c)
    if cmin is not None and cmin < 0.25: pen['centre_min'] = 4.0 * (0.25 - cmin)
    if cmax is not None and cmax > 0.85: pen['centre_max'] = 4.0 * (cmax - 0.85)
    if (r.get('thick') or 0) < 0.05: pen['collapsed'] = 3.0
    if (r.get('n') or 0) < 9: pen['frames'] = 1.0 * (9 - (r.get('n') or 0))
    for k, v in pen.items(): p += v
    return dist + p, terms, pen

# ---- workers
class Pool:
    def __init__(self, n):
        self.procs = [subprocess.Popen(['nice', '-n', '12', 'node', OPT + '/fw_worker.js', PAGE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1) for _ in range(n)]
    def evaluate(self, cands):
        groups = [[] for _ in self.procs]
        for i, c in enumerate(cands): groups[i % len(self.procs)].append(c)
        for p, g in zip(self.procs, groups):
            for c in g: p.stdin.write(json.dumps(c) + '\n')
            p.stdin.flush()
        res = {}
        for p, g in zip(self.procs, groups):
            for _ in g:
                line = p.stdout.readline()
                if not line: raise RuntimeError('worker died')
                r = json.loads(line); res[r.get('id')] = r
        return [res.get(c['id'], {'id': c['id'], 'error': 'no result'}) for c in cands]
    def close(self):
        for p in self.procs: p.stdin.close(); p.wait()

OUT = os.path.join(SP, 'opt'); os.makedirs(OUT, exist_ok=True)   # logs and state go to the work directory
LOG = OUT + '/log.csv'; STATE = OUT + '/cma_state.json'; BEST = OUT + '/best.json'
LOGKEYS = ['gen', 'id', 'objective', 'dist', 'penalty'] + [p[0] for p in PARAMS] + ['thick', 'peaks12', 'peaks25', 'face', 'foldface', 'partcol', 'linepk', 'a40', 'dark', 'widthLines', 'edge', 'pinch8', 'partings', 'lines10', 'outer', 'bwidth', 'a25', 'fmean', 'overlap', 'centre', 'shift', 'adjdiff', 'corr1', 'cspeed', 'pspeed', 'maxSpeed0', 'maxSpeed1', 'maxY', 'ms']
def log_rows(rows):
    new = not os.path.exists(LOG)
    with open(LOG, 'a', newline='') as f:
        w = csv.DictWriter(f, fieldnames=LOGKEYS, extrasaction='ignore')
        if new: w.writeheader()
        for r in rows: w.writerow(r)

def run(gens, nworkers):
    lam = 12; mu = lam // 2
    wts = np.log(mu + 0.5) - np.log(np.arange(1, mu + 1)); wts /= wts.sum(); mueff = 1 / (wts ** 2).sum()
    cc = (4 + mueff / D) / (D + 4 + 2 * mueff / D); cs = (mueff + 2) / (D + mueff + 5)
    c1 = 2 / ((D + 1.3) ** 2 + mueff); cmu = min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((D + 2) ** 2 + mueff))
    damps = 1 + 2 * max(0, math.sqrt((mueff - 1) / (D + 1)) - 1) + cs; chiN = math.sqrt(D) * (1 - 1 / (4 * D) + 1 / (21 * D * D))
    rng = np.random.default_rng(7)
    if os.path.exists(STATE):
        st = json.load(open(STATE)); m = np.array(st['m']); sigma = st['sigma']; C = np.array(st['C']); ps = np.array(st['ps']); pc = np.array(st['pc']); g0 = st['gen'] + 1
        best = json.load(open(BEST)) if os.path.exists(BEST) else {'objective': 1e9}
        rng = np.random.default_rng(7 + g0)
        print('resuming at generation', g0, 'sigma', sigma)
    else:
        m = to_z([p[4] for p in PARAMS]); sigma = 0.2; C = np.eye(D); ps = np.zeros(D); pc = np.zeros(D); g0 = 0; best = {'objective': 1e9}
    pool = Pool(nworkers)
    try:
        # baseline: the current build
        if g0 == 0:
            r = pool.evaluate([candidate(from_z(m), 'baseline')])[0]; o, terms, pen = objective(r)
            row = dict(gen=-1, id='baseline', objective=o, dist=o - sum(pen.values()), penalty=sum(pen.values()), **dict(zip([p[0] for p in PARAMS], from_z(m))), **{k: r.get(k) for k in LOGKEYS if k in r and k not in ('id', 'gen')})
            log_rows([row]); print('baseline objective %.3f' % o, {k: round(v, 2) for k, v in terms.items()}, pen, flush=True)
        for g in range(g0, g0 + gens):
            t0 = time.time()
            ev, evals = np.linalg.eigh(C); ev = np.sqrt(np.maximum(ev, 1e-20)); Bm = evals
            zs = rng.standard_normal((lam, D)); ys = (Bm * ev) @ zs.T; xs = (m[:, None] + sigma * ys).T
            # reflect into [0, 1]
            for i in range(lam):
                x = xs[i]
                for k in range(D):
                    while x[k] < 0 or x[k] > 1: x[k] = -x[k] if x[k] < 0 else 2 - x[k]
                xs[i] = x
            cands = [candidate(from_z(xs[i]), 'g%d_%d' % (g, i)) for i in range(lam)]
            results = pool.evaluate(cands)
            objs = []; rows = []
            for i, r in enumerate(results):
                o, terms, pen = objective(r); objs.append(o)
                row = dict(gen=g, id=r.get('id'), objective=o, dist=o - sum(pen.values()), penalty=sum(pen.values()), **dict(zip([p[0] for p in PARAMS], from_z(xs[i]))), **{k: r.get(k) for k in LOGKEYS if k in r and k not in ('id', 'gen')})
                rows.append(row)
                if o < best['objective']:
                    best = {'objective': o, 'gen': g, 'id': r.get('id'), 'z': xs[i].tolist(), 'values': dict(zip([p[0] for p in PARAMS], from_z(xs[i]))), 'mkvar': mkvar_args(from_z(xs[i])), 'result': r, 'terms': terms, 'penalties': pen}
                    json.dump(best, open(BEST, 'w'), indent=1)
            log_rows(rows)
            order = np.argsort(objs); sel = xs[order[:mu]]
            mold = m.copy(); m = wts @ sel
            yw = (m - mold) / sigma
            invsqrtC = Bm @ np.diag(1 / ev) @ Bm.T
            ps = (1 - cs) * ps + math.sqrt(cs * (2 - cs) * mueff) * (invsqrtC @ yw)
            hsig = float(np.linalg.norm(ps) / math.sqrt(1 - (1 - cs) ** (2 * (g + 1))) / chiN < 1.4 + 2 / (D + 1))
            pc = (1 - cc) * pc + hsig * math.sqrt(cc * (2 - cc) * mueff) * yw
            artmp = (sel - mold) / sigma
            C = (1 - c1 - cmu) * C + c1 * (np.outer(pc, pc) + (1 - hsig) * cc * (2 - cc) * C) + cmu * (artmp.T * wts) @ artmp
            sigma *= math.exp((cs / damps) * (np.linalg.norm(ps) / chiN - 1))
            C = (C + C.T) / 2
            json.dump({'gen': g, 'm': m.tolist(), 'sigma': sigma, 'C': C.tolist(), 'ps': ps.tolist(), 'pc': pc.tolist()}, open(STATE, 'w'))
            srt = sorted(objs)
            print('gen %d: best %.3f median %.3f worst %.3f | best-ever %.3f (%s) | sigma %.3f | %.0f s' % (g, srt[0], srt[lam // 2], srt[-1], best['objective'], best.get('id'), sigma, time.time() - t0), flush=True)
    finally:
        pool.close()

if __name__ == '__main__':
    if sys.argv[1] == 'run': run(int(sys.argv[2]) if len(sys.argv) > 2 else 50, int(sys.argv[3]) if len(sys.argv) > 3 else 3)
    elif sys.argv[1] == 'eval':
        vals = [p[4] for p in PARAMS]; names = [p[0] for p in PARAMS]
        for a in sys.argv[2:]:
            k, v = a.split('='); vals[names.index(k)] = float(v)
        pool = Pool(1); r = pool.evaluate([candidate(vals, 'eval')])[0]; pool.close(); o, terms, pen = objective(r)
        print(json.dumps(r)); print('objective %.3f' % o, 'terms', {k: round(v, 2) for k, v in terms.items()}, 'penalties', pen); print('mkvar:', ' '.join(mkvar_args(vals)))
