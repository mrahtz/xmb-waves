# A scan of one global level on the painted images: every month's day and night grid scaled by the same factor, scored
# on the measured index's conditions alone, in both of the ways the battery scores the background - the mean absolute
# difference per channel and the signed mean difference per region, which is the measure a build can be wrong on while
# its absolute error is small, by being too bright at some hours and too dark at others.
#
# usage: python bgfit/levelscan.py PAGE [FIT.json] [--scales 0.99,1.0,1.01] [--all]
import json, subprocess, numpy as np, os, sys
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit')
argv = sys.argv[1:]; scales = [0.985, 0.99, 0.995, 1.0]; allc = False
if '--scales' in argv:
    i = argv.index('--scales'); scales = [float(x) for x in argv[i + 1].split(',')]; del argv[i:i + 2]
if '--all' in argv: allc = True; argv.remove('--all')
meta = json.load(open(os.path.join(D, 'meta.json')))
MEASURED = set()
for c in json.load(open(os.path.join('C:' + os.sep, 'xmb-share', 'footage', 'INDEX.json')))['clips']:
    if c['kind'] != 'noise': MEASURED.add(c['date'] + 'T' + c['time'])
CONDS = list(range(len(meta))) if allc else [j for j, c in enumerate(meta) if c['time'] in MEASURED]
p = json.load(open(argv[1]))['p'] if len(argv) > 1 else {}
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), argv[0]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
DEF = json.loads(w.stdout.readline())['def']
PAL = {str(m): {k: list(v) for k, v in P.items()} for m, P in enumerate(DEF['PAL'])}
for m, P in p.get('PAL', {}).items():
    for k, v in P.items(): PAL[str(m)][k] = list(v)
print('%7s %9s %9s' % ('scale', 'absmean', 'bias'))
for s in scales:
    q = dict(p); q['PAL'] = {m: {k: [v * s for v in g] for k, g in P.items()} for m, P in PAL.items()}
    q['conds'] = CONDS
    w.stdin.write(json.dumps({'id': 0, 'p': q}) + '\n'); w.stdin.flush()
    r = json.loads(w.stdout.readline())
    print('%7.4f %9.3f %+9.3f' % (s, float(np.mean(r['err'])), float(np.mean(r['regs']))))
w.stdin.write('{"quit":1}\n'); w.stdin.flush()
