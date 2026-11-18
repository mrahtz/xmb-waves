# bandlevelset.py: bandlevel.py (spec 4.5, version 31) over the footage index's conditions, by mood, in parallel.
# usage:
#   python3 bandlevelset.py footage OUT.json [--moods night,dawn,day,dusk] [--procs 4]
#   python3 bandlevelset.py build PAGE OUT.json [--seed 1] [--moods ...] [--procs 4] [--noise 0]
#   python3 bandlevelset.py table OUT1.json OUT2.json ...        (the per-mood means side by side)
# The conditions are the index's clips at the four mood holds (00:00 night, 06:00 dawn, 12:00 day, 18:00 dusk): the
# recordings and the lossless renders at 40 s (and the day's one pair at 240 s), and the noise clips of that hour.
# 21:30 is left out: the mood there is a blend of dusk and night, and this is a per-mood measurement (version 31).
# A build is rendered at the clip's own date, time, colour, size and seed, at simulation frame 60 * since_start_s +
# 60 * t for the same sample times t as the footage, through score mode on the GPU (battery_render.js). Footage and
# renders then go through identical measurement (bandlevel.moment).
# This measure is a per-mood target against footage of that mood and is never compared between moods (version 31); the
# 'add' column, the band's added light in the output's own levels, is the one that is comparable between moods.
import sys, os, json, subprocess
from concurrent.futures import ThreadPoolExecutor
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bandlevel import moment, vframes

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.environ.get('FOOTAGE_INDEX', r'C:\xmb-share\footage\INDEX.json')
MOOD_AT = {'00:00:00': 'night', '06:00:00': 'dawn', '12:00:00': 'day', '18:00:00': 'dusk'}
TIMES = [1, 3, 5, 7, 9]

def opt(a, k, d): return a[a.index(k) + 1] if k in a else d

def clips(moods, noise=True):
    out = []
    for c in json.load(open(INDEX))['clips']:
        m = MOOD_AT.get(c['time'])
        if m is None or m not in moods: continue
        if not noise and c['kind'] == 'noise': continue
        out.append((m, c))
    return out

def cid(c):
    return '%s_%s_%s_t%d_s%s' % (c['kind'], c['date'], c['time'][:5].replace(':', ''), c['since_start_s'], c.get('seed'))

def measure_footage(c):
    return [moment(f) for f in vframes(c['path'], TIMES)]

def measure_build(page, c, seed):
    w, h = (int(x) for x in c['size'].split('x'))
    o = {'time': c['date'] + 'T' + c['time'], 'seed': c.get('seed') or seed, 'w': w, 'h': h, 'theme': c['colour']}
    frames = [60 * c['since_start_s'] + int(round(60 * t)) for t in TIMES]
    r = subprocess.run(['node', os.path.join(HERE, 'battery_render.js'), page, json.dumps(o), ','.join(map(str, frames))],
                       capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr.decode()[-800:])
    a = np.frombuffer(r.stdout, np.uint8)
    n = w * h * 3
    return [moment(a[i * n:(i + 1) * n].reshape(h, w, 3)) for i in range(len(frames))]

def main():
    a = sys.argv[1:]
    if a[0] == 'table':
        cols = [(os.path.basename(p), json.load(open(p))) for p in a[1:]]
        print('%-10s %-6s' % ('mood', 'what') + ''.join('%12s' % n[-12:] for n, _ in cols))
        for m in ('night', 'dawn', 'day', 'dusk'):
            for k in ('col', 'mean', 'add', 'bg', 'clip'):
                row = ''
                for _, J in cols:
                    v = [r[k] for cl, r in J['clips'].items() if J['mood'][cl] == m]
                    row += '%12.3f' % np.mean(v) if v else '%12s' % '-'
                print('%-10s %-6s' % (m, k) + row)
        return
    if a[0] == 'compare':  # a build against footage, condition by condition (so that the background's own level cancels)
        F, B = json.load(open(a[1])), json.load(open(a[2]))
        print('%-6s %4s %14s %14s %14s' % ('mood', 'n', 'build/footage', 'col build', 'col footage'))
        for m in ('night', 'dawn', 'day', 'dusk'):
            rs, bs, fs = [], [], []
            for i, mm in F['mood'].items():
                if mm != m: continue
                j = i if i in B['clips'] else next((k for k in B['clips'] if k.split('_', 1)[1] == i.split('_', 1)[1]), None)
                if j is None: continue
                rs.append(B['clips'][j]['col'] / F['clips'][i]['col']); bs.append(B['clips'][j]['col']); fs.append(F['clips'][i]['col'])
            if not rs: continue
            print('%-6s %4d %8.3f +- %.3f %14.2f %14.2f'
                  % (m, len(rs), np.median(rs), np.std(rs, ddof=1) / np.sqrt(len(rs)), np.mean(bs), np.mean(fs)))
        return
    kind = a[0]
    moods = opt(a, '--moods', 'night,dawn,day,dusk').split(',')
    procs = int(opt(a, '--procs', 4))
    noise = opt(a, '--noise', '1') != '0'
    if kind == 'footage': outf = a[1]
    else: page, outf = a[1], a[2]
    seed = int(opt(a, '--seed', 1))
    cs = clips(moods, noise)
    if kind == 'build':  # one render per condition: the recording and the render of a condition are the same condition
        seen, uniq = set(), []
        for m, c in cs:
            k = (c['date'], c['time'], c['since_start_s'], c.get('seed') or seed, c['colour'], c['size'])
            if k in seen: continue
            seen.add(k); uniq.append((m, c))
        cs = uniq
    def run(mc):
        m, c = mc
        rows = measure_footage(c) if kind == 'footage' else measure_build(page, c, seed)
        agg = {k: float(np.mean([r[k] for r in rows])) for k in rows[0]}
        agg['n'] = len(rows); agg['per_frame'] = rows
        return m, cid(c), agg
    out = {'mood': {}, 'clips': {}}
    with ThreadPoolExecutor(procs) as ex:
        for m, i, agg in ex.map(run, cs):
            out['mood'][i] = m; out['clips'][i] = agg
            print('%-6s %-44s col %8.2f  mean %6.3f  add %8.1f  bg %6.2f  clip %.5f' %
                  (m, i, agg['col'], agg['mean'], agg['add'], agg['bg'], agg['clip']), flush=True)
    json.dump(out, open(outf, 'w'))
    print()
    for m in ('night', 'dawn', 'day', 'dusk'):
        v = {k: [r[k] for cl, r in out['clips'].items() if out['mood'][cl] == m] for k in ('col', 'mean', 'add', 'clip')}
        if not v['col']: continue
        print('%-6s n %2d  col %8.2f +- %6.2f   mean %6.3f   add %8.1f +- %6.1f   clip %.5f'
              % (m, len(v['col']), np.mean(v['col']), np.std(v['col'], ddof=1) / np.sqrt(len(v['col'])),
                 np.mean(v['mean']), np.mean(v['add']), np.std(v['add'], ddof=1) / np.sqrt(len(v['add'])), np.mean(v['clip'])))

if __name__ == '__main__':
    main()
