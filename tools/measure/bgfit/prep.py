# targets for the background fit: per footage condition (recordings and renders, not noise), the mean of the clips'
# background estimates at 240 x 135 (2x2 area), and a keep mask (no clip's wave mask set, after 2x2 any)
import numpy as np, glob, os, json, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from battery import clip_id
# usage: python prep.py [CACHE] [--index INDEX.json[,INDEX2.json...]]
#   CACHE: the battery's cache after a footage run, default $MEASURE_CACHE or ../work/battery
#   --index: keep only the clips these footage indexes name (a shared cache holds every clip any job has ever
#            measured, so the fit's condition set is named rather than taken from whatever is in the cache).
#            Each cache entry is matched against the indexes by the battery's own clip id, which carries the
#            kind, date, time, time since the start, length, colour, size, seed and frame rate, so a clip that
#            differs from an index clip in any of those (another seed, another length) cannot slip in.
H = os.path.dirname(os.path.abspath(__file__)); O = os.path.join(H, '..', 'work', 'bgfit'); os.makedirs(O, exist_ok=True)
argv = [a for a in sys.argv[1:]]
only = None
while '--index' in argv:
    i = argv.index('--index'); files = argv[i + 1].split(','); del argv[i:i + 2]
    if only is None: only = set()
    for fn in files:
        for c in json.load(open(fn))['clips']:
            if c['kind'] != 'noise': only.add(clip_id(c))
cache = argv[0] if argv else os.environ.get('MEASURE_CACHE', os.path.join(H, '..', 'work', 'battery'))
C = sorted(glob.glob(os.path.join(cache, '*', 'footage')), key=os.path.getmtime)[-1]
conds = {}
for d in sorted(os.listdir(C)):
    m = re.match(r'(recording|render)_(\d{4}-\d\d-\d\d)_(\d\d)(\d\d)(\d\d)_t(\d+)_(\d+)s_c(\d+)_(\d+x\d+)(.*)_[0-9a-f]{12}$', d)
    if not m: continue
    cid = re.sub(r'_\d+$', '', d[:d.rindex('_')])          # the clip id, without the battery's suffix for a repeated id
    if only is not None and cid not in only: continue
    k = (m.group(2), m.group(3) + ':' + m.group(4) + ':' + m.group(5), m.group(6), m.group(7), m.group(8), m.group(9))
    f = os.path.join(C, d, 'bgest.npz')
    if os.path.exists(f): conds.setdefault(k, []).append(f)   # an entry measured for other lanes only has none
T = []; M = []; meta = []
for k, fs in sorted(conds.items()):
    A = [np.load(f) for f in fs]
    bg = np.mean([a['bg'] for a in A], axis=0); mask = np.any([a['mask'] for a in A], axis=0)
    bg = bg.reshape(135, 2, 240, 2, 3).mean((1, 3)); mask = mask.reshape(135, 2, 240, 2).any((1, 3))
    T.append(bg.astype(np.float32)); M.append((~mask).astype(np.uint8))
    meta.append({'time': k[0] + 'T' + k[1], 'since': k[2], 'n': len(fs), 'keep': float((~mask).mean())})
np.array(T).astype(np.float32).tofile(os.path.join(O, 'targets.f32')); np.array(M).tofile(os.path.join(O, 'keep.u8'))
json.dump(meta, open(os.path.join(O, 'meta.json'), 'w'), indent=1)
for x in meta: print(x)
