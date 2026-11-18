# rampset.py: rampprof.py (spec 4.5, versions 20 and 27) over the footage index's conditions, footage and build, in
# parallel, so that the wave tint's ramp can be re-fitted after a change to the sheet or to the shading - which versions
# 28 and 36 both say makes this fit go stale.
# usage:
#   python3 rampset.py footage OUT.json [--procs 6]
#   python3 rampset.py build PAGE OUT.json [--seed 1] [--procs 4]
#   python3 rampset.py table OUT1.json [OUT2.json ...]
# The conditions are every recording and lossless render of the index (noise clips left out: they are the same conditions
# at other times since the start, and this fit pools conditions rather than moments). A build is rendered at each clip's
# own date, time, colour, size and seed, at the simulation frames the battery uses, and both sides go through exactly the
# same code (rampprof.profiles, then rampprof.fit on the pooled profile).
import sys, os, json, subprocess
from concurrent.futures import ThreadPoolExecutor
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rampprof
from bandcolour import vframes

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.environ.get('FOOTAGE_INDEX', r'C:\xmb-share\footage\INDEX.json')
TIMES = [1, 3, 5, 7, 9]
KINDS = ('sum', 'max', 'mean', 'rows')


def opt(a, k, d):
    return a[a.index(k) + 1] if k in a else d


def clips():
    return [c for c in json.load(open(INDEX))['clips'] if c['kind'] in ('recording', 'render')]


def cid(c):
    return '%s_%s_%s_t%d' % (c['kind'], c['date'], c['time'][:5].replace(':', ''), c['since_start_s'])


def render(page, c, seed):
    w, h = (int(x) for x in c['size'].split('x'))
    o = {'time': c['date'] + 'T' + c['time'], 'seed': c.get('seed') or seed, 'w': w, 'h': h, 'theme': c['colour']}
    frames = [60 * c['since_start_s'] + int(round(60 * t)) for t in TIMES]
    r = subprocess.run(['node', os.path.join(HERE, 'battery_render.js'), page, json.dumps(o), ','.join(map(str, frames))],
                       capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode()[-900:])
    a = np.frombuffer(r.stdout, np.uint8); n = w * h * 3
    return [a[i * n:(i + 1) * n].reshape(h, w, 3) for i in range(len(frames))]


def pooled(frames):
    P, n = {}, 0
    for f in frames:
        p = rampprof.profiles(f)
        for k in KINDS: P[k] = p[k] if k not in P else P[k] + p[k]
        n += 1
    return {k: (P[k] / n).tolist() for k in KINDS}, n


def main():
    a = sys.argv[1:]
    if a[0] == 'table':
        print('%-22s %-6s %10s %10s' % ('set', 'form', 'ramp', 's.e.'))
        for p in a[1:]:
            J = json.load(open(p))
            for k in KINDS:
                per = [rampprof.fit(np.array(v[k]))[0] for v in J['clips'].values()]
                tot = np.sum([np.array(v[k]) for v in J['clips'].values()], axis=0)
                r = rampprof.fit(tot)[0]
                se = float(np.std(per, ddof=1) / np.sqrt(len(per)))
                print('%-22s %-6s %+10.4f %10.4f' % (os.path.basename(p)[:-5], k, r, se))
            print()
        return
    procs = int(opt(a, '--procs', 4)); seed = int(opt(a, '--seed', 1))
    kind = a[0]
    outf = a[1] if kind == 'footage' else a[2]
    page = None if kind == 'footage' else a[1]

    def run(c):
        frames = list(vframes(c['path'], TIMES)) if kind == 'footage' else render(page, c, seed)
        P, n = pooled(frames)
        return cid(c), P, n
    out = {'clips': {}}
    with ThreadPoolExecutor(procs) as ex:
        for i, P, n in ex.map(run, clips()):
            out['clips'][i] = P
            print('%-40s n %d  ramp sum %+.4f  max %+.4f  mean %+.4f  rows %+.4f' %
                  (i, n, *[rampprof.fit(np.array(P[k]))[0] for k in KINDS]), flush=True)
    json.dump(out, open(outf, 'w'))


if __name__ == '__main__':
    main()
