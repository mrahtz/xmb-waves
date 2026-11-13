# usage: python3 -I bgremove.py OUTDIR FRAME.png [FRAME.png ...] [--size WxH]
# Removes the background from reference frames so that the wave's light can be measured with the same tools as
# wave-only renders: per column, a quadratic in the row is fitted to the rows above and below the band (5-28 % and
# 88-98 % of the height), smoothed across columns, and subtracted; the result is written as an 8-bit grey PNG.
# The 4K reference frames are scaled to 1920x1080 first (--size 1920x1080); clip frames are kept at their own size.
# (battery.py imports wave(), which takes an 8-bit RGB array and returns the grey array this writes.)
import os, sys, numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter1d
def wave(a, rows=64):
    """8-bit RGB frame (H x W x 3 array) -> the background-removed light, 8-bit grey (H x W). The per-pixel arithmetic runs on
    blocks of rows (the same operations on each pixel as on the whole frame at once, with less memory traffic)."""
    a = np.asarray(a); H = a.shape[0]; ys = np.arange(H)
    L = np.empty(a.shape[:2])
    for r in range(0, H, rows):
        b = np.asarray(a[r:r + rows], dtype=float); L[r:r + rows] = 0.299 * b[..., 0] + 0.587 * b[..., 1] + 0.114 * b[..., 2]
    fit = np.r_[int(0.05 * H):int(0.28 * H), int(0.88 * H):int(0.98 * H)]
    A = np.vstack([fit ** 2, fit, np.ones_like(fit)]).T
    coef = np.linalg.lstsq(A, L[fit, :], rcond=None)[0]
    coef = uniform_filter1d(coef, 9 if H >= 1000 else 5, axis=1)
    out = np.empty(L.shape, np.uint8)
    for r in range(0, H, rows):
        y = ys[r:r + rows, None]
        bg = coef[0][None, :] * y ** 2 + coef[1][None, :] * y + coef[2][None, :]
        out[r:r + rows] = np.clip(L[r:r + rows] - bg, 0, 255).astype(np.uint8)
    return out
if __name__ == '__main__':
    args = sys.argv[1:]; size = None
    if '--size' in args:
        i = args.index('--size'); size = tuple(int(x) for x in args[i + 1].split('x')); del args[i:i + 2]
    out, files = args[0], args[1:]; os.makedirs(out, exist_ok=True)
    for p in files:
        im = Image.open(p).convert('RGB')
        if size: im = im.resize(size, Image.LANCZOS)
        Image.fromarray(wave(np.asarray(im))).save(os.path.join(out, os.path.basename(p)))
        print('wrote', os.path.join(out, os.path.basename(p)))
