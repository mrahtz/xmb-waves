# spark25.py: the sparkle measures added by spec version 25, at full size and full frame rate, beside spark21.py's.
# usage:
#   python3 spark25.py footage CLIP START COUNT [--step S] --json OUT       (CLIP: a lossless clip.mkv; START, COUNT in frames)
#   python3 spark25.py build PAGE OPTS-JSON START COUNT [--step S] --json OUT   (renders PAGE's score mode on the GPU)
#   python3 spark25.py table OUT1.json OUT2.json ...                       (prints the numbers side by side)
# Footage and renders go through spark21.py's detector, so a point here is a point there. Every frame is measured twice:
# at its own size and after a Lanczos downscale to 1280 x 720 (the battery's size), so the gap between the two counts
# shows how crowded the field is.
#   count_full, count_ds       points per frame at full size and downscaled; faint (peak < 15) and bright (>= 25) apart
#   band_*                     the share of points in each band of peak level, the faintest that can be told from the
#                              background (6) up to the brightest
#   fwhm_p50/p90/p99, area_*   the spread of point sizes within a frame, over all points, not only the small bright ones
#   reg_fwhm_p50/p90           the same per third of the picture across and half down (6 regions), to show a gradient
#   wide_per_frame             points much wider than a sharp point (fwhm >= WIDE px and area >= 50): how many a frame
#                              holds, their width, peak level and how even their interior is (mean / max over the region)
#   halo_r*                    the light around isolated bright cores (peak >= 60, nothing else within 25 px) in annuli
#                              out from the core, as a share of the core's peak: the whole profile, not one distance
#   bend_*, wander_*           along tracks of >= 1 s: the departure from a straight line split into the one-way bend
#                              (the quadratic term) and the wander about it (the residual)
#   spd_spread_young/old       the spread of speeds (p90 - p10, over a 0.25 s sliding fit) in the first and the last third
#                              of a long track's frames, as a stand-in for young and old sparkles
import sys, os, json
import numpy as np
import cv2
import spark21

WIDE = 8.0           # px: "much wider than a sharp point" (a sharp point is about 3.6 px at half the peak)
BANDS = [6, 10, 15, 25, 40, 60, 100, 160, 1e9]


def downscale(a8):
    return cv2.resize(a8, (1280, 720), interpolation=cv2.INTER_LANCZOS4)


def halo_profile(a8, dets, edges=(1, 2, 3, 4, 6, 8, 11, 15, 20, 26)):
    # mean level in annuli around isolated bright cores, as a share of the core's own level over the local background.
    # The level is the raw channel mean (not the 15 px high-pass, which takes the halo's wide skirt away with it) and the
    # background is the median of the outermost annulus, so the whole profile from the core outwards is visible.
    g = a8.astype(np.float32).mean(2)
    H, W = g.shape
    xy = np.array([(d[0], d[1]) for d in dets], float) if dets else np.zeros((0, 2))
    out = []
    R = edges[-1]
    yy, xx = np.mgrid[-R:R + 1, -R:R + 1]
    rr = np.hypot(xx, yy)
    for d in dets:
        if d[2] < 60: continue
        x, y = d[0], d[1]
        if x < R + 1 or y < R + 1 or x >= W - R - 1 or y >= H - R - 1: continue
        other = (np.abs(xy[:, 0] - x) <= 28) & (np.abs(xy[:, 1] - y) <= 28)
        if other.sum() > 1: continue
        win = g[y - R:y + R + 1, x - R:x + R + 1]
        base = float(np.median(win[(rr >= edges[-2]) & (rr < edges[-1])]))
        core = float(win[rr < 1]. max()) - base
        if core < 20: continue
        prof = [(float(win[(rr >= a) & (rr < b)].mean()) - base) / core for a, b in zip(edges[:-1], edges[1:])]
        out.append(prof + [core])
    return np.array(out), edges


def interior_evenness(a8, d):
    # mean / max of the high-passed level over the point's own region at >= half the peak
    g = a8.astype(np.float32).mean(2) - spark21.median15(a8).mean(2)
    x, y = d[0], d[1]
    H, W = g.shape
    y0, y1, x0, x1 = max(0, y - 24), min(H, y + 25), max(0, x - 24), min(W, x + 25)
    win = g[y0:y1, x0:x1]
    m = win >= 0.5 * d[2]
    _, lab = cv2.connectedComponents(m.view(np.uint8), connectivity=4)
    L = lab[y - y0, x - x0]
    if L == 0: return float('nan')
    v = win[lab == L]
    return float(v.mean() / max(v.max(), 1e-3))


def pct(v, q):
    v = np.asarray(v, float)
    v = v[np.isfinite(v)]
    return float(np.percentile(v, q)) if len(v) else float('nan')


def measure(frames, step):
    full, ds, halos, wides, evens = [], [], [], [], []
    H = W = None
    for a8 in frames:
        H, W = a8.shape[:2]
        d = spark21.detect(a8)
        full.append(d)
        ds.append(spark21.detect(downscale(a8)))
        hp, edges = halo_profile(a8, d)
        if len(hp): halos.append(hp)
        wd = [q for q in d if q[7] >= WIDE and q[6] >= 50]
        wides.append(wd)
        for q in wd[:6]: evens.append(interior_evenness(a8, q))
    J = {}
    nf = np.array([len(d) for d in full], float)
    nd = np.array([len(d) for d in ds], float)
    J['frames'] = len(full)
    J['count_full'] = float(np.median(nf)); J['count_ds'] = float(np.median(nd))
    J['count_ratio'] = float(np.median(nf) / max(np.median(nd), 1e-6))
    allq = [q for d in full for q in d]
    P = np.array([q[2] for q in allq]); FW = np.array([q[7] for q in allq]); AR = np.array([q[6] for q in allq], float)
    X = np.array([q[0] for q in allq], float); Y = np.array([q[1] for q in allq], float)
    J['count_faint'] = float(np.median([sum(1 for q in d if q[2] < 15) for d in full]))
    J['count_bright'] = float(np.median([sum(1 for q in d if q[2] >= 25) for d in full]))
    dsP = [q[2] for d in ds for q in d]
    J['count_ds_faint'] = float(np.median([sum(1 for q in d if q[2] < 15) for d in ds]))
    # the whole distribution of peak levels, in bands
    for a, b in zip(BANDS[:-1], BANDS[1:]):
        J['band_%d' % a] = float(np.mean((P >= a) & (P < b))) if len(P) else float('nan')
    J['peak_p50'] = pct(P, 50); J['peak_p90'] = pct(P, 90); J['peak_p99'] = pct(P, 99)
    # the spread of point sizes within a frame, over all points
    J['fwhm_p50'] = pct(FW, 50); J['fwhm_p90'] = pct(FW, 90); J['fwhm_p99'] = pct(FW, 99)
    J['area_p50'] = pct(AR, 50); J['area_p90'] = pct(AR, 90); J['area_p99'] = pct(AR, 99)
    # by region: thirds across, halves down
    for ix in range(3):
        for iy in range(2):
            m = (X >= ix * W / 3) & (X < (ix + 1) * W / 3) & (Y >= iy * H / 2) & (Y < (iy + 1) * H / 2)
            J['reg_fwhm_p50_%d%d' % (ix, iy)] = pct(FW[m], 50) if m.sum() >= 20 else float('nan')
            J['reg_fwhm_p90_%d%d' % (ix, iy)] = pct(FW[m], 90) if m.sum() >= 20 else float('nan')
    rp50 = [J['reg_fwhm_p50_%d%d' % (ix, iy)] for ix in range(3) for iy in range(2)]
    J['reg_fwhm_p50_spread'] = float(np.nanmax(rp50) - np.nanmin(rp50))
    # the out-of-focus few
    J['wide_per_frame'] = float(np.mean([len(w) for w in wides]))
    wq = [q for w in wides for q in w]
    J['wide_fwhm_p50'] = pct([q[7] for q in wq], 50)
    J['wide_peak_p50'] = pct([q[2] for q in wq], 50)
    J['wide_peak_over_median'] = float(pct([q[2] for q in wq], 50) / max(pct(P, 50), 1e-6)) if wq else float('nan')
    J['wide_even_p50'] = pct(evens, 50)
    # the halo's whole profile
    if halos:
        hp = np.vstack(halos)
        _, edges = halo_profile(np.zeros((1, 1, 3), np.uint8), [])
        J['halo_cores'] = int(len(hp))
        for k, (a, b) in enumerate(zip(edges[:-1], edges[1:])):
            J['halo_r%d' % a] = float(np.median(hp[:, k]))
        J['halo_core_level'] = float(np.median(hp[:, -1]))
    # paths: the departure from a straight line, split into the one-way bend and the wander about it
    R = 6.0 * step * H / 1080.0
    tr = spark21.track(full, R)
    bend, wander, rat, sy, so = [], [], [], [], []
    for t in tr:
        if len(t) * step < 60: continue
        tt = np.array([q[0] for q in t]) * step / 60.0
        sc = 1080.0 / H
        x = np.array([q[1][0] for q in t], float) * sc; y = np.array([q[1][1] for q in t], float) * sc
        T = tt - tt.mean()
        cx = np.polyfit(T, x, 2); cy = np.polyfit(T, y, 2)
        # the quadratic term's own displacement over the track, and the residual about the quadratic fit
        qx = cx[0] * (T ** 2 - (T ** 2).mean()); qy = cy[0] * (T ** 2 - (T ** 2).mean())
        rx = x - np.polyval(cx, T); ry = y - np.polyval(cy, T)
        b = float(np.sqrt((qx ** 2 + qy ** 2).mean())); w = float(np.sqrt((rx ** 2 + ry ** 2).mean()))
        bend.append(b); wander.append(w); rat.append(b / max(b + w, 1e-6))
        # speeds in the first and last third of the track, from a 0.25 s sliding linear fit
        k = max(3, int(round(0.25 * 60 / step)))
        sp = []
        for i in range(len(t) - k):
            vx = np.polyfit(tt[i:i + k + 1], x[i:i + k + 1], 1)[0]
            vy = np.polyfit(tt[i:i + k + 1], y[i:i + k + 1], 1)[0]
            sp.append(np.hypot(vx, vy))
        if len(sp) >= 6:
            n3 = len(sp) // 3
            sy.extend(sp[:n3]); so.extend(sp[-n3:])
    J['long_tracks_1s'] = len(bend)
    J['bend_p50'] = pct(bend, 50); J['wander_p50'] = pct(wander, 50); J['bend_share_p50'] = pct(rat, 50)
    J['spd_spread_young'] = pct(sy, 90) - pct(sy, 10) if len(sy) > 20 else float('nan')
    J['spd_spread_old'] = pct(so, 90) - pct(so, 10) if len(so) > 20 else float('nan')
    J['spd_spread_ratio'] = float(J['spd_spread_old'] / max(J['spd_spread_young'], 1e-6))
    return J


def main():
    a = sys.argv[1:]
    if a[0] == 'table':
        Js = [(os.path.basename(os.path.dirname(f)) + '/' + os.path.basename(f), json.load(open(f))) for f in a[1:]]
        keys = [k for k in Js[0][1] if not isinstance(Js[0][1][k], dict)]
        print('%-22s' % '' + ''.join('%14s' % n[-14:] for n, _ in Js))
        for k in keys:
            print('%-22s' % k + ''.join('%14.3f' % J.get(k, float('nan')) if isinstance(J.get(k), (int, float)) else '%14s' % '-' for _, J in Js))
        return
    step = int(a[a.index('--step') + 1]) if '--step' in a else 1
    out = a[a.index('--json') + 1]
    if a[0] == 'footage': src = spark21.frames_footage(a[1], int(a[2]), int(a[3]), step)
    else: src = spark21.frames_build(a[1], a[2], int(a[3]), int(a[4]), step)
    J = measure(src, step)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    json.dump(J, open(out, 'w'), indent=1)
    print(out, 'frames', J['frames'], 'count_full', J['count_full'], 'count_ds', J['count_ds'])


if __name__ == '__main__':
    main()
