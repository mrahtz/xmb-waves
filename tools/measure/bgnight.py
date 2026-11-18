# The lowest part of a night frame across the width, footage and build by one and the same method.
#
# Spec section 3 (N6, N8): the night light travels the whole of its path over the night, and only around the
# middle of the night does the night image rise clear of the floor under its level. A peak position read one
# condition at a time cannot tell a light that never shows from an image painted with the wrong lean, so this
# reads the whole profile and its contrast, and reports both as a curve over the hours of the night.
#
# usage: python bgnight.py [--index INDEX.json] [--cache DIR] [--commit REV|worktree] [--seed N]
#                          [--hours 20:00,21:30,00:00,04:00] [--band 0.1] [--json OUT.json]
#
# Both sides come from the battery's own cache, so they are measured the same way: a clip's background is the
# per-pixel temporal median of its 1 fps frames at 480 x 270 with the wave masked out (battery.py's bgprep,
# the same estimate its pixel comparison uses). For each condition the footage estimate is the mean over the
# index's clips of that condition, the build's is its render at the same condition, and both are read over the
# pixels neither side masks.
#
# Per condition, over the lowest --band of the rows:
#   profile  the mean level (mean of R, G, B) per column over the band's kept rows, gaps interpolated, then
#            smoothed with a Gaussian of 8 px at 480 wide, divided by its own mean (so only the shape is left)
#   peak     where the smoothed profile is brightest, as a fraction of the width (0 = left), refined by a
#            parabola through the three samples around it
#   contrast (max - min) / mean of the smoothed profile: how much of a peak there is to place at all
#   tilt     (right half - left half) / mean, the lean of the band
import numpy as np, os, sys, json, argparse
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import battery as B

SMOOTH_PX_AT_480 = 8.0


def profile(bg, keep, band=0.1):
    """bg: H x W x 3 levels, keep: H x W (1 = use). -> (smoothed profile / its mean, peak, contrast, tilt)"""
    h, w = keep.shape
    nb = max(1, int(round(band * h)))
    L = bg[h - nb:, :, :].mean(2); K = keep[h - nb:, :].astype(float)
    n = K.sum(0); s = (L * K).sum(0)
    p = np.where(n >= max(2, nb // 4), s / np.maximum(n, 1), np.nan)
    x = np.arange(w)
    if np.isnan(p).any():                                    # gaps where the wave covers the whole band
        good = ~np.isnan(p)
        if good.sum() < w // 4: return None
        p = np.interp(x, x[good], p[good])
    sig = SMOOTH_PX_AT_480 * w / 480.0
    r = int(np.ceil(3 * sig)); g = np.exp(-0.5 * (np.arange(-r, r + 1) / sig) ** 2); g /= g.sum()
    q = np.convolve(np.pad(p, r, mode='edge'), g, 'same')[r:-r]
    m = float(q.mean())
    if m <= 1e-6: return None
    i = int(np.argmax(q)); pk = float(i)
    if 0 < i < w - 1:                                        # parabola through the three samples around the peak
        a, b, c = q[i - 1], q[i], q[i + 1]; d = a - 2 * b + c
        if d < 0: pk = i + 0.5 * (a - c) / d
    half = w // 2
    return dict(profile=(q / m).tolist(), peak=pk / (w - 1), contrast=float((q.max() - q.min()) / m),
                tilt=float((q[half:].mean() - q[:half].mean()) / m), level=m)


def load(d):
    f = os.path.join(d, 'bgest.npz')
    if not os.path.exists(f): return None
    a = np.load(f); return a['bg'].astype(np.float64), a['mask']


def hour_of(t):
    h = int(t[:2]) + int(t[3:5]) / 60.0
    return h + 24 if h < 12 else h          # the night runs 18:00 -> 06:00, so the small hours come last


def curve(out):
    """the same readings as a curve over the hours of the night, month by month (what moves and what does not)"""
    by = {}
    for r in out: by.setdefault(r['date'], []).append(r)
    print('\nover the hours of the night, by month (peak position across the width; * = profile contrast under 0.12,'
          '\nwhere the bottom band is nearly flat and the position of its brightest place means little)')
    for d in sorted(by, key=lambda d: (d[5:7], d)):
        rs = sorted(by[d], key=lambda r: hour_of(r['time']))
        print('  %s' % d)
        for side in ('footage', 'clean'):
            cells = []
            for r in rs:
                p = r[side]
                cells.append('%s %5.3f%s' % (r['time'][:5], p['peak'], '*' if p['contrast'] < 0.12 else ' '))
            good = [r[side]['peak'] for r in rs if r[side]['contrast'] >= 0.12]
            span = (max(good) - min(good)) if len(good) > 1 else float('nan')
            print('    %-8s %s | span %.3f' % ('footage' if side == 'footage' else 'build', '  '.join(cells), span))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--index', default=r'C:\xmb-share\footage\INDEX.json')
    ap.add_argument('--cache', default=os.environ.get('MEASURE_CACHE') or os.path.join(HERE, 'work', 'battery'))
    ap.add_argument('--commit', default='HEAD')
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--hours', default='18:00,20:00,21:30,00:00,04:00,06:00')
    ap.add_argument('--band', type=float, default=0.1)
    ap.add_argument('--json')
    a = ap.parse_args()
    hours = set(a.hours.split(','))
    KD = os.path.join(a.cache, B.code_key())
    commit, pageh, _ = B.resolve_page(a.commit, a.cache)
    clips = [c for c in json.load(open(a.index))['clips'] if c['kind'] != 'noise' and c['time'][:5] in hours]
    conds = {}
    for c in clips:
        conds.setdefault((c['date'], c['time'], float(c['since_start_s']), float(c['seconds']), c['size']), []).append(c)
    out = []
    for k, cs in sorted(conds.items()):
        fd = [os.path.join(KD, 'footage', B.clip_id(c) + '_' + B.file_hash(c['path'])) for c in cs]
        F = [load(d) for d in fd]; F = [f for f in F if f]
        cd = os.path.join(KD, 'clean', pageh, B.cond_key(B.cond_of(cs[0], a.seed), False))
        C = load(cd)
        if not F or not C:
            print('no estimate for %s %s (footage %d, clean %s)' % (k[0], k[1], len(F), bool(C))); continue
        bgf = np.mean([f[0] for f in F], axis=0); mf = np.any([f[1] for f in F], axis=0)
        keep = (~(mf | C[1])).astype(float)
        pf, pc = profile(bgf, keep, a.band), profile(C[0], keep, a.band)
        if not pf or not pc: print('too little kept for %s %s' % (k[0], k[1])); continue
        out.append(dict(date=k[0], time=k[1], since_start_s=k[2], seconds=k[3], size=k[4], n_footage=len(F),
                        keep=float(keep.mean()), footage=pf, clean=pc))
    print('%-11s %-8s | %-27s | %-27s' % ('date', 'time', 'footage: peak contr tilt lvl', 'build:   peak contr tilt lvl'))
    for r in out:
        f, c = r['footage'], r['clean']
        print('%-11s %-8s | %5.3f %5.2f %+5.2f %5.1f      | %5.3f %5.2f %+5.2f %5.1f' % (
            r['date'], r['time'][:5], f['peak'], f['contrast'], f['tilt'], f['level'],
            c['peak'], c['contrast'], c['tilt'], c['level']))
    curve(out)
    if a.json:
        os.makedirs(os.path.dirname(os.path.abspath(a.json)), exist_ok=True)
        json.dump({'commit': commit, 'page': pageh, 'band': a.band, 'seed': a.seed, 'conditions': out},
                  open(a.json, 'w'), indent=1)


if __name__ == '__main__': main()
