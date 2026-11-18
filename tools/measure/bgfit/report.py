# The background's error over the fit's own condition set, reported month by month, hour by hour and by the day of the
# month (spec 33: report how close a build is month by month rather than only over the set as a whole; spec 34: the days
# that show one month alone say what the mid-month mixes cannot).
#
# usage: python bgfit/report.py PAGE [FIT.json] [--json OUT.json]
#
# The number is the one the fit itself minimises: the mean absolute difference in levels per channel between the build's
# background (rendered at 240 x 135 through bgworker.js, score mode, layers=bg) and the footage's background estimate at
# the same condition, over the pixels where no clip of that condition shows the wave.
import sys, json, subprocess, os, collections, numpy as np
D = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[1:]; out = None
if '--json' in argv:
    i = argv.index('--json'); out = argv[i + 1]; del argv[i:i + 2]
PAGE = argv[0]; FIT = argv[1] if len(argv) > 1 else None
META = json.load(open(os.path.join(D, '..', 'work', 'bgfit', 'meta.json')))
p = {}
if FIT: p = json.load(open(FIT))['p']
w = subprocess.Popen(['node', os.path.join(D, 'bgworker.js'), PAGE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
w.stdout.readline()
w.stdin.write(json.dumps({'id': 0, 'p': p}) + '\n'); w.stdin.flush()
err = json.loads(w.stdout.readline())['err']
w.stdin.write('{"quit":1}\n'); w.stdin.flush()
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
rows = [dict(time=c['time'], err=e) for c, e in zip(META, err)]
def group(key):
    g = collections.defaultdict(list)
    for r in rows: g[key(r)].append(r['err'])
    return [(k, float(np.mean(v)), len(v)) for k, v in sorted(g.items())]
print('%-20s %7s %5s' % ('all conditions', '%.3f' % float(np.mean(err)), len(err)))
print('\nby month')
for k, v, n in group(lambda r: int(r['time'][5:7])): print('  %-12s %7.3f %4d' % (MONTHS[k - 1], v, n))
print('\nby hour')
for k, v, n in group(lambda r: r['time'][11:16]): print('  %-12s %7.3f %4d' % (k, v, n))
print('\nby the day of the month')
for k, v, n in group(lambda r: 'the 4th or earlier (one month alone)' if int(r['time'][8:10]) <= 4 else
                     'the 5th to the 25th (two months mixed)' if int(r['time'][8:10]) <= 25 else 'the 26th or later'):
    print('  %-40s %7.3f %4d' % (k, v, n))
print('\nworst twenty conditions')
for r in sorted(rows, key=lambda r: -r['err'])[:20]: print('  %-20s %7.3f' % (r['time'], r['err']))
if out: json.dump({'mean': float(np.mean(err)), 'per': rows}, open(out, 'w'), indent=1)
