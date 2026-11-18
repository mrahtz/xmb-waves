# usage: python3 -I bandlevel.py [--times 1,3,5,7,9] SOURCE [...]   (SOURCE: a footage clip, or a glob of raw 1920x1080 RGB frames)
#        BANDLEVEL_OUT=file.json  writes every clip's numbers
# Spec 4.5 (version 31), "The observable that separates them": the band's added light integrated down each column over the
# band's extent, divided by the level of the fitted background under the band at that same column. The mood's exposure (the
# gain) multiplies numerator and denominator alike and very nearly cancels; the mood's own wave brightness multiplies the
# numerator alone. So this is the measure to set the per-mood wave brightness by, per mood, against footage of that mood.
# The five cautions of that paragraph, in the order it gives them:
#   - the denominator is the background **under** the band, not beside it: bandcolour.interp_bg's per-column fit from the
#     rows just outside the band, evaluated over the band's own rows (at night the picture beside the band is at the floor,
#     and in some columns it would divide by nothing);
#   - the column is integrated, never reduced to its brightest pixel (which is often a sparkle, and the sparkles' light is
#     added after the curve and does not follow the gain); the mean over the band's extent is reported beside it;
#   - the share of the band's pixels at the top output level is reported, because it is the ceiling that ends this
#     observable: once the top of the band clips, the ratio collapses;
#   - it is a per-mood target against footage of that mood: this tool never pools two moods;
#   - it sets the band's level in a mood and not its structure.
# A 9 px horizontal median per channel first (as bandcolour.py does) drops the sparkles and the dither: the band's lines run
# nearly horizontally and are much wider than that. Footage and renders go through exactly the same steps.
# Printed per source: 'col' the column integral over the fitted background under the band, in pixels (the measure above);
# 'mean' the band's mean added light over the same background, dimensionless; 'add' the column integral of the added light
# on its own, in output levels x pixels (comparable between moods, unlike the ratio); 'bg' the mean fitted background level
# under the band; 'clip' the share of band pixels at 255 in any channel; 'rows' the band's mean height in pixels.
import sys, os, glob, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scipy.ndimage import median_filter
from bandcolour import bandmask, interp_bg, vframes
LUMA = np.array([0.299, 0.587, 0.114])

def moment(f):
    F = median_filter(f.astype(np.float32), size=(1, 9, 1))
    M = bandmask(f)
    BG = interp_bg(F, M)
    A = np.maximum((F - BG) @ LUMA, 0.0)
    B = (BG @ LUMA)
    n = M.sum(axis=0)                      # the band's extent in each column
    ok = n > 0
    add = (A * M).sum(axis=0)[ok]          # the added light integrated down the column
    bg = (B * M).sum(axis=0)[ok] / n[ok]   # the fitted background under the band, at the band's own rows
    bg = np.maximum(bg, 1e-3)
    clip = float(((f.max(axis=2) >= 255) & M).sum() / max(M.sum(), 1))
    return {'col': float((add / bg).mean()), 'mean': float((add / n[ok] / bg).mean()), 'add': float(add.mean()),
            'bg': float(bg.mean()), 'clip': clip, 'rows': float(n[ok].mean()), 'cols': int(ok.sum())}

def frames_of(src, times):
    if src.endswith('.rgb'): return [np.fromfile(f, np.uint8).reshape(1080, 1920, 3) for f in sorted(glob.glob(src))]
    return list(vframes(src, times))

if __name__ == '__main__':
    a = sys.argv[1:]
    times = [1, 3, 5, 7, 9]
    if a and a[0] == '--times': times = [float(x) for x in a[1].split(',')]; a = a[2:]
    a = sum([[l.strip() for l in open(x[1:]) if l.strip()] if x.startswith('@') else [x] for x in a], [])  # '@file': one source per line
    out = {}
    for s in a:
        rows = [moment(f) for f in frames_of(s, times)]
        m = {k: float(np.mean([r[k] for r in rows])) for k in rows[0]}
        m['n'] = len(rows); m['per_frame'] = rows
        out[s] = m
        print('%-56s n %2d  col %7.2f  mean %6.3f  add %8.1f  bg %6.2f  clip %.5f  rows %5.1f'
              % (s[-56:], len(rows), m['col'], m['mean'], m['add'], m['bg'], m['clip'], m['rows']), flush=True)
    if len(out) > 1:
        for k in ('col', 'mean', 'add'):
            v = [out[s][k] for s in out]
            print('over %d sources: %-5s mean %8.3f  s.e. %.3f' % (len(v), k, np.mean(v), np.std(v, ddof=1) / np.sqrt(len(v))))
    if os.environ.get('BANDLEVEL_OUT'): json.dump(out, open(os.environ['BANDLEVEL_OUT'], 'w'))
