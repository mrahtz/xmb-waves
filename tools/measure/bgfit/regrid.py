# Change how coarse the images' grids are (spec 23: the coarsest description that leaves no visible difference).
# Reads the PALETTES block of src/main/scene.js, resamples every image onto a new grid by least squares against the same
# 32 x 18 picture the build reads, and writes the block and the BG_GRID_* line back.
# usage: python regrid.py GW GH NGH
import re, sys, os, numpy as np
GW, GH, NGH = (int(x) for x in sys.argv[1:4])
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'src', 'main', 'scene.js')
s = open(p, encoding='utf-8').read()
gw0, gh0, ngh0 = (int(x) for x in re.search(r'const BG_GRID_W = (\d+), BG_GRID_H = (\d+), BG_NGRID_H = (\d+);', s).groups())
BG_W, BG_H = (int(x) for x in re.search(r'const BG_W = (\d+), BG_H = (\d+);', s).groups())
ease = lambda t: (lambda x: x * x * (3 - 2 * x))(np.clip(t, 0, 1))
def basis(gw, gh):
    B = np.zeros((BG_H * BG_W, gw * gh))
    for y in range(BG_H):
        for x in range(BG_W):
            u = (x + 0.5) / BG_W; v = (y + 0.5) / BG_H
            fx = u * (gw - 1); fy = v * (gh - 1)
            i0 = min(max(int(np.floor(fx)), 0), gw - 2); j0 = min(max(int(np.floor(fy)), 0), gh - 2)
            ax = ease(fx - i0); ay = ease(fy - j0)
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
        img = basis(gw, gh) @ G
        Q = np.clip(np.linalg.lstsq(basis(ngw, ngh), img, rcond=None)[0], 0, 1.5)
        res.append(np.abs(basis(ngw, ngh) @ Q - img).mean() * 255)
        new[key] = Q
    out.append('  /* %2s %-11s */ { day: [\n%s\n  ], night: [\n%s\n  ] },' % (num_, name, fmt(new['day'], GW, GH), fmt(new['night'], GW, NGH)))
assert len(out) == 12, len(out)
s = re.sub(r'const BG_GRID_W = \d+, BG_GRID_H = \d+, BG_NGRID_H = \d+;',
           'const BG_GRID_W = %d, BG_GRID_H = %d, BG_NGRID_H = %d;' % (GW, GH, NGH), s, count=1)
s = re.sub(r'const PALETTES = \[.*?\n\];', lambda mm: 'const PALETTES = [\n' + '\n'.join(out) + '\n];', s, count=1, flags=re.S)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('%d x %d (night %d) ; resampling error %.2f levels mean, %.2f worst' % (GW, GH, NGH, np.mean(res), np.max(res)))
