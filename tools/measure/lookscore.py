# lookscore.py: one number per variant from looksweep.py's per-mood figures, and the table of what makes it up.
# usage: python3 lookscore.py METRICS.json FOOTAGE.json VARIANT.json [...]
# Each measure's distance from the footage's own figure at that mood is divided by the range the original shows over the
# whole footage index (the battery's `original` range for that measure, which is what the merge gate measures a move
# against), so that measures of very different sizes can be added up. The score is the root mean square of those, over
# the four moods and the measures listed below - the band's structure, not its level, because spec 4.5 keeps the two
# apart and the per-mood wave brightness sets the level afterwards.
import sys, json
import numpy as np

MEAS = [('face_level_median', 'wave.face_level_median', 1.0),
        ('face_level_p90', 'wave.face_level_p90', 0.5),
        ('fold_over_face_median', 'wave.fold_over_face_median', 0.5),
        ('partings_per_column', 'wave.partings_per_column', 1.0),
        ('peaks12_mean', 'wave.peaks12_mean', 1.0),
        ('peaks25_mean', 'wave.peaks25_mean', 0.5),
        ('line_width_median', 'wave.line_width_median', 1.0),
        ('brightest_line_width', 'wave.brightest_line_width', 1.0),
        ('sheen_width_median', 'wave.sheen_width_median', 1.0),
        ('line_peak_over_band_median', 'wave.line_peak_over_band_median', 1.0),
        ('edge_rise_median', 'wave.edge_rise_median', 0.5),
        ('fill_above_40pct', 'wave.fill_above_40pct', 1.0),
        ('fill_mean_over_max', 'wave.fill_mean_over_max', 1.0),
        ('fill_dark_below_8pct', 'wave.fill_dark_below_8pct', 0.5)]
MOODS = ('night', 'dawn', 'day', 'dusk')


def ranges(metrics):
    M = json.load(open(metrics))['measures']
    out = {}
    for m in M:
        o = m.get('original') or {}
        lo, hi = o.get('lo'), o.get('hi')
        if lo is None or hi is None or not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo: continue
        out[m['name']] = hi - lo
    return out


def score(R, F, B):
    zs, rows = [], []
    for name, mid, w in MEAS:
        rg = R.get(mid)
        if rg is None: continue
        for mood in MOODS:
            f, b = F.get(mood, {}).get(name), B.get(mood, {}).get(name)
            if f is None or b is None or not np.isfinite(f) or not np.isfinite(b): continue
            # a ratio measure with no upper bound is read in the log, so a build 300 times out does not swamp the sum
            if 'fold_over_face' in name:
                z = np.log(max(b, 1e-6) / max(f, 1e-6)) / np.log(1 + rg / max(f, 1e-6))
            else:
                z = (b - f) / rg
            zs.append(w * z * z); rows.append((name, mood, f, b, z))
    return float(np.sqrt(np.mean(zs))), rows


if __name__ == '__main__':
    metrics, footage = sys.argv[1], sys.argv[2]
    R, F = ranges(metrics), json.load(open(footage))
    best = []
    for p in sys.argv[3:]:
        s, rows = score(R, F, json.load(open(p)))
        best.append((s, p, rows))
    for s, p, _ in sorted(best):
        print('%-34s %.4f' % (p.split('/')[-1][:-5], s))
    if len(best) == 1:
        print()
        print('%-28s %-6s %10s %10s %8s' % ('measure', 'mood', 'footage', 'build', 'z'))
        for name, mood, f, b, z in best[0][2]:
            print('%-28s %-6s %10.3f %10.3f %8.2f' % (name, mood, f, b, z))
