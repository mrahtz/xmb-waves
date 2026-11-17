# usage: python3 brightfoot.py SOURCE [...]   (SOURCE: a footage clip, or a glob of raw 1920x1080 RGB frames)
# Spec 5 (version 24): what the bright-pass sees, measured on the final frame (footage or my full renders, the same code).
# Per frame (a clip at 1, 5, 9 s): a 9 px horizontal median per channel (removes the sparkles), the mean over 8 x 8 blocks
# (the bright-pass's resolution), the largest channel. Printed (output units, 0..1): the band's maximum (blocks within the
# band: bgremove's light above 2 levels, grown by 40 px) and the background's maximum away from it, with the background's
# position (x, y as fractions), each the median over the frames. The footage carries its glare, so where the background
# glares by itself it reads slightly high.
import sys, glob, numpy as np
from scipy.ndimage import median_filter, binary_dilation
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from bgremove import wave as bgwave
from bandcolour import vframes, rawframes
def one(f):
    F = median_filter(f.astype(np.float32), size=(1, 9, 1))
    B = F.reshape(135, 8, 240, 8, 3).mean(axis=(1, 3)).max(axis=2) / 255
    M = binary_dilation(bgwave(f) > 2, structure=np.ones((81, 81), bool)).reshape(135, 8, 240, 8).any(axis=(1, 3))
    band = B[M].max() if M.any() else 0.0
    Bb = np.where(M, -1, B); j, i = np.unravel_index(np.argmax(Bb), Bb.shape)
    return band, Bb[j, i], (i + 0.5) / 240, (j + 0.5) / 135
if __name__ == '__main__':
    for s in sys.argv[1:]:
        fr = rawframes(s) if s.endswith('.rgb') else list(vframes(s, (1, 5, 9)))
        r = np.median(np.array([one(f) for f in fr]), axis=0)
        print('%-60s band %.3f  bg %.3f at x %.2f y %.2f' % ((s[-60:],) + tuple(r)), flush=True)
