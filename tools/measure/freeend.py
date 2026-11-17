# usage: python3 -I freeend.py [--clips REGEX] [--page PAGE] [--secs N] -> spec 4.1 (version 30), "How it ends at the
# free-end edge": the band's thickness and its mean light in the free-end tenth of the width against the same in the
# middle third, and how much of each region's columns pinch, measured the same way on the footage and on this build's
# renders of the same conditions.
#
# Per frame (background removed by bgremove.wave, as every other tool here does it), in each region of columns:
#   thickness  median over the region's seen columns of the extent above 6 % of the column maximum (fraction of H)
#   light      mean level over the whole region (8-bit units of the background-removed light)
#   pinch      share of the region's seen columns whose extent is below 0.08 H
# A column counts as seen where its maximum is at least max(6, 8 % of the frame's maximum), as in thick.py.
# A clip's value is the median over its frames; the tool prints each clip and the medians over clips.
import os, re, sys, json, subprocess, tempfile
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bgremove

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
INDEX = os.environ.get('FOOTAGE_INDEX', r'C:\xmb-share\footage\INDEX.json')
WORK = os.environ.get('MEASURE_WORK', os.path.join(HERE, 'work'))


def regions(w):
    return {'free_tenth': (int(0.9 * w), w), 'middle_third': (int(w / 3), int(2 * w / 3))}


def frame(a):
    """one background-removed 8-bit grey frame -> {region: (thickness, light, pinch share)}"""
    L = np.asarray(a, dtype=float)
    h, w = L.shape
    fmax = L.max()
    cm = L.max(axis=0)
    seen = cm >= max(6, 0.08 * fmax)
    vis = L > np.maximum(3, 0.06 * cm)[None, :]
    top = vis.argmax(axis=0)
    bot = h - 1 - vis[::-1].argmax(axis=0)
    ext = (bot - top) / h
    out = {}
    for name, (a0, a1) in regions(w).items():
        s = seen[a0:a1]
        e = ext[a0:a1][s]
        out[name] = (float(np.median(e)) if len(e) else np.nan,
                     float(L[:, a0:a1].mean()),
                     float(np.mean(e < 0.08)) if len(e) else np.nan)
    return out


def clip_frames(path, fps, secs):
    """decode a clip to 8-bit RGB frames at 1 fps (the first `secs` seconds)"""
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                            'stream=width,height', '-of', 'csv=p=0:s=x', path], capture_output=True, text=True)
    w, h = (int(v) for v in probe.stdout.strip().split('x'))
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', 'fps=1', '-frames:v', str(secs),
                        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True)
    buf = np.frombuffer(p.stdout, np.uint8)
    n = len(buf) // (w * h * 3)
    return buf[:n * w * h * 3].reshape(n, h, w, 3)


def render_frames(page, cond, secs):
    """render this build at a clip's condition through score mode (GPU), 1 fps, as 8-bit RGB frames"""
    from PIL import Image
    out = tempfile.mkdtemp(dir=WORK, prefix='freeend_')
    w, h = (int(v) for v in cond['size'].split('x'))
    opts = {'time': cond['date'] + 'T' + cond['time'], 'theme': cond.get('colour', 0),
            'seed': cond.get('seed') or 1, 'w': w, 'h': h}
    env = dict(os.environ, XMBW_GPU='1', PAGE=os.path.abspath(page))
    subprocess.run(['node', os.path.join(HERE, 'seq.js'), out, json.dumps(opts),
                    str(60 * cond['since_start_s']), str(secs), '60'], check=True, env=env)
    fs = sorted(f for f in os.listdir(out) if f.endswith('.png'))
    a = np.stack([np.asarray(Image.open(os.path.join(out, f)).convert('RGB')) for f in fs])
    for f in fs:
        os.remove(os.path.join(out, f))
    os.rmdir(out)
    return a


def measure(frames):
    vals = [frame(bgremove.wave(f)) for f in frames]
    out = {}
    for name in regions(frames.shape[2]):
        out[name] = [float(np.nanmedian([v[name][i] for v in vals])) for i in range(3)]
    return out


if __name__ == '__main__':
    ap = {'--clips': r'.', '--page': os.path.join(ROOT, 'index.html'), '--secs': '6', '--kinds': 'recording,render'}
    for i, a in enumerate(sys.argv):
        if a in ap:
            ap[a] = sys.argv[i + 1]
    clips = [c for c in json.load(open(INDEX))['clips'] if c['kind'] in ap['--kinds'].split(',')]
    clips = [c for c in clips if re.search(ap['--clips'], '%s_%s_t%d_%s' % (c['date'], c['time'], c['since_start_s'], c['kind']))]
    secs = int(ap['--secs'])
    rows = []
    for c in clips:
        f = measure(clip_frames(c['path'], c.get('fps', 60), secs))
        g = measure(render_frames(ap['--page'], c, secs))
        rows.append((c, f, g))
        print('%s %s t%-4d %-9s  footage: free tenth %.3f H / %5.1f lv / pinch %.0f%%, middle %.3f H / %5.1f lv / pinch %.0f%%  |  '
              'clean: free tenth %.3f H / %5.1f lv / pinch %.0f%%, middle %.3f H / %5.1f lv / pinch %.0f%%'
              % (c['date'], c['time'][:5], c['since_start_s'], c['kind'],
                 f['free_tenth'][0], f['free_tenth'][1], 100 * f['free_tenth'][2], f['middle_third'][0], f['middle_third'][1], 100 * f['middle_third'][2],
                 g['free_tenth'][0], g['free_tenth'][1], 100 * g['free_tenth'][2], g['middle_third'][0], g['middle_third'][1], 100 * g['middle_third'][2]))
        sys.stdout.flush()
    if rows:
        def med(side, name, i):
            return float(np.nanmedian([r[side][name][i] for r in rows]))
        for side, label in ((1, 'footage'), (2, 'clean  ')):
            print('%s over %d clips: free tenth / middle third  thickness %.3f / %.3f (ratio %.2f), light %.1f / %.1f (ratio %.2f), pinch %.0f%% / %.0f%%'
                  % (label, len(rows), med(side, 'free_tenth', 0), med(side, 'middle_third', 0),
                     med(side, 'free_tenth', 0) / med(side, 'middle_third', 0),
                     med(side, 'free_tenth', 1), med(side, 'middle_third', 1),
                     med(side, 'free_tenth', 1) / med(side, 'middle_third', 1),
                     100 * med(side, 'free_tenth', 2), 100 * med(side, 'middle_third', 2)))
