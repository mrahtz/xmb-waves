# usage: python3 jointfit.py BATTERY_DIR [STEP] [--dry]
# One joint fitting step of the shared settings (each mood's exposure, the month palettes) from a battery run (battery.py
# --seeds ..., the seed<N>/clips.json files): the original's recordings and renders against the clean renders at the same
# conditions (the 16 conditions at months 1, 4, 7, 10 and 00, 06, 12, 18 h, 40 s after the start).
#
# Levels: bgcompare.py's four corner regions (top = top_left and top_right, bottom = bottom_left and bottom_right), per channel,
# and cycle.py's band peak over the background. Ratios are original / clean with 4 levels added to both (as palfit.py).
#   exposure: each mood's hold hour (night 00, dawn 06, day 12, dusk 18). The composite's gain scales the background and the
#     wave alike, so its ratio is the geometric mean of the background's ratio (all regions and channels, over the months)
#     and the band peak's ratio. Each mood's exposure is multiplied by that ratio ** STEP.
#   palettes: what is left of the background's ratio after the exposure, per month, row and channel: the day images' top and
#     bottom colours (mid: their mean; glow: as top) from the day hours 06, 12 and 18; the night colour from the bottom row at
#     00 h. Months without footage get the mean of the four months' factors. Each factor ** STEP, kept to 0.8-1.25 (near-black
#     channels give unstable ratios).
# Rewrites src/main/scene.js in place (not with --dry) and prints the factors. STEP defaults to 0.7.
import sys, os, re, json, numpy as np
from collections import defaultdict
args = [a for a in sys.argv[1:] if not a.startswith('--')]; dry = '--dry' in sys.argv
d = args[0]; step = float(args[1]) if len(args) > 1 else 0.7
seeds = [s for s in sorted(os.listdir(d)) if s.startswith('seed')]
ROWS = {'top': ('top_left', 'top_right'), 'bottom': ('bottom_left', 'bottom_right')}
MOOD_HOUR = {'night': '00', 'dawn': '06', 'day': '12', 'dusk': '18'}
O = defaultdict(list); C = defaultdict(list)   # (month, hour, row, ch) -> values; (month, hour, 'band') -> values
for i, s in enumerate(seeds):
    for c in json.load(open(os.path.join(d, s, 'clips.json')))['clips']:
        k = c['condition']
        if c['kind'] == 'noise' or k['since_start_s'] != 40 or k['time'][3:5] != '00' or k['date'][8:] != '15': continue
        mo, hr = int(k['date'][5:7]), k['time'][:2]
        keys = [((mo, hr, row, ch), ['bg.%s.%s' % (r, ch) for r in regs]) for row, regs in ROWS.items() for ch in 'RGB']
        keys.append(((mo, hr, 'band', '-'), ['band.peak_over_background']))
        for key, names in keys:
            if i == 0 and all(c['original'].get(n) is not None for n in names): O[key].append(np.mean([c['original'][n] for n in names]))
            if all(c['clean'].get(n) is not None for n in names): C[key].append(np.mean([c['clean'][n] for n in names]))
lr = {k: np.log((np.mean(O[k]) + 4) / (np.mean(C[k]) + 4)) for k in O if k in C}
months = sorted({k[0] for k in lr})
exp_f = {}
for mood, hr in MOOD_HOUR.items():
    bg = np.mean([v for k, v in lr.items() if k[1] == hr and k[2] != 'band'])
    band = np.mean([v for k, v in lr.items() if k[1] == hr and k[2] == 'band'])
    exp_f[mood] = (np.exp(step * (bg + band) / 2), np.exp(bg), np.exp(band))
pal = {}
for mo in months:
    top = np.array([np.mean([lr[(mo, h, 'top', ch)] - np.log(exp_f[m][0]) / step for m, h in MOOD_HOUR.items() if m != 'night']) for ch in 'RGB'])
    bot = np.array([np.mean([lr[(mo, h, 'bottom', ch)] - np.log(exp_f[m][0]) / step for m, h in MOOD_HOUR.items() if m != 'night']) for ch in 'RGB'])
    nig = np.array([lr[(mo, '00', 'bottom', ch)] - np.log(exp_f['night'][0]) / step for ch in 'RGB'])
    pal[mo] = tuple(np.clip(np.exp(step * x), 0.8, 1.25) for x in (top, bot, nig))   # one step never moves a colour by more
# months without footage: the mean of the four months' factors, leaving out channels that are (near) zero in a month's palette,
# whose ratio that palette cannot change and which would only drag the others
src_txt = open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'src', 'main', 'scene.js'), encoding='utf-8').read()
cur = {}
for line in src_txt.split('\n'):
    mm = re.match(r'  /\*\s*(\d+) ', line)
    if mm and 'top:' in line:
        g = lambda k: np.array([float(x) for x in re.search(k + r'\[([-0-9., ]+)\]', line).group(1).split(',')])
        cur[int(mm.group(1))] = (g(r'\btop: '), g(r'\bbottom: '), g(r'night: \['))
def mean_f(i):
    out = np.ones(3)
    for ch in range(3):
        v = [np.log(pal[m][i][ch]) for m in pal if cur[m][i][ch] >= 0.01]
        out[ch] = np.exp(np.mean(v)) if v else 1.0
    return out
mean = tuple(mean_f(i) for i in range(3))
for mood, (f, b, p) in exp_f.items(): print('exposure %-5s x %.3f   (background ratio %.3f, band peak ratio %.3f)' % (mood, f, b, p))
for mo in months: print('month %2d top %s bottom %s night %s' % (mo, np.round(pal[mo][0], 3), np.round(pal[mo][1], 3), np.round(pal[mo][2], 3)))
print('other months: top %s bottom %s night %s' % tuple(np.round(x, 3) for x in mean))
if dry: sys.exit(0)
p = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'src', 'main', 'scene.js')
s = open(p, encoding='utf-8').read()
def scale(txt, key, f, hi=1.0):
    m = re.search(r'\b' + key + r': \[([-0-9., ]+)\]', txt)
    if not m: return txt
    v = [min(hi, max(0.0, float(x) * f[i])) for i, x in enumerate(m.group(1).split(','))]
    return txt.replace(m.group(0), key + ': [' + ', '.join('%.3f' % x for x in v) + ']', 1)
out = []
for line in s.split('\n'):
    m = re.match(r'  /\*\s*(\d+) ', line)
    if m and 'top:' in line:
        top, bot, nig = pal.get(int(m.group(1)), mean)
        line = scale(line, 'top', top); line = scale(line, 'bottom', bot); line = scale(line, 'mid', (top + bot) / 2)
        line = scale(line, 'glow', top)
        nm = re.search(r'night: \[\[([-0-9., ]+)\]', line)
        if nm:
            v = [min(1.0, float(x) * nig[i]) for i, x in enumerate(nm.group(1).split(','))]
            line = line.replace(nm.group(0), 'night: [[' + ', '.join('%.3f' % x for x in v) + ']', 1)
    out.append(line)
s = '\n'.join(out)
def block(s, mood):
    a = s.index('  ' + mood + ': {'); return a, s.index('focusFar', a)
new = {}
for mood in MOOD_HOUR:
    a, b = block(s, mood); new[mood] = float(re.search(r'exposure: ([0-9.]+)', s[a:b]).group(1)) * exp_f[mood][0]
# spec 4.5's order of the gain: lowest by day, slightly higher at dawn, higher again at dusk, highest at night. "Slightly" is
# held at no more than 1.10 times the day's (the build's ratio before this fit).
new['dawn'] = min(max(new['dawn'], new['day'] * 1.01), new['day'] * 1.10)
new['dusk'] = max(new['dusk'], new['dawn'] * 1.01); new['night'] = max(new['night'], new['dusk'] * 1.01)
for mood in MOOD_HOUR:   # each mood's exposure (in its block, the line holding 'exposure:')
    a, b = block(s, mood); blk = s[a:b]; mm = re.search(r'exposure: ([0-9.]+)', blk)
    blk = blk.replace(mm.group(0), 'exposure: %.3f' % new[mood], 1); s = s[:a] + blk + s[b:]
    print('exposure %-5s %s -> %.3f' % (mood, mm.group(1), new[mood]))
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('rewrote', p)
