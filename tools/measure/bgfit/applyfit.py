# writes a fit result (fit.py's OUT.json) into src/main/scene.js: BGL, BGW, NIGHT_IMG and the PALETTES lines
import sys, json, re, os
R = json.load(open(sys.argv[1]))['p']
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'src', 'main', 'scene.js')
s = open(p, encoding='utf-8').read()
def num(v, d=3):
    t = ('%.' + str(d) + 'f') % v
    return '0.000' if t in ('-0.000',) else t
def setobj(s, name, vals, d=3):
    m = re.search(r'const ' + name + r' = \{(.*?)\};', s, re.S)
    body = m.group(1)
    for k, v in vals.items():
        body, n = re.subn(r'(\b' + k + r': )-?[0-9.]+', lambda mm: mm.group(1) + num(v, d), body)
        assert n == 1, (name, k, n)
    return s[:m.start(1)] + body + s[m.end(1):]
s = setobj(s, 'BGL', R['BGL']); s = setobj(s, 'BGW', R['BGW']); s = setobj(s, 'NIGHT_IMG', R['NI'])
lines = s.split('\n')
for i, line in enumerate(lines):
    m = re.match(r'(  /\*\s*(\d+) [^*]*\*/ )\{ (.*) \},$', line)
    if not m: continue
    mo = int(m.group(2)) - 1; P = R['PAL'][str(mo)]
    def fmtv(v):
        if isinstance(v, list): return '[' + ', '.join(fmtv(x) for x in v) + ']'
        return num(v, 3) if isinstance(v, float) else str(v)
    keys = [k for k in ('top', 'mid', 'bottom', 'glow', 'glowPos', 'glowSize', 'tilt', 'night') if k in P]
    lines[i] = m.group(1) + '{ ' + ', '.join('%s: %s' % (k, fmtv(P[k])) for k in keys) + ' },'
open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('wrote', os.path.normpath(p))
