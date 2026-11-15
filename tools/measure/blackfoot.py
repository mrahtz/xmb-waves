# usage: python3 blackfoot.py SOURCE [...]   (SOURCE: a footage clip, or a glob of raw 1920x1080 RGB frames, e.g. 'dir/n0_*.rgb')
# Spec 4.5 (version 20): how far down a night frame the top of the picture stays flat at the darkest output level.
# A clip is sampled at 1, 3, 5, 7, 9 s; the per-pixel temporal median of the frames removes most of the moving band and the
# sparkles. Then: largest channel, 15 px horizontal box mean (averages the dither), per row the 25th percentile over the
# columns; the baseline is the median of rows 0-40; the depth is the first row below which the profile stays above
# baseline + LIFT levels for 8 rows, as a fraction of the height. Printed for LIFT 0.5, 1 and 2 levels.
import sys, glob, subprocess, numpy as np
from scipy.ndimage import uniform_filter1d
def vframes(path, times, w=1920, h=1080):
    for t in times:
        b = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                           capture_output=True).stdout
        yield np.frombuffer(b, np.uint8).reshape(h, w, 3)
def profile(img):
    m = uniform_filter1d(img.max(axis=2).astype(np.float32), 15, axis=1)
    return np.percentile(m, 25, axis=1)
def depth(p, lift):
    base = np.median(p[:40]); above = p > base + lift
    for y in range(40, len(p) - 8):
        if above[y:y + 8].all(): return y / len(p)
    return 1.0
if __name__ == '__main__':
    for a in sys.argv[1:]:
        fr = [np.fromfile(f, np.uint8).reshape(1080, 1920, 3) for f in sorted(glob.glob(a))] if a.endswith('.rgb') else list(vframes(a, [1, 3, 5, 7, 9]))
        p = profile(np.median(np.stack(fr), axis=0).astype(np.uint8))
        print('%-70s %s' % (a[-70:], ' '.join('%.4f' % depth(p, l) for l in (0.5, 1.0, 2.0))))
