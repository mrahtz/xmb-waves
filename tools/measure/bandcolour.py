# usage: python3 -I bandcolour.py SOURCE [...]          SOURCE: a footage clip, or a glob of raw 1920x1080 RGB frames ('d/x_*.rgb')
#        python3 -I bandcolour.py --exact WITH BG [...] pairs of globs: frames with the wave and the same frames without it
# Spec 4.5 (version 24): the colour the band's added light takes, the observable that pins the composite's black offset.
# Per frame (a clip at 1, 3, 5, 7, 9 s): a 9 px horizontal median per channel removes the sparkles (the band's lines run
# nearly horizontally and are wider); the band is where bgremove's light is above 3 levels, grown by 15 rows; per column
# and channel the background under the band is interpolated linearly between the rows just outside it (a 15-row median
# each side); the added light is the frame minus that background. Summed per channel over the band's pixels whose
# background is dark (largest channel below DARK levels; 'dark') and over all the band's pixels ('all'), counting only
# pixels whose added light is at least 2 levels. Printed: the share of each channel in the sum (R, G, B, adding up to 1),
# the background's own share over the same pixels, and the pixel count. --exact uses the true background instead.
import sys, glob, subprocess, numpy as np
from scipy.ndimage import median_filter, binary_dilation
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from bgremove import wave as bgwave
DARK = 10
def vframes(path, times=(1, 3, 5, 7, 9), w=1920, h=1080):
    for t in times:
        b = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                           capture_output=True).stdout
        yield np.frombuffer(b, np.uint8).reshape(h, w, 3)
def rawframes(g): return [np.fromfile(f, np.uint8).reshape(1080, 1920, 3) for f in sorted(glob.glob(g))]
def bandmask(f):
    m = bgwave(f) > 3
    return binary_dilation(m, structure=np.ones((31, 1), bool))
def interp_bg(F, M):
    H, W, _ = F.shape; BG = F.copy(); ys = np.arange(H)
    Fm = median_filter(F, size=(15, 1, 1))
    for x in range(W):
        free = ~M[:, x]
        if free.sum() < 20 or not M[:, x].any(): continue
        for c in range(3): BG[M[:, x], x, c] = np.interp(ys[M[:, x]], ys[free], Fm[free, x, c])
    return BG
def accum(acc, A, BG, M, key):
    lum = A.max(axis=2); dark = BG.max(axis=2) < DARK
    for k, sel in (('dark', M & dark & (lum >= 2)), ('all', M & (lum >= 2))):
        a = acc.setdefault(key + k, [np.zeros(3), np.zeros(3), 0])
        a[0] += A[sel].sum(axis=0); a[1] += BG[sel].sum(axis=0); a[2] += int(sel.sum())
def show(name, acc):
    out = []
    for k in ('dark', 'all'):
        s, b, n = acc[k]
        out.append('%s %.3f %.3f %.3f  bg %.3f %.3f %.3f  n %7d' % ((k,) + tuple(s / max(s.sum(), 1e-9)) + tuple(b / max(b.sum(), 1e-9)) + (n,)))
    print('%-58s %s' % (name[-58:], ' | '.join(out)), flush=True)
def measure_est(frames):
    acc = {}
    for f in frames:
        F = median_filter(f.astype(np.float32), size=(1, 9, 1)); M = bandmask(f)
        BG = interp_bg(F, M); accum(acc, F - BG, BG, M, '')
    return acc
if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--exact':
        for wg, bg in zip(a[1::2], a[2::2]):
            acc = {}
            for fw, fb in zip(rawframes(wg), rawframes(bg)):
                Fw = median_filter(fw.astype(np.float32), size=(1, 9, 1)); Fb = fb.astype(np.float32)
                accum(acc, Fw - Fb, Fb, bandmask(fw), '')
            show('exact ' + wg, acc)
    else:
        for s in a:
            show(s, measure_est(rawframes(s) if s.endswith('.rgb') else list(vframes(s))))
