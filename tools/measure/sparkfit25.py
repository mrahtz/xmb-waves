# sparkfit25.py: fits the lighting constants (diffuse, highlight, shininess, saturating gain, brightness, tilt-fade power)
# to the footage's count of points and whole distribution of peak levels, in the offline model of the sparkle shader that
# sparkmapfit.py uses, on samples written by sparkdump.js. Spec 25 asks for the count and the whole brightness
# distribution to be fitted together; the colour statistics are kept where they are.
# usage:
#   python3 sparkfit25.py scan  'work/dump25/*.json'            # the current constants, then a scan around them
#   python3 sparkfit25.py show  'work/dump25/*.json' kd ks shin satGain bright tiltPow
# The model gives the per-sparkle peak level of the sparkles inside the picture. Two numbers tie it to a render: the share
# of them at or above the detector's threshold (n_vis) and the shape of the distribution above it. The count of points in a
# render is n_vis x (the sparkles on screen, from sparkpool.js) x a detector factor, which is measured once on the current
# build and held fixed while fitting.
import sys, os, json, glob, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BANDS = [6, 10, 15, 25, 40, 60, 100, 160, 1e9]


def read_lobes():
    s = open(os.path.join(ROOT, 'src', 'main', 'scene.js'), encoding='utf-8').read()
    body = s[s.index('const SPARK_LOBES_DEF = ['):s.index('const SPARK_LOBES =')]
    out = []
    for m in re.finditer(r'\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*([\d.]+),\s*([\d.]+),\s*\[([\d.,\s]+)\]\s*\]', body):
        x, y, r, st = (float(m.group(i)) for i in range(1, 5))
        col = [float(v) for v in m.group(5).split(',')]
        out.append((x, y, r, st, col))
    return out


def read_const():
    s = open(os.path.join(ROOT, 'src', 'main', 'scene.js'), encoding='utf-8').read()
    part = s[s.index('const SPARKR = {'):s.index('};', s.index('const SPARKR = {'))]
    g = lambda k: float(re.search(r'\b%s: *(-?[\d.]+)' % k, part).group(1))
    return dict(kd=g('kd'), ks=g('ks'), shin=g('shin'), satGain=g('satGain'), bright=g('bright'), tiltPow=g('tiltPow'),
                mapStr=g('mapStr'), mapR=g('mapR'))


class Model:
    def __init__(self, dumps):
        D = np.concatenate([np.array(json.load(open(f))) for f in sorted(glob.glob(dumps))])
        self.qx, self.qy, self.diff, self.ndh, self.c, self.Iv, self.px = (D[:, i] for i in range(7))
        self.lobes = read_lobes()
        self.n = len(D)

    def iri(self, mapStr, mapR):
        acc = np.zeros((self.n, 3)); W = np.zeros(self.n)
        for (x, y, r, s, col) in self.lobes:
            w = s * mapStr * np.exp(-((self.qx - x) ** 2 + (self.qy - y) ** 2) / (r * mapR) ** 2)
            acc += w[:, None] * np.array(col)[None]; W += w
        m = np.minimum(W, 1)[:, None]
        base = np.where(W[:, None] > 1e-4, acc / np.maximum(W, 1e-9)[:, None], 1.0)
        return 1 + (base - 1) * m

    def levels(self, kd, ks, shin, satGain, bright, tiltPow, mapStr=None, mapR=None, cache={}):
        cn = read_const()
        key = (mapStr or cn['mapStr'], mapR or cn['mapR'], shin)
        if key not in cache: cache[key] = (self.iri(key[0], key[1]), self.ndh ** shin)
        ir, spec = cache[key]
        vC = 1 - np.exp(-satGain * (kd * self.diff[:, None] + ks * spec[:, None] * ir))
        tilt = 1 - (1 - self.c) ** tiltPow
        return 255 * vC * (self.Iv * tilt * bright)[:, None]

    def stats(self, **kw):
        lev = self.levels(**kw)
        P = lev.mean(1); mx = lev.max(1)
        sat = (mx - lev.min(1)) / np.maximum(mx, 1e-3)
        vis = P >= BANDS[0]
        J = {'n_vis': float(vis.mean())}
        Pv = P[vis]
        for a, b in zip(BANDS[:-1], BANDS[1:]): J['band_%d' % a] = float(np.mean((Pv >= a) & (Pv < b)))
        for q in (50, 90, 99): J['p%d' % q] = float(np.percentile(Pv, q))
        br = P >= 20; s = sat[br]
        J['sat_gt35'] = float(np.mean(s > 0.35)); J['sat_p90'] = float(np.percentile(s, 90))
        if br.sum() > 100:
            t2 = np.percentile(P[br], 66.7)
            J['sat_gt35_hi'] = float(np.mean(s[P[br] >= t2] > 0.35))
        return J


def footage_targets(d=os.path.join(HERE, 'work', 's25', 'footage')):
    Js = [json.load(open(os.path.join(d, f))) for f in sorted(os.listdir(d)) if f.endswith('.json')]
    out = {}
    for k in ['count_full'] + ['band_%d' % a for a in BANDS[:-1]] + ['peak_p50', 'peak_p90', 'peak_p99']:
        out[k] = float(np.mean([J[k] for J in Js if k in J]))
    return out


def line(name, J):
    print('%-14s' % name + ' nvis %.3f p50 %5.1f p90 %5.1f p99 %6.1f | bands ' % (J['n_vis'], J['p50'], J['p90'], J['p99'])
          + ' '.join('%.3f' % J['band_%d' % a] for a in BANDS[:-2])
          + ' | sat>.35 %.3f p90 %.2f hi %.3f' % (J['sat_gt35'], J['sat_p90'], J.get('sat_gt35_hi', float('nan'))))


def main():
    mode, dumps = sys.argv[1], sys.argv[2]
    M = Model(dumps)
    cn = read_const()
    base = {k: cn[k] for k in ('kd', 'ks', 'shin', 'satGain', 'bright', 'tiltPow')}
    T = footage_targets()
    print('footage: p50 %5.1f p90 %5.1f p99 %6.1f | bands %s | count %.0f' % (
        T['peak_p50'], T['peak_p90'], T['peak_p99'], ' '.join('%.3f' % T['band_%d' % a] for a in BANDS[:-2]), T['count_full']))
    print('samples', M.n)
    line('current', M.stats(**base))
    if mode == 'show':
        v = [float(x) for x in sys.argv[3:9]]
        line('shown', M.stats(kd=v[0], ks=v[1], shin=v[2], satGain=v[3], bright=v[4], tiltPow=v[5]))
        return
    # the loss: the whole distribution of peak levels (every band and the percentiles) plus the visible share, with the
    # colour statistics held near where they are
    cur = M.stats(**base)
    target_nvis = float(sys.argv[3]) if len(sys.argv) > 3 else cur['n_vis'] * T['count_full'] / 780.0
    print('target n_vis %.3f' % target_nvis)
    rows = []
    for kd in (0.17, 0.20, 0.26, 0.32, 0.40):
      for ks in (1.1, 1.5, 2.0, 2.8):
        for bright in (0.55, 0.7, 0.85, 1.0, 1.15):
          for tiltPow in (3.0, 4.0, 6.0, 9.0):
            for satGain in (0.63, 0.9, 1.3, 1.8, 2.5):
              J = M.stats(kd=kd, ks=ks, shin=base['shin'], satGain=satGain, bright=bright, tiltPow=tiltPow)
              L = ((J['n_vis'] - target_nvis) / 0.01) ** 2
              L += sum(((J['band_%d' % a] - T['band_%d' % a]) / 0.02) ** 2 for a in BANDS[:-2])
              L += ((J['p50'] - T['peak_p50']) / 1.0) ** 2 + ((J['p90'] - T['peak_p90']) / 3.0) ** 2 + ((J['p99'] - T['peak_p99']) / 10.0) ** 2
              L += ((J['sat_gt35'] - cur['sat_gt35']) / 0.01) ** 2 + ((J['sat_p90'] - cur['sat_p90']) / 0.03) ** 2
              rows.append((L, (kd, ks, bright, tiltPow, satGain), J))
    rows.sort(key=lambda r: r[0])
    for L, p, J in rows[:12]:
        line('kd%.2f ks%.2f b%.2f t%.0f g%.2f' % p, J); print('   loss %.0f' % L)


if __name__ == '__main__':
    main()
