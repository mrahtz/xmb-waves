# usage: python3 -I bandpos.py [--times 1,3,5,7,9] SOURCE [...]   (SOURCE: a footage clip, or a glob of raw 1920x1080 RGB frames)
#        BANDPOS_OUT=file.json  writes every moment's numbers
# Spec 4.5 (version 27): the colour the band's added light takes at night, measured **separately at several moments** with
# the band in clearly different places, with the count of qualifying pixels beside every month's shares.
#   Version 24 took this pooled over a clip. Version 27 says a pooled average says nothing - a per-month, per-channel
#   scaling of the night background reproduces it at almost any floor - and that the information is in the shares having to
#   agree at several clearly different band positions at once. So this tool reports one row per moment and never pools.
# Per moment it uses bandcolour.py's own steps (a 9 px horizontal median to drop the sparkles, bgremove's light grown by
# 15 rows for the band, the background under the band interpolated per column from the rows just outside it) and then,
# over the **qualifying** pixels - band pixels whose interpolated background is dark (largest channel below DARK levels)
# and whose added light is at least 2 levels - prints each channel's share of the added light, the background's own shares
# over the same pixels, the count of those pixels, their share of the band, the band's centre row (the band's position,
# which is what has to differ between moments) and the mean background level under them.
# A month whose night background is near-neutral, or bright enough that few band pixels lie over anything dark, is silent:
# treat a moment with few qualifying pixels as no evidence rather than as a number.
import sys, os, glob, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scipy.ndimage import median_filter
from bandcolour import DARK, bandmask, interp_bg, vframes
from bgremove import wave as bgwave

def moment(f):
    F = median_filter(f.astype(np.float32), size=(1, 9, 1))
    M = bandmask(f)
    BG = interp_bg(F, M)
    A = F - BG
    dark = BG.max(axis=2) < DARK
    sel = M & dark & (A.max(axis=2) >= 2)
    n, nb = int(sel.sum()), int(M.sum())
    s = A[sel].sum(axis=0) if n else np.zeros(3)
    b = BG[sel].sum(axis=0) if n else np.zeros(3)
    light = bgwave(f).astype(np.float32)
    rows = np.arange(f.shape[0], dtype=np.float32)
    ctr = float((light.sum(axis=1) * rows).sum() / max(light.sum(), 1e-9)) / f.shape[0]
    return {'share': (s / max(s.sum(), 1e-9)).tolist(), 'bgshare': (b / max(b.sum(), 1e-9)).tolist(),
            'n': n, 'nband': nb, 'bglevel': float(BG[sel].max(axis=1).mean()) if n else 0.0, 'centre': ctr}

def rawframes(g): return [np.fromfile(f, np.uint8).reshape(1080, 1920, 3) for f in sorted(glob.glob(g))]

if __name__ == '__main__':
    a = sys.argv[1:]
    times = [1, 3, 5, 7, 9]
    if a and a[0] == '--times': times = [float(x) for x in a[1].split(',')]; a = a[2:]
    out = {}
    for s in a:
        frames = rawframes(s) if s.endswith('.rgb') else list(vframes(s, times))
        rows = []
        for t, f in zip(times, frames):
            m = moment(f); m['t'] = t; rows.append(m)
            print('%-46s t=%-5s R %.3f G %.3f B %.3f  bg %.3f %.3f %.3f  n %7d (%.3f of band)  centre %.3f  bg lvl %.2f'
                  % (os.path.basename(os.path.dirname(s)) or s[-46:], t, m['share'][0], m['share'][1], m['share'][2],
                     m['bgshare'][0], m['bgshare'][1], m['bgshare'][2], m['n'], m['n'] / max(m['nband'], 1), m['centre'], m['bglevel']), flush=True)
        out[s] = rows
    if os.environ.get('BANDPOS_OUT'): json.dump(out, open(os.environ['BANDPOS_OUT'], 'w'))
