# usage: cycleorig.py DIR -> band peak / mean excess over the background for DIR/DATE-HHMM.png beside the original's
# recordings at the same console date and time (comparison/original, frames at 1, 5 and 9 s averaged; same measure as cycle.py)
import sys, os, glob, numpy as np
d = sys.argv[1]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cycle import stats  # noqa: E402  (cycle.py's band measure)
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work', 'orig', 'raw')
print('date-time         original peak/mean   mine peak/mean')
for f in sorted(glob.glob(os.path.join(d, '2026-*.png'))):
    k = os.path.basename(f)[:-4]; refs = sorted(glob.glob(os.path.join(R, k + '_[159].png')))
    if not refs: continue
    r = np.mean([stats(p) for p in refs], axis=0); m = stats(f)
    print('%s   +%5.1f / +%5.1f        +%5.1f / +%5.1f' % (k, r[0], r[1], m[0], m[1]))
