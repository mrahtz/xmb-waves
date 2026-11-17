# usage: python slow.py footage CLIP.mp4 [--fps 5] [--json OUT]
#        python slow.py clean PAGE.html TIME SINCE_START_S SECONDS [--fps 5] [--theme 0] [--seed 1] [--size 1920x1080] [--json OUT]
# The band's slow motion over a clip, measured the same way on footage and on clean renders (spec 4.4b, version 18: the
# warp's rates and its bump and bob). Frames at --fps (default 5) go through bgremove.py's wave(); in every 8th column the
# band's top and bottom are found as in thick.py (rows above max(3, 6 % of the column max), columns whose max is at least
# max(6, 8 % of the frame max)), and its centre is the middle of the two. Per frame: the mean centre over the columns, the
# tilt (slope of a straight line fitted to the centre against x, in H per screen width, positive = right side lower), and the
# centre at the middle of the screen (median over x = 0.45-0.55). Over the clip: the mean height and its range; the tilt's
# spread and its period (four times the first lag where its autocorrelation, mean removed, falls below zero; '>' when it
# never does within the clip); the share of the mean centre's variance at periods longer than 20 s (periodogram, mean
# removed, Hann window); the range and standard deviation of the centre at the middle of the screen.
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scipy.ndimage import gaussian_filter
import bgremove, battery_frames

def frame_line(g):
    L = gaussian_filter(np.asarray(g, dtype=float), [1, 0]); h, w = L.shape; fmax = L.max()
    Ls = L[:, ::8]; cm = Ls.max(axis=0); keep = ~(cm < max(6, 0.08 * fmax))
    vis = Ls > np.maximum(3, 0.06 * cm)[None, :]
    top = vis.argmax(axis=0); bot = h - 1 - vis[::-1].argmax(axis=0)
    xs = (np.arange(Ls.shape[1]) * 8 + 4) / w
    c = (top + bot) / 2 / h
    xs, c = xs[keep], c[keep]
    if len(c) < 10: return np.nan, np.nan, np.nan
    b, a = np.polyfit(xs, c, 1)
    mid = c[(xs > 0.45) & (xs < 0.55)]
    return float(c.mean()), float(b), float(np.median(mid)) if len(mid) else np.nan

def summarise(t, cen, tilt, mid):
    t, cen, tilt, mid = map(np.asarray, (t, cen, tilt, mid)); ok = ~np.isnan(cen) & ~np.isnan(tilt)
    t, cen, tilt = t[ok], cen[ok], tilt[ok]; midv = mid[~np.isnan(mid)]
    dt = t[1] - t[0] if len(t) > 1 else 1
    x = tilt - tilt.mean(); ac = np.correlate(x, x, 'full')[len(x) - 1:]; ac = ac / ac[0] if ac[0] > 0 else ac
    neg = np.where(ac < 0)[0]
    tper = ('%.1f' % (4 * neg[0] * dt)) if len(neg) else ('>%.1f' % (4 * len(x) * dt))
    y = (cen - cen.mean()) * np.hanning(len(cen)); P = np.abs(np.fft.rfft(y)) ** 2; f = np.fft.rfftfreq(len(y), dt)
    slow = float(P[1:][f[1:] < 1 / 20].sum() / P[1:].sum()) if P[1:].sum() > 0 else np.nan
    return {'frames': int(len(t)), 'mean_height': float(cen.mean()), 'height_range': float(cen.max() - cen.min()),
            'tilt_mean': float(tilt.mean()), 'tilt_sd': float(tilt.std()), 'tilt_period_s': tper, 'slow_share_20s': slow,
            'mid_range': float(midv.max() - midv.min()) if len(midv) else np.nan, 'mid_sd': float(midv.std()) if len(midv) else np.nan}

def opt(args, k, d):
    return args[args.index(k) + 1] if k in args else d

if __name__ == '__main__':
    a = sys.argv[1:]; fps = float(opt(a, '--fps', 5)); series = []
    if a[0] == 'footage':
        st = battery_frames.probe(a[1]); num, den = st['r_frame_rate'].split('/'); vfps = float(num) / float(den)
        nf = int(st.get('nb_frames') or 0) or int(vfps * 600)
        want = sorted(set(int(round(k * vfps / fps)) for k in range(int(nf * fps / vfps))))
        for i, rgb in battery_frames.footage_frames(a[1], want): series.append((i / vfps,) + frame_line(bgremove.wave(rgb)))
    else:
        page, tm, since, secs = a[1], a[2], float(a[3]), float(a[4]); W, H = (int(v) for v in opt(a, '--size', '1920x1080').split('x'))
        out = opt(a, '--work', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work', 'slow_%d' % os.getpid())); os.makedirs(out, exist_ok=True)
        step = int(round(60 / fps)); frames = [int(60 * since) + k * step for k in range(int(secs * fps))]
        spec = {'page': page, '_out': out, 'opts': {'time': tm, 'theme': int(opt(a, '--theme', 0)), 'seed': int(opt(a, '--seed', 1)),
                'w': W, 'h': H, 'layers': 'bg,wave,glare,sparkles,dither'}}
        for f, rgb in battery_frames.clean_frames(spec, frames): series.append(((f - frames[0]) / 60,) + frame_line(bgremove.wave(rgb)))
    t, cen, tilt, mid = zip(*series); s = summarise(t, cen, tilt, mid)
    print(json.dumps(s))
    if '--json' in a: json.dump({'summary': s, 't': t, 'centre': cen, 'tilt': tilt, 'mid': mid}, open(opt(a, '--json', None), 'w'))
