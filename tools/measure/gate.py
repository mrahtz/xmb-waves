"""The merge gate's own test and the lane counts, from two battery runs at three seeds each.

usage: python3 gate.py BEFORE_DIR AFTER_DIR
Each DIR holds seed1/, seed2/, seed3/ with metrics.json. Prints, per lane, how many measures lie inside the
original's (or the noise clips') range at every seed before and after, and the measures that move away from the
original by the largest fraction of that measure's own range - which is the merge gate's test.
"""
import sys, os, json
import numpy as np

SEEDS = ('seed1', 'seed2', 'seed3')


def load(d):
    out = {}
    for s in SEEDS:
        p = os.path.join(d, s, 'metrics.json')
        M = json.load(open(p))['measures']
        out[s] = {m['name']: m for m in M}
    return out


def rng(m):
    o, n = m.get('original') or {}, m.get('noise') or {}
    lo = min([v for v in (o.get('lo'), n.get('lo')) if v is not None], default=None)
    hi = max([v for v in (o.get('hi'), n.get('hi')) if v is not None], default=None)
    return lo, hi


A, B = load(sys.argv[1]), load(sys.argv[2])
names = sorted(A[SEEDS[0]])
lanes = {}
for name in names:
    lane = A[SEEDS[0]][name]['lane']
    wa = all(A[s][name].get('within') for s in SEEDS)
    wb = all(B[s][name].get('within') for s in SEEDS)
    L = lanes.setdefault(lane, [0, 0, 0])
    L[0] += 1; L[1] += bool(wa); L[2] += bool(wb)
print('%-12s %6s %8s %8s' % ('lane', 'n', 'before', 'after'))
tot = [0, 0, 0]
for lane in ('motion', 'look', 'sparkles', 'background'):
    if lane not in lanes: continue
    n, a, b = lanes[lane]
    tot = [tot[i] + v for i, v in enumerate((n, a, b))]
    print('%-12s %6d %8d %8d' % (lane, n, a, b))
print('%-12s %6d %8d %8d' % ('all', *tot))
print()
print('the gate: moves away from the original, as a fraction of that measure\'s own range')
rows = []
for name in names:
    for s in SEEDS:
        a, b = A[s][name], B[s][name]
        oa = (a.get('original') or {}).get('median')
        ca, cb = (a.get('clean') or {}).get('median'), (b.get('clean') or {}).get('median')
        lo, hi = rng(a)
        if oa is None or ca is None or cb is None or lo is None or hi is None or hi <= lo: continue
        da, db = abs(ca - oa), abs(cb - oa)
        if db <= da: continue
        rows.append(((db - da) / (hi - lo), name, a['lane'], s, oa, ca, cb, hi - lo))
for f, name, lane, s, o, ca, cb, r in sorted(rows, reverse=True)[:14]:
    print('  %5.2f  %-36s %-10s %-5s original %10.4g  %10.4g -> %10.4g (range %.4g)' % (f, name, lane, s, o, ca, cb, r))
print()
print('crossings from inside the range to outside it')
for name in names:
    for s in SEEDS:
        if A[s][name].get('within') and not B[s][name].get('within'):
            a, b = A[s][name], B[s][name]
            lo, hi = rng(a)
            print('  %-36s %-10s %-5s original %10.4g  %10.4g -> %10.4g  range %.4g-%.4g'
                  % (name, a['lane'], s, (a.get('original') or {}).get('median'),
                     (a.get('clean') or {}).get('median'), (b.get('clean') or {}).get('median'), lo, hi))
print()
print('crossings from outside the range to inside it')
for name in names:
    for s in SEEDS:
        if not A[s][name].get('within') and B[s][name].get('within'):
            a, b = A[s][name], B[s][name]
            print('  %-36s %-10s %-5s original %10.4g  %10.4g -> %10.4g'
                  % (name, a['lane'], s, (a.get('original') or {}).get('median'),
                     (a.get('clean') or {}).get('median'), (b.get('clean') or {}).get('median')))
