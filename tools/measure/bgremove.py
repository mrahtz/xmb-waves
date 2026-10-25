# usage: python3 -I bgremove.py OUTDIR FRAME.png [FRAME.png ...] [--size WxH]
# Removes the background from reference frames so that the wave's light can be measured with the same tools as
# wave-only renders: per column, a quadratic in the row is fitted to the rows above and below the band (5-28 % and
# 88-98 % of the height), smoothed across columns, and subtracted; the result is written as an 8-bit grey PNG.
# The 4K reference frames are scaled to 1920x1080 first (--size 1920x1080); clip frames are kept at their own size.
import os, sys, numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter1d
args = sys.argv[1:]; size = None
if '--size' in args:
    i = args.index('--size'); size = tuple(int(x) for x in args[i + 1].split('x')); del args[i:i + 2]
out, files = args[0], args[1:]; os.makedirs(out, exist_ok=True)
for p in files:
    im = Image.open(p).convert('RGB')
    if size: im = im.resize(size, Image.LANCZOS)
    a = np.asarray(im, dtype=float); L = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    H = L.shape[0]; ys = np.arange(H)
    fit = np.r_[int(0.05 * H):int(0.28 * H), int(0.88 * H):int(0.98 * H)]
    A = np.vstack([fit ** 2, fit, np.ones_like(fit)]).T
    coef = np.linalg.lstsq(A, L[fit, :], rcond=None)[0]
    coef = uniform_filter1d(coef, 9 if H >= 1000 else 5, axis=1)
    bg = coef[0][None, :] * ys[:, None] ** 2 + coef[1][None, :] * ys[:, None] + coef[2][None, :]
    Image.fromarray(np.clip(L - bg, 0, 255).astype(np.uint8)).save(os.path.join(out, os.path.basename(p)))
    print('wrote', os.path.join(out, os.path.basename(p)))
