# How the picture falls away up the frame, footage beside the build (spec 28). Two readings, the same measure at
# different hours:
#   - at the dead of night, how high the night glow climbs: the share of the bottom band's brightness left at each height
#     above the bottom edge, and the height at which it has halved, month by month (it is the night image's own painted
#     fall, not the reach of the light);
#   - in the shoulder of the evening or of the small hours, the share of the bottom row's brightness that survives at each
#     height, which separates a proportional law in the height (a straight line read on a logarithmic scale) from a law
#     that subtracts a power of the height (far too much left high in the frame).
# usage: python rowfall.py PAGE [FIT.json] [--hours 00,20,04]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]; hours = ('00', '20', '04')
if '--hours' in argv:
    i = argv.index('--hours'); hours = tuple(argv[i + 1].split(',')); del argv[i:i + 2]
meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
p = json.load(open(argv[1]))['p'] if len(argv) > 1 else {}
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), argv[0]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline(); w.stdin.write(json.dumps({'id': 0, 'p': p, 'imgs': True}) + '\n{"quit":1}\n'); w.stdin.flush()
r = json.loads(w.stdout.readline())

def rowprof(A, keep):
    """mean level (mean of the three channels) per row, bottom first, over the unmasked pixels"""
    a = A.mean(2)[::-1]; k = keep[::-1].astype(np.float32)
    s = (a * k).sum(1); n = k.sum(1)
    pr = np.where(n > 20, s / np.maximum(n, 1), np.nan)
    ok = ~np.isnan(pr)            # the wave hides whole rows across the middle: fill them from the rows around them
    return np.interp(np.arange(len(pr)), np.flatnonzero(ok), pr[ok])
def report(prof):
    """the share of the bottom band (the lowest 7 rows, about 5 % of the height) left at each height, and the height at
    which it has halved (linear interpolation between rows)"""
    base = np.nanmean(prof[:7])
    s = prof / max(base, 1e-6)
    hs = np.arange(len(prof)) / (len(prof) - 1.0)
    half = np.nan
    for i in range(7, len(s)):
        if s[i] <= 0.5: half = hs[i - 1] + (s[i - 1] - 0.5) / max(s[i - 1] - s[i], 1e-9) * (hs[i] - hs[i - 1]); break
    return base, [float(np.interp(h, hs, s)) for h in (0.1, 0.2, 0.3, 0.5, 0.8)], half

print('share of the bottom band left at 0.1, 0.2, 0.3, 0.5 and 0.8 of the height, and the half height')
print('%-20s %-8s %5s %5s %5s %5s %5s  %s' % ('condition', 'bottom', '0.1', '0.2', '0.3', '0.5', '0.8', 'half'))
for j, c in enumerate(meta):
    if c['time'][11:13] not in hours: continue
    m = np.array(r['imgs'][j], dtype=np.float32).reshape(135, 240, 4)[..., :3]
    for name, A in (('footage', T[j]), ('build', m)):
        base, sh, half = report(rowprof(A, K[j]))
        print('%-20s %-8s %5.1f %5.3f %5.3f %5.3f %5.3f %5.3f  %s' % (
            c['time'][:16] if name == 'footage' else '', name, base, *sh, ('%.3f' % half) if half == half else '-'))
