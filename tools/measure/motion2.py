# usage: python3 -I motion2.py DIR FPS [--json OUT]  -> motion of a wave-only sequence beyond spec46m.py, from three angles:
#  1. kymographs: a column of pixels stacked over time (y-t image), and the band's light summed down each column stacked
#     over time (x-t image). A moving feature draws a slanted streak whose slope is its speed; the slope is read with the
#     structure tensor (local orientation of the brightness gradient), weighted by gradient strength.
#     Reports the vertical speed of features in the y-t slices and the horizontal speed and rightwards share in the x-t image.
#  2. temporal spectrum: each band pixel's brightness over time, Fourier-transformed (Hann window), power averaged over
#     the band; reports the share of the change in three frequency bands and the spectral centroid (Hz).
#  3. optical flow (Lucas-Kanade, Gaussian window) between frames 1/FPS apart, over the band: median and p90 speed,
#     the median vertical and horizontal components, and the median speed in the left and right thirds. Where the band is
#     nearly all straight horizontal edges the horizontal component is ill-determined and reads high, so it is also
#     reported at the points with texture in two directions only, with their share (the original: 7-14%, the build: ~1%).
# Frames are converted to grey, scaled to 960x540 and measured there; speeds are quoted in px/s at 1920x1080.
import sys, os, glob, json
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, sobel

d = sys.argv[1]; fps = float(sys.argv[2]); out = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
files = sorted(glob.glob(os.path.join(d, '*.png')))
W, H = 960, 540; SC = 1920.0 / W
F = np.stack([np.asarray(Image.open(f).convert('L').resize((W, H), Image.BILINEAR), dtype=np.float32) for f in files])
nT = len(F); res = {'frames': nT, 'fps': fps}
mean = F.mean(0); band = gaussian_filter(mean, 4) > 0.15 * gaussian_filter(mean, 4).max()   # where the band spends its time

# 1. kymographs
def orient_speed(K, dt_axis=1):
    # K: space x time image; returns gradient-weighted samples of d(space)/d(time) in px per frame
    Ks = gaussian_filter(K, 1.0); gy = sobel(Ks, 0); gt = sobel(Ks, 1)
    Jyy = gaussian_filter(gy * gy, 2.0); Jtt = gaussian_filter(gt * gt, 2.0); Jyt = gaussian_filter(gy * gt, 2.0)
    # streak direction is perpendicular to the dominant gradient; speed = -gt/gy along it: v = -Jyt / Jyy
    wgt = Jyy + Jtt; v = -Jyt / np.maximum(Jyy, 1e-6)
    coher = np.sqrt((Jyy - Jtt) ** 2 + 4 * Jyt ** 2) / np.maximum(wgt, 1e-6)   # 1 = one clear orientation
    m = (wgt > np.percentile(wgt, 70)) & (coher > 0.6) & (Jyy > Jtt)            # streaks, not flicker
    return v[m], wgt[m]
vy_all = []; vw = []
for x in np.linspace(0.15, 0.85, 8):
    xi = int(x * W); K = F[:, :, max(0, xi - 1):xi + 2].mean(2).T            # rows x time
    v, w = orient_speed(K); vy_all.append(v); vw.append(w)
vy = np.concatenate(vy_all) * fps * SC; wy = np.concatenate(vw)
def wmed(v, w):
    if len(v) == 0: return float('nan')
    o = np.argsort(v); c = np.cumsum(w[o]); return float(v[o][np.searchsorted(c, 0.5 * c[-1])])
res['kymo_vy_med'] = wmed(np.abs(vy), wy)                                    # px/s @1080p, vertical speed of features
Kx = (F * band[None]).sum(1).T                                               # columns x time (light summed down each column)
Kx = Kx - gaussian_filter(Kx, (0, 3 * fps))                                  # remove slow brightening/dimming
v, w = orient_speed(Kx); vx = v * fps * SC
res['kymo_vx_med'] = wmed(np.abs(vx), w); res['kymo_right'] = float(np.sum(w * (vx > 0)) / max(np.sum(w), 1e-9))

# 2. temporal spectrum over band pixels
P = F[:, band]; P = P - P.mean(0); win = np.hanning(nT)[:, None]
S = (np.abs(np.fft.rfft(P * win, axis=0)) ** 2).mean(1); fr = np.fft.rfftfreq(nT, 1 / fps)
S = S[1:]; fr = fr[1:]; tot = S.sum()
res['spec_lo'] = float(S[fr < 0.3].sum() / tot); res['spec_mid'] = float(S[(fr >= 0.3) & (fr < 1.0)].sum() / tot); res['spec_hi'] = float(S[fr >= 1.0].sum() / tot)
res['spec_centroid'] = float((S * fr).sum() / tot)

# 3. optical flow (Lucas-Kanade) between consecutive frames
def lk(a, b, sig=6.0):
    a = gaussian_filter(a, 1.5); b = gaussian_filter(b, 1.5); m = 0.5 * (a + b)
    Ix = sobel(m, 1) / 8; Iy = sobel(m, 0) / 8; It = b - a
    Sxx = gaussian_filter(Ix * Ix, sig); Syy = gaussian_filter(Iy * Iy, sig); Sxy = gaussian_filter(Ix * Iy, sig)
    Sxt = gaussian_filter(Ix * It, sig); Syt = gaussian_filter(Iy * It, sig)
    det = Sxx * Syy - Sxy ** 2; tr = Sxx + Syy
    u = (-Syy * Sxt + Sxy * Syt) / np.maximum(det, 1e-9); v = (Sxy * Sxt - Sxx * Syt) / np.maximum(det, 1e-9)
    disc = np.sqrt(np.maximum(tr ** 2 - 4 * det, 0)); lam_min = 0.5 * (tr - disc); lam_max = 0.5 * (tr + disc)
    ok = lam_min > np.percentile(lam_min[band], 50)                          # the better-conditioned half of the band
    # points with texture in two directions (smaller eigenvalue at least 5% of the larger, on a strong edge): only
    # there is the motion along an edge measurable; on a straight edge only the motion across it is (aperture problem)
    tex = band & (lam_max > np.percentile(lam_max[band], 50)) & (lam_min > 0.05 * lam_max)
    return u, v, ok & band, tex, band & (lam_max > np.percentile(lam_max[band], 50))
U = []; V = []; X = []; TU = []; TV = []; ntex = 0; nstrong = 0
for i in range(0, nT - 1, max(1, int(fps // 5))):
    u, v, ok, tex, strong = lk(F[i], F[i + 1]); ys, xs = np.nonzero(ok)
    U.append(u[ok]); V.append(v[ok]); X.append(xs); TU.append(u[tex]); TV.append(v[tex]); ntex += tex.sum(); nstrong += strong.sum()
TU = np.concatenate(TU) * fps * SC; TV = np.concatenate(TV) * fps * SC; tg = np.hypot(TU, TV) < 400
res['flow_tex_share'] = float(ntex / max(nstrong, 1))
res['flow_tex_vx_med'] = float(np.median(np.abs(TU[tg]))) if tg.any() else float('nan')
res['flow_tex_vy_med'] = float(np.median(np.abs(TV[tg]))) if tg.any() else float('nan')
U = np.concatenate(U) * fps * SC; V = np.concatenate(V) * fps * SC; X = np.concatenate(X)
sp = np.hypot(U, V); good = sp < 400                                         # drop the few ill-posed points
res['flow_med'] = float(np.median(sp[good])); res['flow_p90'] = float(np.percentile(sp[good], 90))
res['flow_vy_med'] = float(np.median(np.abs(V[good]))); res['flow_vx_med'] = float(np.median(np.abs(U[good])))
res['flow_left'] = float(np.median(sp[good & (X < W / 3)])); res['flow_right'] = float(np.median(sp[good & (X > 2 * W / 3)]))

L = {'kymo_vy_med': 'kymograph: feature vertical speed median (px/s @1080p)', 'kymo_vx_med': 'kymograph: feature horizontal speed median (px/s @1920)',
     'kymo_right': 'kymograph: rightwards share (weighted)', 'spec_lo': 'temporal spectrum: share of change below 0.3 Hz',
     'spec_mid': 'temporal spectrum: share 0.3-1 Hz', 'spec_hi': 'temporal spectrum: share above 1 Hz', 'spec_centroid': 'temporal spectrum: centroid (Hz)',
     'flow_med': 'optical flow: speed median (px/s @1080p)', 'flow_p90': 'optical flow: speed p90', 'flow_vy_med': 'optical flow: |vertical| median',
     'flow_vx_med': 'optical flow: |horizontal| median (unreliable where the band is straight edges)',
     'flow_tex_share': 'optical flow: share of strong-edge points with texture in two directions',
     'flow_tex_vx_med': 'optical flow at those points: |horizontal| median', 'flow_tex_vy_med': 'optical flow at those points: |vertical| median', 'flow_left': 'optical flow: speed median, left third', 'flow_right': 'optical flow: speed median, right third'}
print('frames %d at %g fps' % (nT, fps))
for k, lab in L.items(): print('%-58s %.3f' % (lab + ':', res[k]))
if out: json.dump(res, open(out, 'w'), indent=1)
