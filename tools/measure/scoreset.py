# The background lane's scored set as one footage index: the measured index, plus the conditions named in
# scoreset.json resolved against the index of the clips made on request.
#
# usage: python scoreset.py [--out FILE] [--set scoreset.json] [--index INDEX.json] [--requested INDEX.json]
#                           [--groups shoulder,month,...] [--quiet]
#
# The measured index (C:\xmb-share\footage\INDEX.json) is the set every lane is scored on and changes only
# between rounds; it is copied through unchanged, noise clips included. scoreset.json names the extra
# conditions this lane wants and the form they must be in; each is matched exactly (kind, date, time, time
# since the start, length, size, seed, colour, frame rate) against the requested index, so the set is the
# same whatever else any job has asked for. A condition with no clip is reported and left out.
#
# The output is a footage index in the same format, for
#   python battery.py --lanes background --index work/scoreset/INDEX.json
#   python bgfit/prep.py CACHE --index work/scoreset/INDEX.json
import json, os, sys, argparse

H = os.path.dirname(os.path.abspath(__file__))
FIELDS = ('kind', 'date', 'time', 'since_start_s', 'seconds', 'size', 'seed', 'colour', 'fps')


def key(c):
    return (c['kind'], c['date'], c['time'], float(c['since_start_s']), float(c['seconds']), c['size'],
            None if c.get('seed') is None else int(c['seed']), int(c.get('colour', 0)), float(c.get('fps', 60)))


def wanted(spec, groups=None):
    """the conditions scoreset.json names, as clip dicts without a path. An entry may carry a "form" of its own, whose
    keys override the set's; some conditions were asked for by earlier rounds in a slightly different form (6 s rather
    than 10 s, say) and are taken as they are rather than asked for again."""
    out = []
    for e in spec['extra']:
        if groups is not None and e.get('group') not in groups: continue
        for t in e['times']:
            c = dict(spec['form']); c.update(e.get('form', {})); c.update(date=e['date'], time=t, group=e.get('group'))
            out.append(c)
    return out


def build(setfile=None, index=None, requested=None, groups=None, say=print):
    spec = json.load(open(setfile or os.path.join(H, 'scoreset.json')))
    idx = json.load(open(index or r'C:\xmb-share\footage\INDEX.json'))['clips']
    req = json.load(open(requested or r'C:\xmb-share\footage\requested\INDEX.json'))['clips']
    have = {}
    for c in req: have.setdefault(key(c), c)       # the first clip of a condition; they are the same render
    seen = set(key(c) for c in idx)
    clips, missing, groups_of = list(idx), [], {}
    for w in wanted(spec, groups):
        k = key(w)
        if k in seen:
            groups_of.setdefault(w['group'], []).append(k); continue      # already in the measured index
        if k not in have: missing.append(w); continue
        c = dict(have[k]); c['scoreset_group'] = w['group']
        clips.append(c); seen.add(k); groups_of.setdefault(w['group'], []).append(k)
    for w in missing:
        say('MISSING %s %s %s (%s)' % (w['kind'], w['date'], w['time'], w['group']))
    return {'clips': clips}, missing, groups_of


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(H, 'work', 'scoreset', 'INDEX.json'))
    ap.add_argument('--set', dest='setfile')
    ap.add_argument('--index')
    ap.add_argument('--requested')
    ap.add_argument('--groups', help='only these groups of scoreset.json (comma-separated)')
    ap.add_argument('--requests', nargs=2, metavar=('DIR', 'JOBID'),
                    help='write one footage request per missing condition into DIR as JOBID-<n>.json')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    groups = set(a.groups.split(',')) if a.groups else None
    out, missing, got = build(a.setfile, a.index, a.requested, groups)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w', newline='\n') as f: json.dump(out, f, indent=1)
    kinds = {}
    for c in out['clips']: kinds[c['kind']] = kinds.get(c['kind'], 0) + 1
    conds = sorted({(c['date'], c['time'], c['since_start_s'], c['seconds']) for c in out['clips'] if c['kind'] != 'noise'})
    if not a.quiet:
        print('%s: %d clips (%s), %d conditions outside the noise clips' %
              (a.out, len(out['clips']), ', '.join('%d %s' % (v, k) for k, v in sorted(kinds.items())), len(conds)))
        for g, ks in sorted(got.items()): print('  %-14s %d conditions' % (g, len(ks)))
        if missing: print('  %d conditions have no clip yet' % len(missing))
    if a.requests and missing:
        d, job = a.requests
        for i, w in enumerate(missing, 1):
            r = {k: w[k] for k in ('kind', 'date', 'time', 'since_start_s', 'seed', 'seconds', 'size', 'aspect', 'colour') if k in w}
            p = os.path.join(d, '%s-%d.json' % (job, i))
            with open(p, 'w', newline='\n') as f: json.dump(r, f)
            print('wrote %s  %s %s' % (p, w['date'], w['time']))
    sys.exit(1 if missing else 0)
