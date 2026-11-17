# prints the background's picture statistics over the day for a fit result (or the page's defaults)
import sys, json, subprocess, os
D = os.path.dirname(os.path.abspath(__file__))
p = json.load(open(sys.argv[2]))['p'] if len(sys.argv) > 2 and sys.argv[2] != '-' else {}
p['curve'] = sys.argv[3] if len(sys.argv) > 3 else '2026-10-04'
w = subprocess.Popen(['node', os.path.join(D, 'bgworker.js'), sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline(); w.stdin.write(json.dumps({'id': 0, 'p': p}) + '\n{"quit":1}\n'); w.stdin.flush()
r = json.loads(w.stdout.readline())
print(' hour   all    top    bot  top/bot satLow satMax  asymR-L | night daylt shape env')
for c in r['curve']:
    print('%5.1f %6.3f %6.3f %6.3f %6.2f %6.2f %6.2f %7.3f | %5.2f %5.2f %5.2f %5.2f' % (c['h'], c['all'], c['top'], c['bot'], c['top'] / max(c['bot'], 1e-4), c['satLow'], c['satMax'], c['asym'], c['night'], c['day'], c['top_'], c['env']))
