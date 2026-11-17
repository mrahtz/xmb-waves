# usage: python swelllag.py footage CLIP.mp4 [--fps 10] [--bands 6]
#        python swelllag.py clean PAGE.html TIME SINCE_START_S SECONDS [--fps 10] [--theme 0] [--seed 1] [--size WxH]
# Spec 4.4b, version 30, "Two observables, not one": a rate and a wavelength are a pair, and the crest's crossing time
# alone cannot pin both. Following the band's height in several bands of columns across the frame:
#   crossing_s   the lag (seconds) that best lines the leftmost band of columns up with the rightmost one, scaled to the
#                whole width; positive = the left leads, which is the crest travelling left to right
#   r_nolag      their correlation at no lag at all, which says how much of a wavelength the frame spans (1 = the band
#                rises and falls in one piece)
#   r_best       their correlation at that lag
# The band's centre per column band is taken as slow.py takes it (bgremove.wave, then the rows above max(3, 6 % of the
# column maximum) in columns whose maximum clears max(6, 8 % of the frame's)). The clip has to be appreciably longer
# than the crossing time for the lag to mean anything; the tool warns when it is not.
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scipy.ndimage import gaussian_filter
import bgremove, battery_frames

def frame_bands(g, nb):
    L = gaussian_filter(np.asarray(g, dtype=float), [1, 0]); h, w = L.shape; fmax = L.max()
    Ls = L[:, ::8]; cm = Ls.max(axis=0); keep = ~(cm < max(6, 0.08 * fmax))
    vis = Ls > np.maximum(3, 0.06 * cm)[None, :]
    top = vis.argmax(axis=0); bot = h - 1 - vis[::-1].argmax(axis=0)
    xs = (np.arange(Ls.shape[1]) * 8 + 4) / w
    c = (top + bot) / 2 / h
    out = []
    for b in range(nb):
        m = keep & (xs >= b / nb) & (xs < (b + 1) / nb)
        out.append(float(np.median(c[m])) if m.sum() >= 3 else np.nan)
    return out

def summarise(t, bands, nb):
    t = np.asarray(t); B = np.asarray(bands)            # frames x nb
    dt = float(np.median(np.diff(t)))
    a, b = B[:, 0], B[:, -1]
    ok = ~np.isnan(a) & ~np.isnan(b); a, b = a[ok] - np.nanmean(a[ok]), b[ok] - np.nanmean(b[ok])
    n = len(a)
    maxlag = int(min(n // 3, round(30 / dt)))
    lags = np.arange(-maxlag, maxlag + 1)
    r = []
    for L in lags:
        x, y = (a[:n - L], b[L:]) if L >= 0 else (a[-L:], b[:n + L])
        r.append(float(np.corrcoef(x, y)[0, 1]) if len(x) > 5 else np.nan)
    r = np.asarray(r); k = int(np.nanargmax(r))
    # the two bands are (nb - 1) / nb of the width apart; scale the lag to the whole width
    cross = lags[k] * dt * nb / (nb - 1)
    r0 = r[maxlag]
    return {'frames': n, 'crossing_s': float(cross), 'r_best': float(r[k]), 'r_nolag': float(r0),
            'clip_s': float(t[-1] - t[0]), 'long_enough': bool(t[-1] - t[0] > 2.5 * abs(cross) and abs(cross) > 0)}

def opt(a, k, d):
    return a[a.index(k) + 1] if k in a else d

if __name__ == '__main__':
    a = sys.argv[1:]; fps = float(opt(a, '--fps', 10)); nb = int(opt(a, '--bands', 6)); series = []
    if a[0] == 'footage':
        st = battery_frames.probe(a[1]); num, den = st['r_frame_rate'].split('/'); vfps = float(num) / float(den)
        nf = int(st.get('nb_frames') or 0) or int(vfps * 600)
        want = sorted(set(int(round(k * vfps / fps)) for k in range(int(nf * fps / vfps))))
        for i, rgb in battery_frames.footage_frames(a[1], want): series.append((i / vfps, frame_bands(bgremove.wave(rgb), nb)))
    else:
        page, tm, since, secs = os.path.abspath(a[1]), a[2], float(a[3]), float(a[4])
        W, H = (int(v) for v in opt(a, '--size', '1920x1080').split('x'))
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work', 'swelllag_%d' % os.getpid()); os.makedirs(out, exist_ok=True)
        step = int(round(60 / fps)); frames = [int(60 * since) + k * step for k in range(int(secs * fps))]
        spec = {'page': page, '_out': out, 'opts': {'time': tm, 'theme': int(opt(a, '--theme', 0)), 'seed': int(opt(a, '--seed', 1)),
                'w': W, 'h': H, 'layers': 'bg,wave,glare,sparkles,dither'}}
        for f, rgb in battery_frames.clean_frames(spec, frames): series.append(((f - frames[0]) / 60, frame_bands(bgremove.wave(rgb), nb)))
    t = [s[0] for s in series]; bands = [s[1] for s in series]
    print(json.dumps(summarise(t, bands, nb)))
