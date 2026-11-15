# targets for the background fit: per footage condition (recordings and renders, not noise), the mean of the two clips'
# background estimates at 240 x 135 (2x2 area), and a keep mask (neither clip's wave mask set, after 2x2 any)
import numpy as np, glob, os, json, re, sys
# usage: python prep.py [CACHE]  (CACHE: the battery's cache after a footage run, default $MEASURE_CACHE or ../work/battery)
H = os.path.dirname(os.path.abspath(__file__)); O = os.path.join(H, '..', 'work', 'bgfit'); os.makedirs(O, exist_ok=True)
cache = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('MEASURE_CACHE', os.path.join(H, '..', 'work', 'battery'))
C = sorted(glob.glob(os.path.join(cache, '*', 'footage')), key=os.path.getmtime)[-1]
conds = {}
for d in sorted(os.listdir(C)):
    m = re.match(r'(recording|render)_(\d{4}-\d\d-\d\d)_(\d\d)(\d\d)(\d\d)_t(\d+)_(\d+)s', d)
    if not m: continue
    k = (m.group(2), m.group(3) + ':' + m.group(4) + ':' + m.group(5), m.group(6))
    conds.setdefault(k, []).append(os.path.join(C, d, 'bgest.npz'))
T = []; M = []; meta = []
for k, fs in sorted(conds.items()):
    A = [np.load(f) for f in fs]
    bg = np.mean([a['bg'] for a in A], axis=0); mask = np.any([a['mask'] for a in A], axis=0)
    bg = bg.reshape(135, 2, 240, 2, 3).mean((1, 3)); mask = mask.reshape(135, 2, 240, 2).any((1, 3))
    T.append(bg.astype(np.float32)); M.append((~mask).astype(np.uint8)); meta.append({'time': k[0] + 'T' + k[1], 'since': k[2], 'n': len(fs), 'keep': float((~mask).mean())})
np.array(T).astype(np.float32).tofile(os.path.join(O, 'targets.f32')); np.array(M).tofile(os.path.join(O, 'keep.u8'))
json.dump(meta, open(os.path.join(O, 'meta.json'), 'w'), indent=1)
for x in meta: print(x)
