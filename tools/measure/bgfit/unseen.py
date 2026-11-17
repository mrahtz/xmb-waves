# usage: python unseen.py FIT.json OUT.json (FIT.json made against the page as it was before the fit was applied)
# months the footage never shows (3, 6, 9, 12): their starting images moved by the fitted months' mean change of value and
# saturation (geometric mean of the ratios, per grid row and per image), hue kept
import json, sys, colorsys, subprocess, os, numpy as np
R = json.load(open(sys.argv[1])); P = R['p']['PAL']
H = os.path.dirname(os.path.abspath(__file__))
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), os.path.join(H, '..', '..', '..', 'index.html')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
D = json.loads(w.stdout.readline())['def']; DEF = D['PAL']; GW, GH, NGH = D['grid']
w.stdin.write('{"quit":1}\n'); w.stdin.flush()
FIT = (0, 1, 3, 4, 6, 7, 9, 10)
def hsv(G, j):   # the row's mean colour in hue, saturation and value
    c = [sum(G[(j * GW + i) * 3 + k] for i in range(GW)) / GW for k in range(3)]
    return colorsys.rgb_to_hsv(*c)
ratio = {}
for key, nr in (('day', GH), ('night', NGH)):
    for j in range(nr):
        rv, rs = [], []
        for mo in FIT:
            _, s1, v1 = hsv(P[str(mo)][key], j); _, s0, v0 = hsv(DEF[mo][key], j)
            if v0 < 0.02: continue
            rv.append(np.log(max(v1, 1e-3) / v0))
            if mo != 0 and s0 > 0.1: rs.append(np.log(max(s1, 1e-3) / s0))
        ratio[(key, j)] = (float(np.exp(np.mean(rv))) if rv else 1.0, float(np.exp(np.mean(rs))) if rs else 1.0)
        print(key, 'row', j, 'value x%.2f saturation x%.2f' % ratio[(key, j)])
for mo in (2, 5, 8, 11):
    Q = json.loads(json.dumps(DEF[mo]))
    for key, nr in (('day', GH), ('night', NGH)):
        rv, rs = ratio[(key, 0)], None
        for j in range(nr):
            rv, rs = ratio[(key, j)]
            for i in range(GW):
                o = (j * GW + i) * 3
                h, s, v = colorsys.rgb_to_hsv(*Q[key][o:o + 3])
                Q[key][o:o + 3] = list(colorsys.hsv_to_rgb(h, min(1, s * rs), min(1.5, v * rv)))
    P[str(mo)] = Q
json.dump(R, open(sys.argv[2], 'w'), indent=1)
