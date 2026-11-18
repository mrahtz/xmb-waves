# Merge the month palettes of several fit results into one (fit.py's OUT.json format).
# usage: python merge.py BASE.json OUT.json  MONTHS=FIT.json [MONTHS=FIT.json ...]
#   BASE.json   the result the runs started from, or '-' for the page's own values as the first fit saw them
#   MONTHS      comma-separated month indexes (0 = January) to take from that run's 'p'
# Blocks whose months and whose conditions are disjoint can be fitted separately and merged exactly: a month's
# palette only enters the conditions that show it.
import json, sys

base, out, rest = sys.argv[1], sys.argv[2], sys.argv[3:]
R = None
if base != '-':
    R = json.load(open(base))
for spec in rest:
    months, path = spec.split('=')
    F = json.load(open(path))
    if R is None: R = {'loss': None, 'conds': [], 'err': [], 'p': json.loads(json.dumps(F['p']))}
    for mo in months.split(','):
        R['p']['PAL'][str(int(mo))] = json.loads(json.dumps(F['p']['PAL'][str(int(mo))]))
R['merged_from'] = rest
R['loss'] = None; R['err'] = []
json.dump(R, open(out, 'w'), indent=1)
print('wrote %s from %s' % (out, ', '.join(rest)))
