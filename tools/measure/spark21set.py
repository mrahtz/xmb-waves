# spark21set.py: spark21.py over a fixed set of conditions (the lossless reference renders of the footage index), in parallel.
# usage:
#   python3 spark21set.py footage OUTDIR [--frames 60] [--at 120] [--procs 8]
#   python3 spark21set.py build PAGE OUTDIR [--seed 1] [--frames 60] [--at 120] [--procs 8] [--layers L]
#   --noise          the index's noise clips (a build: at each clip's own seed and time since start)
#   --only ID1,ID2   only the conditions whose id (date_hhmm) contains one of these
#   python3 spark21set.py table DIR1 DIR2 ...      (mean over the conditions of each measure, side by side)
#   --tool spark25.py  run that tool on each condition instead of spark21.py (the same command line)
# The conditions are the index's 'render' clips of 10 s (16 of them: four months at 00:00, 06:00, 12:00 and 18:00). Each is
# measured over FRAMES consecutive frames (60 fps) starting AT frames into the clip; a build is rendered at simulation frame
# 60 * since_start_s + AT with the clip's date, time and colour.
import sys, os, json, subprocess
from concurrent.futures import ThreadPoolExecutor
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = r'C:\xmb-share\footage\INDEX.json'

NOISE = False
def conditions():
    cl = json.load(open(INDEX))['clips']
    if NOISE: return [c for c in cl if c['kind'] == 'noise']
    return [c for c in cl if c['kind'] == 'render' and c['seconds'] == 10]

def cid(c):
    s = c['date'] + '_' + c['time'][:5].replace(':', '')
    return s + '_s%d_t%d' % (c['seed'], c['since_start_s']) if NOISE else s

def opt(a, k, d):
    return a[a.index(k) + 1] if k in a else d

def main():
    a = sys.argv[1:]
    if a[0] == 'table':
        cols = []
        for d in a[1:]:
            Js = [json.load(open(os.path.join(d, f))) for f in sorted(os.listdir(d)) if f.endswith('.json')]
            cols.append((d.rstrip('/\\')[-14:], Js))
        keys = [k for k in cols[0][1][0] if not isinstance(cols[0][1][0][k], dict)]
        print('%-18s' % ('n=' + ','.join(str(len(J)) for _, J in cols)) + ''.join('%15s' % n for n, _ in cols))
        for k in keys:
            row = []
            for _, Js in cols:
                v = [J[k] for J in Js if isinstance(J.get(k), (int, float)) and np.isfinite(J[k])]
                row.append('%15.3f' % np.mean(v) if v else '%15s' % '-')
            print('%-18s' % k + ''.join(row))
        for n, Js in cols:
            for hk in ('hue_hist', 'nc_hue_hist'):
                H = [J[hk] for J in Js if hk in J]
                if H: print('%-14s' % n, hk, ' '.join('%s:%.2f' % (b, np.mean([h.get(b, 0) for h in H])) for b in H[0]))
        return
    kind = a[0]
    if '--noise' in a:   # the index's noise clips instead (two conditions, several seeds and times since start each)
        global NOISE; NOISE = True
    global TOOL; TOOL = opt(a, '--tool', 'spark21.py')
    frames = int(opt(a, '--frames', 60)); at = int(opt(a, '--at', 120)); procs = int(opt(a, '--procs', 8))
    if kind == 'footage': out = a[1]
    else: page, out = a[1], a[2]; seed = int(opt(a, '--seed', 1)); layers = opt(a, '--layers', None)
    os.makedirs(out, exist_ok=True)
    jobs = []
    only = opt(a, '--only', None)
    for c in conditions():
        if only and not any(o in cid(c) for o in only.split(',')): continue
        js = os.path.join(out, cid(c) + '.json')
        if os.path.exists(js): continue
        if kind == 'footage':
            cmd = [sys.executable, os.path.join(HERE, TOOL), 'footage', c['path'], str(at), str(frames), '--json', js]
        else:
            w, h = c['size'].split('x')
            o = {'time': c['date'] + 'T' + c['time'], 'seed': c['seed'] if NOISE else seed, 'w': int(w), 'h': int(h), 'theme': c['colour']}
            if layers: o['layers'] = layers
            cmd = [sys.executable, os.path.join(HERE, TOOL), 'build', page, json.dumps(o),
                   str(60 * c['since_start_s'] + at), str(frames), '--json', js]
        jobs.append(cmd)
    with ThreadPoolExecutor(procs) as ex:
        for r in ex.map(lambda cmd: subprocess.run(cmd, capture_output=True, text=True), jobs):
            if r.returncode: print(r.stderr[-800:])
            else: print(r.stdout.strip().splitlines()[-1])

if __name__ == '__main__':
    main()
