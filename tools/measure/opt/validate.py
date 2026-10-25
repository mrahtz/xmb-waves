# validate.py: compare the fast evaluator's statistics (opt/val/*.json) with the full-render numbers (vNAME/spec46.txt,
# vNAME/s7/spec46.txt, vNAME/fill.txt, vNAME/spec46m.txt), metric by metric, and the ranking of variants by distance to the reference.
import os, re, sys, json, glob, numpy as np
SP = os.environ.get('MEASURE_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work'))
OPT = SP + '/opt'
NUM = r'[-+]?\d+\.?\d*'
# spec46.txt line -> (json key per number index)
MAP = {
    'centre median / range': ['centre'],
    'top edge min, bottom edge max': ['topMin', 'botMax'],
    'tilt (right - left centre), arch': ['tilt', 'arch'],
    'thickness median / p10-p90': ['thick', 'thickP10', 'thickP90'],
    'thickest/thinnest, pinch <0.08H, <0.05H': ['thickRatio', 'pinch8', 'pinch5'],
    'peaks/column at 12 %: mean, 1..6,7+ %': ['peaks12'],
    'peaks/column at 25 % and 40 %': ['peaks25', 'peaks40'],
    'face level (of column max) median / p10-p90': ['face', 'faceP10', 'faceP90'],
    'brightest fold / face: median, p90; avg peak / face median': ['foldface', 'foldfaceP90', 'avgface'],
    'overlap ratio (brightest/faintest face) median': ['overlap'],
    'peak width at half prominence': ['widthLines', 'widthAll', 'widthSheen'],
    'brightest line width median': ['bwidth'],
    'edge rise 10-90 % median / p10-p90': ['edge', 'edgeP10', 'edgeP90'],
    'dark partings per column (mean)': ['partcol'],
    'partings >= 5 % W: count, length median / max': ['partings', 'partLen', 'partMax'],
    'thin lines >= 10 % W: count, >= 25 % W, length median': ['lines10', 'lines25', 'lineLen'],
    'share of line pixels in outer fifths': ['outer'],
    'line peak / band median level: median': ['linepk'],
}
PREFIX = {k.split(':')[0].strip(): k for k in MAP}
def parse46(path):
    out = {}  # key -> list per frame
    for line in open(path):
        if ':' not in line or line.strip().startswith('spec:'): continue
        pre = line.split(':')[0].strip()
        if pre not in PREFIX: continue
        key = PREFIX[pre]; ncol = key.count(':') + (1 if pre == 'peak width at half prominence' else 0)
        rest = line.split(':', ncol + 1)[-1]
        cells = [c.strip() for c in rest.strip().split('|')]
        for ci, c in enumerate(cells):
            c2 = re.sub(r'(\d)-(\d)', r'\1 \2', c)  # ranges a-b -> a b
            nums = re.findall(NUM, c2)
            for ki, k in enumerate(MAP[key]):
                v = float(nums[ki]) if ki < len(nums) else float('nan')
                out.setdefault(k, [float('nan')] * len(cells))[ci] = v
    return out
def parsefill(path):
    for line in open(path):
        m = re.match(r'\S+\s+([\d.]+) \[[^\]]*\]\s+([\d.]+) \[[^\]]*\]\s+([\d.]+) \[[^\]]*\]\s+([\d.]+)', line.strip())
        if m: return dict(zip(['a40', 'a25', 'fmean', 'dark'], map(float, m.groups())))
    return None
MMAP = [('centre vertical speed', ['cspeed', 'cspeedP90']), ('mean height change', ['ch40', 'drift5']), ('swell shift', ['shift', 'shiftP10', 'shiftP90', 'crossing']),
        ('picture correlation', ['corr1', 'corr5']), ('adjacent peaks', ['adjdiff', 'pkspeed']), ('partings alive', ['pspeed', 'pright', 'npart']), ('parting lifetimes', ['lifeMed', 'lifeMax', 'nlife'])]
def parsem(path):
    out = {}
    for line in open(path):
        for key, names in MMAP:
            if line.startswith(key):
                rest = line.split('spec:')[0].rsplit(':', 1)[1]
                rest = re.sub(r'\(n=(\d+)\)', r' \1', rest)
                if key == 'swell shift': rest = rest.replace('->', ' ').replace('crossing in', ' ').replace('..', ' ').replace(' s', ' ')
                nums = [float(x) for x in re.findall(NUM, rest)]
                for i, n in enumerate(names):
                    if i < len(nums): out[n] = nums[i]
    return out

def rank(a): return np.argsort(np.argsort(a))
def spearman(a, b):
    a = np.asarray(a, float); b = np.asarray(b, float); ok = ~(np.isnan(a) | np.isnan(b)); a = a[ok]; b = b[ok]
    if len(a) < 3: return float('nan')
    return np.corrcoef(rank(a), rank(b))[0, 1]
def pearson(a, b):
    a = np.asarray(a, float); b = np.asarray(b, float); ok = ~(np.isnan(a) | np.isnan(b)); a = a[ok]; b = b[ok]
    if len(a) < 3 or a.std() == 0 or b.std() == 0: return float('nan')
    return np.corrcoef(a, b)[0, 1]

# ---- collect
rows = {}   # key -> list of (full, fast, variant)
fills = {}  # key -> list of (full, fast, variant)
mots = {}   # key -> list of (full, fast, variant)
variants = []
per_variant = {}  # variant -> {key: (full median, fast median)}
for js in sorted(glob.glob(OPT + '/val/*.json')):
    name = os.path.basename(js)[:-5]
    if name.endswith('_m'):
        v = name[:-2]; full = parsem(f'{SP}/v{v}/spec46m.txt'); fast = json.load(open(js))
        for k in fast:
            if k in full and fast[k] is not None: mots.setdefault(k, []).append((full[k], fast[k], v))
        continue
    v, sub = (name[:-3], 's7') if name.endswith('_s7') else (name, 'w3')
    txt = f'{SP}/v{v}/spec46.txt' if sub == 'w3' else f'{SP}/v{v}/s7/spec46.txt'
    if not os.path.exists(txt): continue
    full = parse46(txt); fast = json.load(open(js))
    if len(fast) != 3: continue
    label = v if sub == 'w3' else v + '/s7'; variants.append(label); pv = {}
    for k in full:
        if k not in fast[0]: continue
        fu = full[k]; fa = [f[k] if f[k] is not None else float('nan') for f in fast]
        for i in range(3): rows.setdefault(k, []).append((fu[i], fa[i], label))
        pv[k] = (np.nanmedian(fu), np.nanmedian(fa))
    ft = f'{SP}/v{v}/fill.txt' if sub == 'w3' else f'{SP}/v{v}/s7/fill.txt'
    if os.path.exists(ft):
        ff = parsefill(ft)
        if ff:
            for k in ff:
                fa = np.mean([f[k] for f in fast]); fills.setdefault(k, []).append((ff[k], fa, label)); pv[k] = (ff[k], fa)
    per_variant[label] = pv

# ---- objective definition (targets: the reference medians under these tools; scale: about the reference's frame-to-frame spread)
OBJ = [  # key, target, scale, weight, group
    ('thick', 0.165, 0.02, 1.0, 'core'), ('peaks12', 3.3, 0.5, 1.0, 'core'), ('face', 0.21, 0.06, 1.0, 'core'), ('foldface', 5.6, 1.5, 1.0, 'core'),
    ('partcol', 0.85, 0.35, 1.0, 'core'), ('linepk', 1.67, 0.2, 1.0, 'core'), ('a40', 0.48, 0.08, 1.0, 'core'), ('dark', 0.14, 0.06, 1.0, 'core'),
    ('widthLines', 8.5, 1.2, 0.5, 'aux'), ('edge', 5.5, 2.0, 0.5, 'aux'), ('partings', 5, 2.5, 0.5, 'aux'), ('lines10', 6, 3, 0.5, 'aux'),
    ('outer', 0.71, 0.15, 0.5, 'aux'), ('peaks25', 2.8, 0.5, 0.5, 'aux'), ('pinch8', 10, 8, 0.5, 'aux'),
]
def dist(vals, keys=None):
    s = 0; w = 0
    for k, t, sc, wt, g in OBJ:
        if keys is not None and k not in keys: continue
        v = vals.get(k)
        if v is None or np.isnan(v): continue
        s += wt * ((v - t) / sc) ** 2; w += wt
    return np.sqrt(s / w) if w else float('nan')

out = []
out.append('# Fast evaluator: validation against the full-render pipeline\n')
out.append(f'Variants compared: {len(variants)} frame triples ({len([v for v in variants if "/s7" not in v])} at seed 5, {len([v for v in variants if "/s7" in v])} at seed 7), '
           f'{len(set(x[2] for x in fills.get("a40", [])))} fill triples, {len(set(x[2] for x in mots.get("cspeed", [])))} motion sequences.\n')
out.append('Each variant was evaluated by the fast evaluator with the exact code and parameters of its own page (`var_NAME.html`), the same seed and the same frame numbers as the full renders (seed 5: frames 600/1200/1800; seed 7: 600/1500/3000; motion: seed 5, frames 900 + 6k, 300 frames at 10 fps, 960x540). The simulation is bit-for-bit the one the page runs (same code, same seed), so the comparison isolates the rasteriser and the statistics.\n')
out.append('## Per-frame statistics (spec46.py), pooled over all frames\n')
out.append('| metric | n | Pearson r | Spearman | mean offset (fast - full) | rms diff | full-render spread (std) | verdict |')
out.append('|---|---|---|---|---|---|---|---|')
verdict = {}
for k in ['centre', 'topMin', 'botMax', 'tilt', 'arch', 'thick', 'thickP10', 'thickP90', 'thickRatio', 'pinch8', 'pinch5', 'peaks12', 'peaks25', 'peaks40', 'face', 'faceP10', 'faceP90', 'foldface', 'foldfaceP90', 'avgface', 'overlap',
          'widthLines', 'widthAll', 'widthSheen', 'bwidth', 'edge', 'edgeP10', 'edgeP90', 'partcol', 'partings', 'partLen', 'partMax', 'lines10', 'lines25', 'lineLen', 'outer', 'linepk']:
    if k not in rows: continue
    a = np.array([r[0] for r in rows[k]], float); b = np.array([r[1] for r in rows[k]], float); ok = ~(np.isnan(a) | np.isnan(b) | np.isinf(a) | np.isinf(b))
    if k in ('foldface', 'foldfaceP90', 'overlap', 'avgface'): ok &= (a < 100) & (b < 100)  # the ratio explodes when a parting is black
    a = a[ok]; b = b[ok]
    r = pearson(a, b); s = spearman(a, b); off = (b - a).mean(); rms = np.sqrt(((b - a) ** 2).mean()); sd = a.std()
    good = (s >= 0.8 and abs(off) < 0.5 * sd) ; fair = (s >= 0.6)
    verdict[k] = 'transfers' if good else ('partly' if fair else 'no')
    out.append(f'| {k} | {len(a)} | {r:.3f} | {s:.3f} | {off:+.3f} | {rms:.3f} | {sd:.3f} | {verdict[k]} |')
out.append('\n## Fill (fill.py), per variant (means over the three frames)\n')
out.append('| metric | n | Pearson r | Spearman | mean offset | rms diff | spread (std) | verdict |')
out.append('|---|---|---|---|---|---|---|---|')
for k in ['a40', 'a25', 'fmean', 'dark']:
    if k not in fills: continue
    a = np.array([r[0] for r in fills[k]]); b = np.array([r[1] for r in fills[k]])
    r = pearson(a, b); s = spearman(a, b); off = (b - a).mean(); rms = np.sqrt(((b - a) ** 2).mean()); sd = a.std()
    verdict[k] = 'transfers' if (s >= 0.8 and abs(off) < 0.5 * sd) else ('partly' if s >= 0.6 else 'no')
    out.append(f'| {k} | {len(a)} | {r:.3f} | {s:.3f} | {off:+.3f} | {rms:.3f} | {sd:.3f} | {verdict[k]} |')
out.append('\n## Motion (spec46m.py), per 30 s sequence\n')
out.append('| metric | n | Pearson r | Spearman | mean offset | rms diff | spread (std) | verdict |')
out.append('|---|---|---|---|---|---|---|---|')
for k in ['cspeed', 'cspeedP90', 'ch40', 'drift5', 'shift', 'crossing', 'corr1', 'corr5', 'adjdiff', 'pkspeed', 'pspeed', 'pright', 'npart', 'lifeMed', 'lifeMax', 'nlife']:
    if k not in mots: continue
    a = np.array([r[0] for r in mots[k]], float); b = np.array([r[1] for r in mots[k]], float); ok = ~(np.isnan(a) | np.isnan(b)); a = a[ok]; b = b[ok]
    if len(a) < 3: continue
    r = pearson(a, b); s = spearman(a, b); off = (b - a).mean(); rms = np.sqrt(((b - a) ** 2).mean()); sd = a.std()
    verdict[k] = 'transfers' if (s >= 0.8 and abs(off) < 0.5 * sd) else ('partly' if s >= 0.6 else 'no')
    out.append(f'| {k} | {len(a)} | {r:.3f} | {s:.3f} | {off:+.3f} | {rms:.3f} | {sd:.3f} | {verdict[k]} |')
# per-variant motion table
if 'cspeed' in mots:
    out.append('\nPer sequence (full / fast): centre speed, swell shift W/s, corr 1 s, adjacent diff, parting speed, rightwards share, lifetime max\n')
    out.append('| variant | cspeed | shift | corr1 | adjdiff | pspeed | pright | lifeMax |')
    out.append('|---|---|---|---|---|---|---|---|')
    byv = {}
    for k in mots:
        for fu, fa, v in mots[k]: byv.setdefault(v, {})[k] = (fu, fa)
    for v in sorted(byv):
        d = byv[v]; cell = lambda k, f='%.3f': (f % d[k][0] + ' / ' + f % d[k][1]) if k in d else '-'
        out.append(f'| {v} | {cell("cspeed")} | {cell("shift")} | {cell("corr1", "%.2f")} | {cell("adjdiff", "%.1f")} | {cell("pspeed", "%.0f")} | {cell("pright", "%.2f")} | {cell("lifeMax", "%.1f")} |')

# ---- ranking by distance to the reference
out.append('\n## Ranking of variants by distance to the reference\n')
core = [k for k, t, sc, wt, g in OBJ if g == 'core']
dfull = {}; dfast = {}; dfullc = {}; dfastc = {}
for v, pv in per_variant.items():
    fu = {k: pv[k][0] for k in pv}; fa = {k: pv[k][1] for k in pv}
    if 'a40' not in fu or 'thick' not in fu or np.isnan(fu['thick']): continue
    dfull[v] = dist(fu); dfast[v] = dist(fa); dfullc[v] = dist(fu, core); dfastc[v] = dist(fa, core)
vs = sorted(dfull)
A = [dfull[v] for v in vs]; B = [dfast[v] for v in vs]; Ac = [dfullc[v] for v in vs]; Bc = [dfastc[v] for v in vs]
out.append(f'Distance = weighted rms of (value - target) / scale over the objective metrics (targets: the reference medians; scales: about the reference frame-to-frame spread), on the per-variant medians over three frames.\n')
out.append(f'- all objective metrics: Spearman between the full-render and fast rankings {spearman(A, B):.3f} (Pearson {pearson(A, B):.3f}), n = {len(vs)}')
out.append(f'- core metrics only (thickness, peaks, face, fold/face, partings per column, line/band, fill >40 %, fill <8 %): Spearman {spearman(Ac, Bc):.3f} (Pearson {pearson(Ac, Bc):.3f})')
top_full = [v for v, _ in sorted(dfull.items(), key=lambda x: x[1])[:10]]; top_fast = [v for v, _ in sorted(dfast.items(), key=lambda x: x[1])[:10]]
out.append(f'- top 10 by full render: {", ".join(top_full)}')
out.append(f'- top 10 by fast evaluator: {", ".join(top_fast)}')
out.append(f'- overlap of the two top-10 sets: {len(set(top_full) & set(top_fast))}')
out.append('\n| variant | distance (full) | distance (fast) | core (full) | core (fast) |')
out.append('|---|---|---|---|---|')
for v, _ in sorted(dfull.items(), key=lambda x: x[1])[:25]:
    out.append(f'| {v} | {dfull[v]:.2f} | {dfast[v]:.2f} | {dfullc[v]:.2f} | {dfastc[v]:.2f} |')
json.dump({'verdict': verdict, 'dfull': dfull, 'dfast': dfast}, open(OPT + '/validation.json', 'w'), indent=1)
open(OPT + '/validation_tables.md', 'w').write('\n'.join(out) + '\n')
print('\n'.join(out))
