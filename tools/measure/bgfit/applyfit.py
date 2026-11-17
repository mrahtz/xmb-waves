# writes a fit result (fit.py's OUT.json) into src/main/scene.js: BGL, BGW and the PALETTES block (spec 23: each month's
# day and night images as grids of colours)
import sys, json, re, os
R = json.load(open(sys.argv[1]))['p']
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'src', 'main', 'scene.js')
s = open(p, encoding='utf-8').read()
def num(v, d=3):
    t = ('%.' + str(d) + 'f') % v
    return '0.000' if t == '-0.000' else t
def setobj(s, name, vals, d=3):
    m = re.search(r'const ' + name + r' = \{(.*?)\};', s, re.S)
    body = m.group(1)
    for k, v in vals.items():
        body, n = re.subn(r'(\b' + k + r': )-?[0-9.]+', lambda mm: mm.group(1) + num(v, d), body)
        assert n == 1, (name, k, n)
    return s[:m.start(1)] + body + s[m.end(1):]
s = setobj(s, 'BGL', R['BGL']); s = setobj(s, 'BGW', R['BGW'])
GW, GH, NGH = (int(x) for x in re.search(r'const BG_GRID_W = (\d+), BG_GRID_H = (\d+), BG_NGRID_H = (\d+);', s).groups())
names = re.findall(r'/\*\s*(\d+) ([a-z ]*?)\s*\*/ \{ day:', s)
assert len(names) == 12, names
def fmt(G, gw, gh):
    rows = ['    ' + ',  '.join(', '.join(num(G[(j * gw + i) * 3 + c]) for c in range(3)) for i in range(gw)) + ',' for j in range(gh)]
    rows[-1] = rows[-1][:-1]
    return '\n'.join(rows)
out = []
for num_, name in names:
    P = R['PAL'][str(int(num_) - 1)]
    out.append('  /* %2s %-11s */ { day: [\n%s\n  ], night: [\n%s\n  ] },' % (num_, name, fmt(P['day'], GW, GH), fmt(P['night'], GW, NGH)))
block = 'const PALETTES = [\n' + '\n'.join(out) + '\n];'
s = re.sub(r'const PALETTES = \[.*?\n\];', lambda m: block, s, count=1, flags=re.S)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('wrote', os.path.normpath(p))
