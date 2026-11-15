# usage: python unseen.py FIT.json OUT.json (FIT.json made against the page as it was before the fit was applied)
# months the footage never shows (3, 6, 9, 12): their starting colours moved by the fitted months' mean change of value and
# saturation (geometric mean of the ratios, per key), hue kept
import json, sys, colorsys, subprocess, numpy as np
R = json.load(open(sys.argv[1])); P = R['p']['PAL']
import os
H = os.path.dirname(os.path.abspath(__file__))
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), os.path.join(H, '..', '..', '..', 'index.html')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
DEF = json.loads(w.stdout.readline())['def']['PAL']; w.stdin.write('{"quit":1}\n'); w.stdin.flush()
col = lambda P, k: P[k][0] if k == 'night' else P[k]
ratio = {}
for k in ('top', 'bottom', 'night'):
    rv, rs = [], []
    for mo in (0, 1, 3, 4, 6, 7, 9, 10):
        _, s1, v1 = colorsys.rgb_to_hsv(*col(P[str(mo)], k)); _, s0, v0 = colorsys.rgb_to_hsv(*col(DEF[mo], k))
        rv.append(np.log(max(v1, 1e-3) / v0))
        if mo != 0 and s0 > 0.1: rs.append(np.log(max(s1, 1e-3) / s0))
    ratio[k] = (float(np.exp(np.mean(rv))), float(np.exp(np.mean(rs))))
    print(k, 'value x%.2f saturation x%.2f' % ratio[k])
for mo in (2, 5, 8, 11):
    Q = json.loads(json.dumps(DEF[mo]))
    for k in ('top', 'mid', 'bottom', 'night'):
        if k not in Q: continue
        rk = ratio['top' if k == 'mid' else k] if k != 'mid' else tuple(np.sqrt(np.array(ratio['top']) * np.array(ratio['bottom'])))
        h, s, v = colorsys.rgb_to_hsv(*col(Q, k)); c = list(colorsys.hsv_to_rgb(h, min(1, s * rk[1]), min(1, v * rk[0])))
        if k == 'night': Q['night'][0] = c
        else: Q[k] = c
    P[str(mo)] = Q
json.dump(R, open(sys.argv[2], 'w'), indent=1)
