# Change how coarse the images' grids are (spec 23: the coarsest description that leaves no visible difference).
# Reads the PALETTES block of src/main/scene.js, resamples every image onto a new grid by least squares against the same
# 32 x 18 picture the build reads, and writes the block and the BG_GRID_* line back.
# usage: python regrid.py GW GH NGH [--crowd0 C] [--shape0 GW,GH,NGH]
#   the rows sit at uneven heights, crowded towards the bottom edge by the exponent BG_GRID_CROWD of scene.js (spec 33);
#   --crowd0 gives the exponent the grids being read were written with, when it differs (1 = evenly spaced)
import re, sys, os, numpy as np
argv = sys.argv[1:]; crowd0 = None; shape0 = None
if '--crowd0' in argv:
    i = argv.index('--crowd0'); crowd0 = float(argv[i + 1]); del argv[i:i + 2]
if '--shape0' in argv:   # the shape the grids being read are written in, when the file already names the new one
    i = argv.index('--shape0'); shape0 = tuple(int(x) for x in argv[i + 1].split(',')); del argv[i:i + 2]
GW, GH, NGH = (int(x) for x in argv[:3])
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'src', 'main', 'scene.js')
s = open(p, encoding='utf-8').read()
gw0, gh0, ngh0 = shape0 if shape0 else (int(x) for x in re.search(r'const BG_GRID_W = (\d+), BG_GRID_H = (\d+), BG_NGRID_H = (\d+);', s).groups())
BG_W, BG_H = (int(x) for x in re.search(r'const BG_W = (\d+), BG_H = (\d+);', s).groups())
CROWD = float(re.search(r'const BG_GRID_CROWD = ([0-9.]+);', s).group(1))
if crowd0 is None: crowd0 = CROWD
ease = lambda t: (lambda x: x * x * (3 - 2 * x))(np.clip(t, 0, 1))
def rows(n, c): return np.array([1 - (1 - j / (n - 1)) ** c for j in range(n)])
def basis(gw, gh, c):
    ys = rows(gh, c)
    B = np.zeros((BG_H * BG_W, gw * gh))
    for y in range(BG_H):
        for x in range(BG_W):
            u = (x + 0.5) / BG_W; v = (y + 0.5) / BG_H
            fx = u * (gw - 1)
            i0 = min(max(int(np.floor(fx)), 0), gw - 2)
            j0 = 0
            while j0 < gh - 2 and v > ys[j0 + 1]: j0 += 1
            ax = ease(fx - i0); ay = ease((v - ys[j0]) / (ys[j0 + 1] - ys[j0]))
            for di, dj, w in ((0, 0, (1 - ax) * (1 - ay)), (1, 0, ax * (1 - ay)), (0, 1, (1 - ax) * ay), (1, 1, ax * ay)):
                B[y * BG_W + x, (j0 + dj) * gw + i0 + di] += w
    return B
def num(v):
    t = '%.3f' % v
    return '0.000' if t == '-0.000' else t
def fmt(G, gw, gh):
    rows = ['    ' + ',  '.join(', '.join(num(G[j * gw + i][c]) for c in range(3)) for i in range(gw)) + ',' for j in range(gh)]
    rows[-1] = rows[-1][:-1]
    return '\n'.join(rows)
out = []; res = []
for m in re.finditer(r'/\*\s*(\d+) ([a-z ]*?)\s*\*/ \{ day: \[(.*?)\], night: \[(.*?)\] \},', s, re.S):
    num_, name, d, n = m.group(1), m.group(2), m.group(3), m.group(4)
    new = {}
    for key, txt, gw, gh, ngw, ngh in (('day', d, gw0, gh0, GW, GH), ('night', n, gw0, ngh0, GW, NGH)):
        G = np.array([float(x) for x in txt.replace('\n', ' ').split(',') if x.strip()]).reshape(-1, 3)
        assert len(G) == gw * gh, (key, len(G), gw, gh)
        img = basis(gw, gh, crowd0) @ G
        Q = np.clip(np.linalg.lstsq(basis(ngw, ngh, CROWD), img, rcond=None)[0], 0, 1.5)
        res.append(np.abs(basis(ngw, ngh, CROWD) @ Q - img).mean() * 255)
        new[key] = Q
    out.append('  /* %2s %-11s */ { day: [\n%s\n  ], night: [\n%s\n  ] },' % (num_, name, fmt(new['day'], GW, GH), fmt(new['night'], GW, NGH)))
assert len(out) == 12, len(out)
s = re.sub(r'const BG_GRID_W = \d+, BG_GRID_H = \d+, BG_NGRID_H = \d+;',
           'const BG_GRID_W = %d, BG_GRID_H = %d, BG_NGRID_H = %d;' % (GW, GH, NGH), s, count=1)
s = re.sub(r'const PALETTES = \[.*?\n\];', lambda mm: 'const PALETTES = [\n' + '\n'.join(out) + '\n];', s, count=1, flags=re.S)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('%d x %d (night %d) ; resampling error %.2f levels mean, %.2f worst' % (GW, GH, NGH, np.mean(res), np.max(res)))
