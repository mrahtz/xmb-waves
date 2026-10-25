# recheck.py: re-evaluate the best distinct candidates of opt/log.csv on fresh seeds with the fast evaluator, to pick the ones worth a full render.
# usage: python3 recheck.py [topK] [workers]  -> opt/recheck.json and a ranked table
import os, sys, csv, json, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cmaes
OPT = cmaes.OPT
K = int(sys.argv[1]) if len(sys.argv) > 1 else 12; NW = int(sys.argv[2]) if len(sys.argv) > 2 else 3
SEEDS = [21, 22, 23, 24, 25, 26]; STILLS = [600, 1200, 1800, 2400]; MOTION = {'from': 600, 'count': 60, 'step': 12, 'fps': 5}
rows = list(csv.DictReader(open(cmaes.OUT + '/log.csv')))
rows = [r for r in rows if r['id'] != 'baseline']
rows.sort(key=lambda r: float(r['objective']))
names = [p[0] for p in cmaes.PARAMS]
picked = []; seen = []
for r in rows:
    v = np.array([float(r[n]) for n in names]); z = cmaes.to_z(v)
    if any(np.abs(z - s).max() < 0.03 for s in seen): continue  # near-duplicate in normalised space
    seen.append(z); picked.append((r['id'], float(r['objective']), v))
    if len(picked) >= K: break
base = np.array([p[4] for p in cmaes.PARAMS]); picked.append(('baseline', float('nan'), base))
pool = cmaes.Pool(NW)
cands = []
for cid, o, v in picked:
    c = cmaes.candidate(list(v), cid); c['seeds'] = SEEDS; c['stillFrames'] = STILLS; c['motion'] = MOTION; cands.append(c)
res = pool.evaluate(cands); pool.close()
out = []
for (cid, o, v), r in zip(picked, res):
    o2, terms, pen = cmaes.objective(r)
    out.append({'id': cid, 'objective_opt': o, 'objective_fresh': o2, 'penalties': pen, 'terms': terms, 'values': dict(zip(names, v.tolist())), 'mkvar': cmaes.mkvar_args(list(v)), 'result': r})
out.sort(key=lambda x: x['objective_fresh'])
json.dump(out, open(cmaes.OUT + '/recheck.json', 'w'), indent=1)
print('%-10s %8s %8s | %s' % ('id', 'opt', 'fresh', 'thick peaks12 face foldface partcol linepk a40 dark | shift adjdiff corr1 | pen'))
for x in out:
    r = x['result']; g = lambda k, f='%.2f': (f % r[k]) if r.get(k) is not None else '-'
    print('%-10s %8.3f %8.3f | %s %s %s %s %s %s %s %s | %s %s %s | %s' % (x['id'], x['objective_opt'], x['objective_fresh'], g('thick', '%.3f'), g('peaks12'), g('face'), g('foldface', '%.1f'), g('partcol'), g('linepk'), g('a40'), g('dark'), g('shift', '%.3f'), g('adjdiff', '%.1f'), g('corr1'), {k: round(v, 2) for k, v in x['penalties'].items()}))
