# usage: python3 clipsummary.py [DIR]  -> motion statistics of the original's 10 s clips (spec46m.py and motion2.py outputs
# in DIR/<date-time>/, default work/orig/mclips), pooled by time of day: median and range over the months, and all clips.
import os, re, sys, glob, json, numpy as np
D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work', 'orig', 'mclips')
NUM = r'[-+]?\d+\.?\d*'
def s46m(path):
    t = open(path).read()
    def g(pat):  # the numbers after the last colon before the 'spec:' note
        m = re.search(pat + r'[^\n]*', t)
        return [float(x) for x in re.findall(NUM, m.group(0).split('spec:')[0].rsplit(':', 1)[1])] if m else None
    out = {}
    v = g('centre vertical speed'); out['cspeed'] = v[0] if v else np.nan
    v = g('swell shift'); out['shift'] = v[0] if v else np.nan
    v = g('picture correlation'); out['corr1'] = v[0] if v else np.nan
    v = g('partings alive'); out['pspeed'] = v[0] if v else np.nan; out['pright'] = v[1] if v else np.nan
    v = g('adjacent peaks'); out['adjdiff'] = v[0] if v else np.nan
    return out
rows = {}
for d in sorted(glob.glob(os.path.join(D, '2026-*'))):
    k = os.path.basename(d); r = {}
    if os.path.exists(d + '/spec46m.txt'):
        try: r.update(s46m(d + '/spec46m.txt'))
        except Exception: pass
    if os.path.exists(d + '/motion2.json'): r.update(json.load(open(d + '/motion2.json')))
    rows[k] = r
keys = ['cspeed', 'shift', 'corr1', 'adjdiff', 'pspeed', 'pright', 'flow_med', 'flow_p90', 'flow_vx_med', 'flow_vy_med', 'flow_tex_share', 'flow_tex_vx_med', 'flow_tex_vy_med', 'flow_left', 'flow_right', 'spec_lo', 'spec_mid', 'spec_hi', 'spec_centroid', 'kymo_vy_med', 'kymo_vx_med', 'kymo_right']
groups = {'00:00': '0000', '06:00': '0600', '12:00': '1200', '18:00': '1800', 'all': ''}
print('%-14s' % 'statistic' + ''.join('%-22s' % g for g in groups))
for key in keys:
    line = '%-14s' % key
    for g, suf in groups.items():
        v = np.array([r.get(key, np.nan) for k, r in rows.items() if k.endswith(suf) or suf == ''], dtype=float); v = v[~np.isnan(v)]
        line += '%-22s' % ('%.3g [%.3g-%.3g] n%d' % (np.median(v), v.min(), v.max(), len(v)) if len(v) else '-')
    print(line)
