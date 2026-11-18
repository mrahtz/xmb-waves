# bandlevelwin.py: spec 4.5 (version 36), "And the stretch of footage it is measured over matters".
# usage:
#   python3 bandlevelwin.py footage CLIP [--fps 2] [--lengths 2,5,10,20,30,60,120] [--out OUT.json]
#   python3 bandlevelwin.py build PAGE --time 2026-10-15T12:00:00 --since 240 --seconds 120 [--fps 2] [--seed 1] [...]
#   python3 bandlevelwin.py table OUT1.json [OUT2.json ...]
# The band's light is not the same at every moment: it breathes with the state of the cloth, and over a short clip that
# variation is as large as the differences the band-level observable is used to settle. Version 36 therefore says the
# figure must be taken as an average over a stretch long enough that it stops depending on where the stretch starts, and
# that how long is to be established rather than assumed: take the longest footage of one condition, compute the figure
# over every window of a given length, and lengthen the window until the spread between windows is small beside the
# difference being measured.
# This decodes the clip once at --fps, computes bandlevel.moment on every sampled frame, and then, for each window
# length, reports the spread of the window means (as a share of the whole stretch's mean) over every window of that
# length. Footage and renders go through one and the same code. Version 36 also says the figure is not a settling-in, so
# the series itself is printed with --series: it should wander rather than grow or fade with the time since the start.
import sys, os, json, subprocess
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bandlevel import moment

HERE = os.path.dirname(os.path.abspath(__file__))
LENGTHS = (2, 5, 10, 20, 30, 60, 120)
KEYS = ('col', 'add', 'mean', 'bg')


def opt(a, k, d):
    return a[a.index(k) + 1] if k in a else d


def footage_series(path, fps_out):
    """Decode the clip once and yield every frame whose index is on the output sampling grid."""
    import battery_frames as bf
    st = bf.probe(path)
    w, h = int(st['width']), int(st['height'])
    num, den = (st['r_frame_rate'].split('/') + ['1'])[:2]
    fps = float(num) / float(den)
    n = int(st.get('nb_frames') or 0)
    step = max(1, int(round(fps / fps_out)))
    want = list(range(0, n, step)) if n else list(range(0, int(fps * 3600), step))
    for i, f in bf.footage_frames(path, want):
        yield i / fps, f


def build_series(page, opts, since, seconds, fps_out, w, h):
    frames = [60 * since + int(round(60.0 * k / fps_out)) for k in range(int(seconds * fps_out))]
    o = dict(opts); o.update({'w': w, 'h': h})
    p = subprocess.Popen(['node', os.path.join(HERE, 'battery_render.js'), page, json.dumps(o),
                          ','.join(map(str, frames))], stdout=subprocess.PIPE)
    sz = w * h * 3
    for k in range(len(frames)):
        b = p.stdout.read(sz)
        if len(b) < sz: break
        yield k / float(fps_out), np.frombuffer(b, np.uint8).reshape(h, w, 3)
    p.stdout.close(); p.wait()


def windows(ts, vals, length):
    """-> the mean of vals over every window of `length` seconds that fits, stepped by one sample."""
    ts = np.asarray(ts); v = np.asarray(vals, float)
    out = []
    for i in range(len(ts)):
        j = np.searchsorted(ts, ts[i] + length, 'right')
        if j > len(ts) or ts[-1] - ts[i] < length - 1e-6: break
        out.append(v[i:j].mean())
    return np.array(out)


def report(name, ts, rows, lengths, series=False):
    print('%s: %d frames over %.1f s' % (name, len(ts), ts[-1] - ts[0]))
    for k in KEYS:
        v = [r[k] for r in rows]
        print('  %-5s whole stretch %9.3f   frame to frame %5.1f %% s.d.' % (k, np.mean(v), 100 * np.std(v) / np.mean(v)))
        for L in lengths:
            wm = windows(ts, v, L)
            if len(wm) < 2: continue
            m = np.mean(wm)
            print('        window %5.1f s: %4d windows, %9.3f to %9.3f, spread %5.1f %% of the mean, s.d. %4.1f %%'
                  % (L, len(wm), wm.min(), wm.max(), 100 * (wm.max() - wm.min()) / m, 100 * np.std(wm) / m))
    if series:
        print('  series (t, col):', ' '.join('%.0f:%.0f' % (t, r['col']) for t, r in zip(ts, rows)))


def main():
    a = sys.argv[1:]
    if a[0] == 'table':
        for p in a[1:]:
            J = json.load(open(p))
            report(os.path.basename(p)[:-5], J['t'], J['rows'], J.get('lengths', LENGTHS))
            print()
        return
    fps_out = float(opt(a, '--fps', 2))
    lengths = [float(x) for x in opt(a, '--lengths', ','.join(map(str, LENGTHS))).split(',')]
    outf = opt(a, '--out', None)
    if a[0] == 'footage':
        path = a[1]
        src = footage_series(path, fps_out)
        name = os.path.basename(os.path.dirname(path)) + '/' + os.path.basename(path)
    else:
        page = a[1]
        w, h = (int(x) for x in opt(a, '--size', '1920x1080').split('x'))
        opts = {'time': opt(a, '--time', '2026-10-15T12:00:00'), 'seed': int(opt(a, '--seed', 1)),
                'theme': int(opt(a, '--theme', 0))}
        src = build_series(page, opts, int(opt(a, '--since', 240)), float(opt(a, '--seconds', 120)), fps_out, w, h)
        name = 'build ' + opts['time']
    ts, rows = [], []
    for t, f in src:
        ts.append(t); rows.append(moment(f))
        if len(ts) % 20 == 0: print('  %d frames' % len(ts), file=sys.stderr, flush=True)
    report(name, ts, rows, lengths, series='--series' in a)
    if outf:
        json.dump({'name': name, 't': ts, 'rows': rows, 'lengths': lengths}, open(outf, 'w'))


if __name__ == '__main__':
    main()
