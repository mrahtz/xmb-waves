# usage: python3 -I halowidth.py PAGE [--time 2026-10-15T18:00:00] [--frames 2700] [--seed 1] [--sizes 1280x720,2560x1440]
# Spec 5 (version 28), "Make it a test": the glare chain's size is a property of the picture, not of the output's pixel
# count, so the halo must keep the same width as a fraction of the picture at every output size a build is rendered at.
# The same moment is rendered at two clearly different sizes with the glare layer on and off (no sparkles, no dither);
# each pair is differenced, which leaves the glare and nothing else (version 20); and the width of the halo is read from
# the difference as a fraction of the picture's width. If it shrinks as the output grows, the chain is sized from the
# output and every halo measurement taken at another size is wrong by that factor.
# The width measure: the difference image is averaged along its rows into a profile down the picture (the band runs across,
# so this is the profile across the band), and the width of that profile is read where it has fallen to a half, a tenth and
# a fortieth of its peak, in fractions of the picture's height. The band itself is the same fraction of the picture at both
# sizes, so the half width is mostly the band and the two outer widths are mostly the halo's own reach; the peak is given
# too, because a chain sized from the output concentrates the same light into a higher peak over a smaller area.
# (An earlier form of this tool took the autocorrelation of the profile across the width. It is dominated by the band's own
# structure - on a chain sized from the output it moved by 7 % for a doubling of the size, where these widths move by 25 to
# 32 % - so it is not used.)
import sys, os, json, subprocess, tempfile
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))

def opt(a, k, d): return a[a.index(k) + 1] if k in a else d

def render(page, conds, outd):
    cf = os.path.join(outd, 'conds.json'); json.dump(conds, open(cf, 'w'))
    r = subprocess.run(['node', os.path.join(HERE, 'bandcolour_render.js'), page, cf, outd], capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode()[-900:])

def widths(diff, fracs=(0.5, 0.1, 0.025)):
    """-> the peak of the profile down the picture, and its width at each fraction of that peak (in fractions of the height)."""
    p = diff.mean(axis=1); pk = p.max(); i = int(np.argmax(p))
    out = []
    for fr in fracs:
        th = fr * pk; lo = hi = i
        while lo > 0 and p[lo] > th: lo -= 1
        while hi < len(p) - 1 and p[hi] > th: hi += 1
        out.append((hi - lo) / len(p))
    return pk, out

if __name__ == '__main__':
    a = sys.argv[1:]
    page = a[0]
    time = opt(a, '--time', '2026-10-15T18:00:00'); frames = int(opt(a, '--frames', 2700)); seed = int(opt(a, '--seed', 1))
    sizes = [tuple(int(v) for v in s.split('x')) for s in opt(a, '--sizes', '1280x720,2560x1440').split(',')]
    outd = os.path.join(os.environ.get('MEASURE_WORK', os.path.join(HERE, 'work')), 'halowidth')
    os.makedirs(outd, exist_ok=True)
    conds = []
    for w, h in sizes:
        for lay, tag in (('bg,wave,glare', 'on'), ('bg,wave', 'off')):
            conds.append({'name': '%dx%d_%s' % (w, h, tag), 'time': time, 'seed': seed, 'frames': frames, 'w': w, 'h': h, 'layers': lay})
    render(page, conds, outd)
    for w, h in sizes:
        f = lambda t: np.fromfile(os.path.join(outd, '%dx%d_%s.rgb' % (w, h, t)), np.uint8).reshape(h, w, 3).astype(np.float32)
        d = (f('on') - f('off')).max(axis=2)
        pk, ws = widths(d)
        print('%9s  glare total %10.1f level-px  max %5.1f  pixels >= 1 level %8d (%.4f of the frame)  profile peak %6.3f  '
              'width at a half / a tenth / a fortieth of it %.4f / %.4f / %.4f of the height'
              % ('%dx%d' % (w, h), d.sum(), d.max(), int((d >= 1).sum()), (d >= 1).mean(), pk, *ws))
