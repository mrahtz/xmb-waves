# usage: python3 -I skirt.py SOURCE [...]      SOURCE: a footage clip, or a glob of raw 1920x1080 RGB frames
# Spec 4.5 (version 36): the faint light just outside the band, which that version says to measure mood by mood before
# moving any of the three mechanisms that put light on the faces - because the cost outside the band is only a cost
# where a build's own light there already matches the footage's, and where the build is short of it instead the cure and
# the cost point the same way and there is nothing to trade.
#
# One and the same code on footage and on renders. Per frame:
#   - a 9 px horizontal median per channel first, as bandcolour.py and bandlevel.py do, which drops the sparkles and the
#     dither (the band's lines run nearly horizontally and are much wider than that);
#   - bgremove.wave's background removal: per column a quadratic in the row fitted to the rows well above and well below
#     the band and subtracted, so what is left is the added light over the whole frame and not only inside the band;
#   - the band's own extent per column, exactly as spec46.py and fill.py take it (the rows where the light clears
#     max(3, 0.06 x the column's maximum), in columns whose maximum clears max(6, 0.08 x the frame's maximum));
#   - the mean added light in bands of distance outside that extent, above and below together: 1-10, 11-25 and 26-60
#     rows out, in output levels; and the first of those as a share of the band's own peak, which is the form to read
#     when the band's level does not match (version 36 keeps the band's level and its structure apart).
import sys, glob, numpy as np
from scipy.ndimage import median_filter, gaussian_filter
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from bgremove import wave as bgwave

BINS = ((1, 10), (11, 25), (26, 60))


def moment(f):
    """8-bit RGB frame -> the mean added light at 1-10, 11-25 and 26-60 rows outside the band, in output levels."""
    F = median_filter(np.asarray(f), size=(1, 9, 1))
    L = gaussian_filter(bgwave(F).astype(float), [1.0, 0])
    H, W = L.shape
    fmax = L.max()
    sums = [0.0] * len(BINS); cnts = [0] * len(BINS); peaks = []
    for x in range(0, W, 2):
        c = L[:, x]; cm = c.max()
        if cm < max(6, 0.08 * fmax): continue
        vis = np.where(c > max(3, 0.06 * cm))[0]
        t, b = vis.min(), vis.max()
        peaks.append(cm)
        for i, (d0, d1) in enumerate(BINS):
            seg = np.r_[c[max(0, t - d1):max(0, t - d0 + 1)], c[min(H, b + d0):min(H, b + d1 + 1)]]
            if seg.size: sums[i] += float(seg.sum()); cnts[i] += seg.size
    out = {}
    for i, (d0, d1) in enumerate(BINS):
        out['skirt_%d_%d' % (d0, d1)] = sums[i] / cnts[i] if cnts[i] else float('nan')
    pk = float(np.median(peaks)) if peaks else float('nan')
    out['skirt_band_peak'] = pk
    out['skirt_rel_1_10'] = out['skirt_1_10'] / pk if pk and pk == pk else float('nan')
    return out


if __name__ == '__main__':
    import bandcolour
    for s in sys.argv[1:]:
        frames = ([np.fromfile(p, np.uint8).reshape(1080, 1920, 3) for p in sorted(glob.glob(s))]
                  if s.endswith('.rgb') else list(bandcolour.vframes(s)))
        rows = [moment(f) for f in frames]
        m = {k: float(np.median([r[k] for r in rows])) for k in rows[0]}
        print('%-58s n %2d  ' % (s[-58:], len(rows)) + '  '.join('%s %7.3f' % (k, m[k]) for k in
              ('skirt_1_10', 'skirt_11_25', 'skirt_26_60', 'skirt_band_peak', 'skirt_rel_1_10')), flush=True)
