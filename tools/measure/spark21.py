# spark21.py: the sparkle measures of spec version 21 ("What to measure on footage"), at full size and full frame rate.
# usage:
#   python3 spark21.py footage CLIP START COUNT [--step S] --json OUT       (CLIP: a lossless clip.mkv; START, COUNT in frames)
#   python3 spark21.py build PAGE OPTS-JSON START COUNT [--step S] --json OUT   (renders PAGE's score mode on the GPU through
#                                                                       battery_render.js; START is the simulation frame)
#   python3 spark21.py table OUT1.json OUT2.json ...                    (prints the numbers side by side)
# Footage and renders go through the same code. Each frame is high-passed (frame minus a 15 px median, as sparks.py --hp),
# and every local maximum (5 x 5) of the channel mean above THR is a sparkle (of maxima within 3 px of each other, as on a
# flat plateau, only the strongest). For each:
#   peak       the high-passed level at the maximum (channel mean)
#   raw        the frame's own brightest channel at the maximum (0..255): how close the core comes to the top of the range
#   sat        (max - min) / max of the high-passed colour at the maximum, hue likewise
#   area       pixels of its 4-connected region at >= half the peak (in a 49 x 49 window; regions reaching the window's
#              edge are dropped as parts of something larger)
#   fwhm       the larger of the horizontal and vertical widths at half the peak through the maximum, interpolated
#   elong      sqrt of the ratio of the region's covariance eigenvalues
# Width of a disc in focus: fwhm of "small bright" sparkles (peak >= 40, area <= 40), median and quartiles.
# Colour: the saturation distribution of sparkles with peak >= 20, the share above 0.35 and 0.5, and the saturation by peak
# tercile. Placement: the share of sparkles in the top and bottom tenths of the picture and the spread of their rows about
# each 1/8-width column strip's median row (per frame).
# Twinkle: sparkles are linked frame to frame (mutual nearest neighbour within 6 px at 60 fps, scaled by the step) into
# tracks; the track lengths, and along tracks of >= 10 frames the median relative frame-to-frame change of the peak
# |p[k+1]-p[k]| / max(p), the share of a track's frames below half its maximum, and the lag at which the peak's
# autocorrelation along the track falls below 0.5.
import sys, os, json, subprocess
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
THR = 6.0

def median15(a8):
    p = np.pad(a8, ((7, 7), (7, 7), (0, 0)), mode='symmetric')
    return cv2.medianBlur(np.ascontiguousarray(p), 15)[7:-7, 7:-7].astype(np.float32)

def fwhm_1d(v, c, half):
    # width at 'half' of the profile v around index c, linearly interpolated on both sides
    n = len(v); l = c
    while l > 0 and v[l - 1] >= half: l -= 1
    r = c
    while r < n - 1 and v[r + 1] >= half: r += 1
    wl = (v[l] - half) / max(v[l] - v[l - 1], 1e-6) if l > 0 else 0.0
    wr = (v[r] - half) / max(v[r] - v[r + 1], 1e-6) if r < n - 1 else 0.0
    return (r - l) + min(wl, 1.0) + min(wr, 1.0)

def detect(a8):
    a = a8.astype(np.float32)
    h = a - median15(a8)
    g = h.mean(2)
    mx = cv2.dilate(g, np.ones((5, 5), np.uint8))
    ys, xs = np.nonzero((g == mx) & (g > THR))
    # a flat plateau makes every one of its pixels a maximum: keep the strongest of any maxima within 3 px of each other
    # (ties in raster order)
    o = np.argsort(-g[ys, xs], kind='stable'); taken = np.zeros(g.shape, bool); keep = []
    for k in o.tolist():
        y, x = int(ys[k]), int(xs[k])
        if taken[max(0, y - 3):y + 4, max(0, x - 3):x + 4].any(): continue
        taken[y, x] = True; keep.append((y, x))
    out = []
    H, W = g.shape
    for y, x in keep:
        p = float(g[y, x])
        y0, y1, x0, x1 = max(0, y - 24), min(H, y + 25), max(0, x - 24), min(W, x + 25)
        win = g[y0:y1, x0:x1] >= 0.5 * p
        _, lab, st, _ = cv2.connectedComponentsWithStats(win.view(np.uint8), connectivity=4)
        L = lab[y - y0, x - x0]
        if L == 0: continue
        left, top, wd, ht, area = (int(v) for v in st[L])
        if top == 0 or left == 0 or top + ht == win.shape[0] or left + wd == win.shape[1]: continue
        if area >= 3:
            yy, xx = np.nonzero(lab == L)
            ev = np.sort(np.linalg.eigvalsh(np.cov(np.vstack([xx, yy]))))
            el = float(np.sqrt(max(ev[1], 1e-6) / max(ev[0], 0.08)))
        else: el = 1.0
        fw = max(fwhm_1d(g[y, x0:x1], x - x0, 0.5 * p), fwhm_1d(g[y0:y1, x], y - y0, 0.5 * p))
        c = h[y, x]; cm = float(c.max())
        sat = float((cm - c.min()) / max(cm, 1e-3))
        r_, g_, b_ = (float(v) for v in c)
        hue = float(np.degrees(np.arctan2(np.sqrt(3) * (g_ - b_), 2 * r_ - g_ - b_)) % 360)
        out.append((x, y, p, float(a8[y, x].max()), sat, hue, area, fw, el))
    return out

def frames_footage(clip, start, count, step):
    W, H = 1920, 1080
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                            '-of', 'csv=p=0', clip], capture_output=True, text=True).stdout.strip().split(',')
    W, H = int(probe[0]), int(probe[1])
    sel = 'select=between(n\\,%d\\,%d)*not(mod(n-%d\\,%d))' % (start, start + (count - 1) * step, start, step)
    pr = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', clip, '-vf', sel, '-fps_mode', 'passthrough', '-f', 'rawvideo',
                           '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    n = W * H * 3
    for _ in range(count):
        b = pr.stdout.read(n)
        if len(b) < n: break
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)
    pr.stdout.close(); pr.wait()

def frames_build(page, opts, start, count, step):
    o = json.loads(opts); W, H = int(o['w']), int(o['h'])
    fr = ','.join(str(start + k * step) for k in range(count))
    pr = subprocess.Popen(['node', os.path.join(HERE, 'battery_render.js'), page, opts, fr], stdout=subprocess.PIPE)
    n = W * H * 3
    for _ in range(count):
        b = pr.stdout.read(n)
        if len(b) < n: break
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)
    pr.stdout.close(); pr.wait()

def track(dets, R):
    # every detection gets a track id; a mutual nearest neighbour within R in the next frame continues it
    ids = []; nxt = 0; tracks = {}
    for i, d in enumerate(dets):
        cur = [-1] * len(d)
        if i > 0 and len(d) and len(dets[i - 1]):
            A = dets[i - 1]
            PA = np.array([(q[0], q[1]) for q in A], float); PB = np.array([(q[0], q[1]) for q in d], float)
            D = np.sqrt(((PA[:, None, :] - PB[None, :, :]) ** 2).sum(2))
            ab = D.argmin(1); ba = D.argmin(0); ia_ = np.arange(len(A))
            for ia in np.nonzero((ba[ab] == ia_) & (D[ia_, ab] <= R))[0].tolist(): cur[int(ab[ia])] = ids[i - 1][ia]
        for j in range(len(d)):
            if cur[j] < 0: cur[j] = nxt; nxt += 1
            tracks.setdefault(cur[j], []).append((i, d[j]))
        ids.append(cur)
    # tracks cut by the clip's first or last frame are kept (their length is a lower bound, the same for every source)
    return list(tracks.values())

def pct(v, q): return float(np.percentile(v, q)) if len(v) else float('nan')

def summarise(dets, step, H):
    J = {}
    allq = [q for d in dets for q in d]
    P = np.array([q[2] for q in allq]); RAW = np.array([q[3] for q in allq]); SAT = np.array([q[4] for q in allq])
    HUE = np.array([q[5] for q in allq]); AREA = np.array([q[6] for q in allq]); FW = np.array([q[7] for q in allq])
    EL = np.array([q[8] for q in allq]); Y = np.array([q[1] for q in allq], float)
    n = np.array([len(d) for d in dets])
    J['frames'] = len(dets); J['n_med'] = float(np.median(n))
    # brightness
    J['peak_p50'] = pct(P, 50); J['peak_p90'] = pct(P, 90); J['peak_p99'] = pct(P, 99)
    J['raw_p99'] = pct(RAW, 99); J['raw_p999'] = pct(RAW, 99.9)
    J['share_raw_ge250'] = float(np.mean(RAW >= 250)) if len(RAW) else float('nan')
    J['top10_mean'] = float(np.mean([np.mean(sorted([q[2] for q in d], reverse=True)[:10]) for d in dets if d]))
    J['share_faint'] = float(np.mean(P < 15))   # on the edge of being seen
    # shape
    sb = (P >= 40) & (AREA <= 40)
    J['small_bright_n'] = int(sb.sum())
    J['fwhm_p25'] = pct(FW[sb], 25); J['fwhm_p50'] = pct(FW[sb], 50); J['fwhm_p75'] = pct(FW[sb], 75)
    J['eqdiam_p50'] = float(2 * np.sqrt(np.median(AREA[sb]) / np.pi)) if sb.any() else float('nan')
    br = P >= 20
    J['elong_share_br'] = float(np.mean(EL[br] >= 2.2)) if br.any() else float('nan')
    J['elong_share_all'] = float(np.mean(EL >= 2.2))
    # colour
    s = SAT[br]
    J['sat_n'] = int(br.sum())
    for q in (25, 50, 75, 90, 95): J['sat_p%d' % q] = pct(s, q)
    J['sat_gt35'] = float(np.mean(s > 0.35)); J['sat_gt50'] = float(np.mean(s > 0.5))
    if br.sum() >= 30:
        t1, t2 = np.percentile(P[br], [33.3, 66.7]); pb = P[br]
        for k, m in (('lo', pb < t1), ('mid', (pb >= t1) & (pb < t2)), ('hi', pb >= t2)):
            J['sat_med_' + k] = float(np.median(s[m])); J['sat_gt35_' + k] = float(np.mean(s[m] > 0.35))
        vb = P >= 60
        J['sat_gt35_p60'] = float(np.mean(SAT[vb] > 0.35)) if vb.sum() >= 10 else float('nan')
        J['sat_gt35_raw250'] = float(np.mean(SAT[br & (RAW >= 250)] > 0.35)) if (br & (RAW >= 250)).sum() >= 10 else float('nan')
    # the same without cores that reach the top of the range (a clipped channel shifts the excess's colour)
    nc = br & (RAW < 245)
    J['nc_n'] = int(nc.sum())
    if nc.sum() >= 30:
        s2 = SAT[nc]
        for q in (50, 75, 90, 95): J['nc_sat_p%d' % q] = pct(s2, q)
        J['nc_sat_gt35'] = float(np.mean(s2 > 0.35)); J['nc_sat_gt50'] = float(np.mean(s2 > 0.5))
        t1, t2 = np.percentile(P[nc], [33.3, 66.7]); pb = P[nc]
        for k, m in (('lo', pb < t1), ('mid', (pb >= t1) & (pb < t2)), ('hi', pb >= t2)):
            J['nc_sat_gt35_' + k] = float(np.mean(s2[m] > 0.35))
        sc2 = nc & (SAT > 0.35)
        if sc2.sum():
            hb = np.histogram(HUE[sc2], bins=[0, 30, 60, 90, 150, 210, 270, 330, 360])[0] / sc2.sum()
            J['nc_hue_hist'] = dict(zip(['r0-30', 'o30-60', 'y60-90', 'g90-150', 'c150-210', 'b210-270', 'm270-330', 'r330-360'], [float(v) for v in hb]))
    # hues of the strongly coloured
    sc = br & (SAT > 0.35)
    if sc.sum():
        hb = np.histogram(HUE[sc], bins=[0, 30, 60, 90, 150, 210, 270, 330, 360])[0] / sc.sum()
        J['hue_hist'] = dict(zip(['r0-30', 'o30-60', 'y60-90', 'g90-150', 'c150-210', 'b210-270', 'm270-330', 'r330-360'], [float(v) for v in hb]))
    # placement
    J['share_top10'] = float(np.mean(Y < 0.1 * H)); J['share_bot10'] = float(np.mean(Y > 0.9 * H))
    J['share_top20'] = float(np.mean(Y < 0.2 * H)); J['share_bot20'] = float(np.mean(Y > 0.8 * H))
    dev = []
    for d in dets:
        if len(d) < 16: continue
        xy = np.array([(q[0], q[1]) for q in d], float); W = 1920 * H / 1080.0
        sb_ = np.minimum((xy[:, 0] / (W / 8)).astype(int), 7)
        for k in range(8):
            m = sb_ == k
            if m.sum() >= 4: dev.extend(np.abs(xy[m, 1] - np.median(xy[m, 1])) / H)
    dev = np.array(dev)
    J['dev_p50'] = pct(dev, 50); J['dev_p90'] = pct(dev, 90); J['dev_gt25'] = float(np.mean(dev > 0.25))
    J['y_p05'] = pct(Y / H, 5); J['y_p50'] = pct(Y / H, 50); J['y_p95'] = pct(Y / H, 95)   # rows, 0 = top
    # twinkle
    R = 6.0 * step * H / 1080.0
    tr = track(dets, R)
    L = np.array([len(t) for t in tr])
    J['tracks'] = len(tr); J['track_len_p50'] = pct(L, 50) * step; J['track_len_p90'] = pct(L, 90) * step
    J['track_len_mean'] = float(L.mean() * step) if len(L) else float('nan')
    long_ = [t for t in tr if len(t) >= 10]
    rel = []; low = []; lag = []
    for t in long_:
        p = np.array([q[1][2] for q in t])
        rel.append(np.median(np.abs(np.diff(p))) / p.max()); low.append(np.mean(p < 0.5 * p.max()))
        z = p - p.mean(); v = (z * z).sum()
        if v > 0:
            k = 1
            while k < len(p) - 2 and (z[:-k] * z[k:]).sum() / v * len(p) / (len(p) - k) >= 0.5: k += 1
            lag.append(k * step)
    J['long_tracks'] = len(long_)
    J['tw_rel_p50'] = pct(rel, 50); J['tw_low_p50'] = pct(low, 50); J['tw_lag_p50'] = pct(lag, 50)
    J['cv_track'] = pct([np.std([q[1][2] for q in t]) / np.mean([q[1][2] for q in t]) for t in long_], 50)
    # motion: curvature and speed spread along long tracks (frames at 60 fps / step)
    sp = []; bend = []
    for t in tr:
        if len(t) * step < 60: continue
        tt = np.array([q[0] for q in t]) * step / 60.0; x = np.array([q[1][0] for q in t], float) * 1080.0 / H; y = np.array([q[1][1] for q in t], float) * 1080.0 / H
        vx = np.polyfit(tt, x, 1)[0]; vy = np.polyfit(tt, y, 1)[0]; sp.append(np.hypot(vx, vy))
        cx = np.polyfit(tt, x, 2)[0]; cy = np.polyfit(tt, y, 2)[0]; bend.append(2 * np.hypot(cx, cy))
    J['tracks_1s'] = len(sp); J['speed_p50'] = pct(sp, 50); J['acc_p50'] = pct(bend, 50)
    return J

def main():
    a = sys.argv[1:]
    if a[0] == 'table':
        Js = [(os.path.basename(os.path.dirname(f)) + '/' + os.path.basename(f), json.load(open(f))) for f in a[1:]]
        keys = [k for k in Js[0][1] if not isinstance(Js[0][1][k], dict)]
        print('%-18s' % '' + ''.join('%14s' % n[-14:] for n, _ in Js))
        for k in keys:
            print('%-18s' % k + ''.join('%14.3f' % J.get(k, float('nan')) if isinstance(J.get(k), (int, float)) else '%14s' % '-' for _, J in Js))
        for n, J in Js:
            for hk in ('hue_hist', 'nc_hue_hist'):
                if hk in J: print(n[-24:], hk, ' '.join('%s:%.2f' % kv for kv in J[hk].items()))
        return
    step = int(a[a.index('--step') + 1]) if '--step' in a else 1
    out = a[a.index('--json') + 1]
    if a[0] == 'footage': src = frames_footage(a[1], int(a[2]), int(a[3]), step); H = None
    else: src = frames_build(a[1], a[2], int(a[3]), int(a[4]), step)
    dets = []
    for f in src:
        H = f.shape[0]; dets.append(detect(f))
    J = summarise(dets, step, H)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    json.dump(J, open(out, 'w'), indent=1)
    print(out, 'frames', len(dets), 'n_med', J['n_med'])

if __name__ == '__main__':
    main()
