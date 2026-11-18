# The background's pixel error by condition, by month and by hour, from one or two battery runs.
#
# usage: python bgtable.py RUN/bgpixel.json [BEFORE/bgpixel.json] [--region all] [--json OUT.json]
#
# The number is the battery's own `bgpixel.<region>.{R,G,B}_absmean`: the mean absolute difference per channel
# between the build's render and the footage of the same condition, over the background pixels neither side
# masks (480 x 270, the temporal median of the 1 fps frames). A clip's figure is the mean over R, G and B.
# Where a condition has more than one clip (a recording and a render of the same moment) their figures are
# averaged. With a second file the two runs are shown side by side with the change.
import json, sys, os, argparse, collections

MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']


def read(path, region='all'):
    J = json.load(open(path))['clean_vs_footage']
    per = collections.defaultdict(list)
    for cid, e in J.items():
        p = cid.split('_')                       # kind_date_HHMMSS_t..._...s_c..._WxH[_s..]
        date, hhmmss, since = p[1], p[2], p[3]
        v = sum(e[region][ch]['absmean'] for ch in 'RGB') / 3.0
        per[(date, hhmmss[:2] + ':' + hhmmss[2:4], since)].append(v)
    return {k: sum(v) / len(v) for k, v in per.items()}, {k: len(v) for k, v in per.items()}


def table(A, B=None, out=None):
    keys = sorted(A)
    w = '%-11s %-6s %-5s %7s' % ('date', 'hour', 'since', 'levels')
    print(w + ('%9s %8s' % ('before', 'change') if B else ''))
    for k in keys:
        line = '%-11s %-6s %-5s %7.3f' % (k[0], k[1], k[2], A[k])
        if B: line += ('%9.3f %+8.3f' % (B[k], A[k] - B[k])) if k in B else '%9s %8s' % ('-', '-')
        print(line)
    def group(f, label):
        print('\n%-11s %7s %5s' % (label, 'levels', 'n') + ('%9s %8s' % ('before', 'change') if B else ''))
        G = collections.defaultdict(list); H = collections.defaultdict(list)
        for k in keys:
            G[f(k)].append(A[k])
            if B and k in B: H[f(k)].append(B[k])
        for g in sorted(G):
            line = '%-11s %7.3f %5d' % (g, sum(G[g]) / len(G[g]), len(G[g]))
            if B and H.get(g): line += '%9.3f %+8.3f' % (sum(H[g]) / len(H[g]), sum(G[g]) / len(G[g]) - sum(H[g]) / len(H[g]))
            print(line)
        return {g: sum(v) / len(v) for g, v in G.items()}
    bym = group(lambda k: '%s %s' % (k[0][5:7], MONTHS[int(k[0][5:7]) - 1][:3]), 'month')
    byh = group(lambda k: k[1], 'hour')
    allv = sum(A[k] for k in keys) / len(keys)
    print('\nall %d conditions: %.3f levels per channel' % (len(keys), allv))
    if out:
        json.dump({'per_condition': {'%s %s t%s' % k: v for k, v in A.items()}, 'by_month': bym, 'by_hour': byh,
                   'all': allv}, open(out, 'w'), indent=1)
    return bym, byh, allv


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('run'); ap.add_argument('before', nargs='?')
    ap.add_argument('--region', default='all'); ap.add_argument('--json')
    a = ap.parse_args()
    A, _ = read(a.run, a.region)
    B = read(a.before, a.region)[0] if a.before else None
    table(A, B, a.json)
