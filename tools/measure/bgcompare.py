# usage: python3 -I bgcompare.py DIR -> the background's colour in four regions (top left, top right, bottom left, bottom
# right: rows 4-22 % and 80-96 %, columns 5-40 % and 60-95 %, medians), DIR/DATE-HHMM.png beside the original's
# recordings at the same console date and time (comparison/original frames at 1, 5 and 9 s, averaged).
import sys, os, glob, numpy as np
from PIL import Image
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'work', 'orig', 'raw')
def regions(path):
    a = np.asarray(Image.open(path).convert('RGB').resize((480, 270)), dtype=float); H, W = a.shape[:2]
    rows = [(int(.04 * H), int(.22 * H)), (int(.80 * H), int(.96 * H))]; cols = [(int(.05 * W), int(.40 * W)), (int(.60 * W), int(.95 * W))]
    return np.array([[np.median(a[r0:r1, c0:c1].reshape(-1, 3), axis=0) for (c0, c1) in cols] for (r0, r1) in rows])
d = sys.argv[1]; tot = []
print('date-time        region   original (R G B)      mine (R G B)       difference')
for f in sorted(glob.glob(os.path.join(d, '2026-*.png'))):
    k = os.path.basename(f)[:-4]; refs = sorted(glob.glob(os.path.join(R, k + '_[159].png')))
    if not refs: continue
    o = np.mean([regions(p) for p in refs], axis=0); m = regions(f)
    for i, rn in enumerate(['top', 'bottom']):
        for j, cn in enumerate(['left', 'right']):
            df = m[i, j] - o[i, j]; tot.append(np.abs(df).mean())
            print('%s  %-6s %-5s %5.0f %5.0f %5.0f    %5.0f %5.0f %5.0f    %+5.0f %+5.0f %+5.0f' % (k, rn, cn, *o[i, j], *m[i, j], *df))
print('mean absolute difference per channel: %.1f levels' % np.mean(tot))
