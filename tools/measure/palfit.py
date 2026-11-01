# usage: python3 -I palfit.py DIR [STEP] -> one fitting step for the month palettes in src/main/scene.js against the
# original's recordings: for January, April, July and October, the day images' top and bottom colours (and the middle
# colour and glow) are scaled by the ratio of the original's background to DIR's renders (bgcompare.py's regions, the
# day times 06, 12 and 18 averaged), the night colour by the ratio at 00:00 (bottom); the other months get the mean of
# those four months' ratios. STEP (default 0.7) damps each step. Rewrites the PALETTES lines in place.
import sys, os, re, glob, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bgcompare import regions, R
d = sys.argv[1]; step = float(sys.argv[2]) if len(sys.argv) > 2 else 0.7
ratio = {}
for mo in (1, 4, 7, 10):
    get = lambda t: (np.mean([regions(p) for p in sorted(glob.glob(os.path.join(R, '2026-%02d-15-%s_[159].png' % (mo, t))))], axis=0), regions(os.path.join(d, '2026-%02d-15-%s.png' % (mo, t))))
    day = [get(t) for t in ('0600', '1200', '1800')]; ni = get('0000')
    r = lambda o, m: np.clip((o + 4) / (m + 4), 0.4, 2.5)
    top = np.mean([r(o[0].mean(0), m[0].mean(0)) for o, m in day], axis=0)
    bot = np.mean([r(o[1].mean(0), m[1].mean(0)) for o, m in day], axis=0)
    nig = r(ni[0][1].mean(0), ni[1][1].mean(0))
    ratio[mo] = (top ** step, bot ** step, nig ** step)
mean = tuple(np.mean([ratio[m][i] for m in ratio], axis=0) for i in range(3))
p = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'src', 'main', 'scene.js')
s = open(p).read()
def scale(txt, key, f):
    m = re.search(key + r': \[([-0-9., ]+)\]', txt)
    if not m: return txt
    v = [min(1.0, max(0.0, float(x) * f[i])) for i, x in enumerate(m.group(1).split(','))]
    return txt.replace(m.group(0), key + ': [' + ', '.join('%.3f' % x for x in v) + ']', 1)
out = []
for line in s.split('\n'):
    m = re.match(r'  /\*\s*(\d+) ', line)
    if m and 'top:' in line:
        mo = int(m.group(1)); top, bot, nig = ratio.get(mo, mean)
        line = scale(line, 'top', top); line = scale(line, 'bottom', bot); line = scale(line, 'mid', (top + bot) / 2)
        line = scale(line, 'glow', top)
        nm = re.search(r'night: \[\[([-0-9., ]+)\]', line)
        if nm:
            v = [min(1.0, float(x) * nig[i]) for i, x in enumerate(nm.group(1).split(','))]
            line = line.replace(nm.group(0), 'night: [[' + ', '.join('%.3f' % x for x in v) + ']', 1)
    out.append(line)
open(p, 'w').write('\n'.join(out))
for mo in sorted(ratio): print('month %2d ratios top %s bottom %s night %s' % (mo, np.round(ratio[mo][0], 2), np.round(ratio[mo][1], 2), np.round(ratio[mo][2], 2)))
