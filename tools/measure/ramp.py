# usage: python3 ramp.py SOURCE [...]   (SOURCE: a footage clip, or a glob of raw 1920x1080 RGB frames)  [RAMP_OUT=file.json]
# Spec 4.5 (version 20): the band's brightness in the left part of the picture against the right part (the wave tint's ramp).
# Per frame: bgremove.wave() (background removed per column), 5 px median (drops sparkles and dither), per column the
# maximum. Left = columns 4-33 % of the width, right = 67-96 %. Per part: the mean of the column maxima, and the mean of
# their top quarter (the band's brightest places, the measure the spec names). A source's values are sums over its frames
# (clips sampled at 1, 3, 5, 7, 9 s); compare right / left between the original and the build over many clips.
import sys, os, glob, json, numpy as np
from scipy.ndimage import median_filter
from bgremove import wave
from blackfoot import vframes
def parts(f):
    cm = median_filter(wave(f), size=5).max(axis=0).astype(float); W = len(cm)
    L = cm[int(0.04 * W):int(0.33 * W)]; R = cm[int(0.67 * W):int(0.96 * W)]
    top = lambda x: np.sort(x)[-len(x) // 4:].mean()
    return L.mean(), R.mean(), top(L), top(R)
if __name__ == '__main__':
    out = {}
    for a in sys.argv[1:]:
        fr = (np.fromfile(f, np.uint8).reshape(1080, 1920, 3) for f in sorted(glob.glob(a))) if a.endswith('.rgb') else vframes(a, [1, 3, 5, 7, 9])
        s = np.array([parts(f) for f in fr]).sum(axis=0); out[a] = s.tolist()
        print('%-70s mean R/L %.3f  top R/L %.3f' % (a[-70:], s[1] / s[0], s[3] / s[2]))
    if os.environ.get('RAMP_OUT'): json.dump(out, open(os.environ['RAMP_OUT'], 'w'))
