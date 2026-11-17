# usage: python3 rampprof.py [--times 1,3,5,7,9] SOURCE [...]   (SOURCE: a footage clip, or a glob of raw 1920x1080 RGB frames)
#        RAMPPROF_OUT=file.json  writes every clip's pooled profile and slope
# Spec 4.5 (version 27), "A sharper form of that measurement": the wave tint's left-to-right ramp, fitted to the slope of
# the band's added light taken as a profile across the whole width of the picture, pooled over every frame and condition.
#   Version 20 compared the band's brightest places in the left third with the right third. Version 27 says that ratio is
#   noisier than the thing it measures, and that a profile over every column, pooled over everything available, is what
#   lifts the slope above the band's own wandering. So this tool never takes a ratio of two windows.
# Per frame: bgremove.wave() fits and subtracts the background beneath the band per column, leaving the band's added light;
# a 5 px horizontal median drops the sparkles and the dither (as ramp.py does); the profile is the sum down each column.
# Profiles are summed over the frames of a clip and over clips, and a straight line is fitted to the pooled profile
# normalised by its own mean. The slope is reported as the fractional rise from the left edge to the right edge
# ('ramp', so a flat profile is 0 and a profile twice as bright on the right as on the left is about 0.67 of its mean).
# The uncertainty quoted is the standard error over the clips pooled (the scatter between clips, which dominates).
import sys, os, glob, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scipy.ndimage import median_filter
from bgremove import wave as bgwave
from blackfoot import vframes

def profile(f):
    L = median_filter(bgwave(f), size=(1, 5)).astype(np.float64)
    return L.sum(axis=0)

# Three forms of the same profile. 'sum' is all of the light in the column, so it follows how tall the band is there as
# well as how bright it is, and is therefore mostly a measure of the sheet's shape; 'max' is the brightest place in the
# column and 'mean' the average over the column's band pixels (added light at least 2 levels), both of which the tint
# multiplies in the same way as 'sum' but which do not follow the band's height. All three use every column.
def profiles(f):
    L = median_filter(bgwave(f), size=(1, 5)).astype(np.float64)
    m = L >= 2
    n = m.sum(axis=0)
    return {'sum': L.sum(axis=0), 'max': L.max(axis=0), 'mean': np.where(n > 0, L.sum(axis=0) / np.maximum(n, 1), 0.0),
            'rows': n.astype(np.float64)}

def fit(p, lo=0.0, hi=1.0):
    """-> (ramp, mean): the least-squares line through the profile over the given share of the width, as the fractional
    rise across the whole width of the picture, and the profile's mean over that part."""
    W = len(p); x = (np.arange(W) + 0.5) / W
    s = (x >= lo) & (x < hi); x, y = x[s], p[s]
    a, b = np.polyfit(x - x.mean(), y, 1)
    return float(a / b), float(b)

def frames_of(src, times):
    if src.endswith('.rgb'): return [np.fromfile(f, np.uint8).reshape(1080, 1920, 3) for f in sorted(glob.glob(src))]
    return list(vframes(src, times))

if __name__ == '__main__':
    a = sys.argv[1:]
    times = [1, 3, 5, 7, 9]
    if a and a[0] == '--times': times = [float(x) for x in a[1].split(',')]; a = a[2:]
    KINDS = ('sum', 'max', 'mean', 'rows')
    out, tot, per = {}, {}, {k: [] for k in KINDS}
    for s in a:
        P, n = {}, 0
        for f in frames_of(s, times):
            p = profiles(f)
            for k in KINDS: P[k] = p[k] if k not in P else P[k] + p[k]
            n += 1
        rec = {'n': n}
        for k in KINDS:
            r, m = fit(P[k]); rec[k] = {'ramp': r, 'mean': m / n, 'profile': (P[k] / n).tolist()}
            per[k].append(r); tot[k] = P[k] if k not in tot else tot[k] + P[k]
        out[s] = rec
        print('%-52s n %2d  ramp sum %+.4f  max %+.4f  mean %+.4f  rows %+.4f' %
              (s[-52:], n, rec['sum']['ramp'], rec['max']['ramp'], rec['mean']['ramp'], rec['rows']['ramp']), flush=True)
    if tot:
        out['POOLED'] = {'clips': len(per['sum'])}
        for k in KINDS:
            r, m = fit(tot[k]); se = float(np.std(per[k], ddof=1) / np.sqrt(len(per[k]))) if len(per[k]) > 1 else float('nan')
            out['POOLED'][k] = {'ramp': r, 'se': se, 'mean': m / max(len(per[k]), 1), 'profile': (tot[k] / max(len(per[k]), 1)).tolist()}
            print('POOLED %-5s over %d sources: ramp %+.4f +- %.4f (s.e. between sources)' % (k, len(per[k]), r, se))
    if os.environ.get('RAMPPROF_OUT'): json.dump(out, open(os.environ['RAMPPROF_OUT'], 'w'))
