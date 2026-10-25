"""Shared by the variant tools: read the page's sources, change tunables, assemble a page.

The sources are src/head.html, src/sim.js and the files of src/main/ (joined in the order of
src/main/ORDER, as tools/build.py does). Parameter edits are 'group.key=value':
  day.X / night.X / dawn.X / dusk.X   a mood value          net.X / lat.X / scene.X   simulation constants
  cam.X   the camera                  wave.X   the wave settings
  lat.sways=[[...],[...],[...]]       the whole sway list
  raw.main=OLD>>>NEW / raw.sim=OLD>>>NEW   a literal replacement (OLD must occur exactly once)
"""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.environ.get('MEASURE_WORK', os.path.join(ROOT, 'tools', 'measure', 'work'))

def read_sources():
    """-> dict of relative path -> text, plus the order of the main files."""
    rd = lambda p: open(os.path.join(ROOT, 'src', p), encoding='utf-8').read()
    order = [l.split('#')[0].strip() for l in rd('main/ORDER').splitlines() if l.split('#')[0].strip()]
    texts = {'head.html': rd('head.html'), 'sim.js': rd('sim.js')}
    for n in order: texts['main/' + n] = rd('main/' + n)
    return texts, order

def assemble(texts, order):
    main = "(function () {\n'use strict';\n" + ''.join(texts['main/' + n] for n in order) + '})();\n'
    return texts['head.html'] + texts['sim.js'] + '</script>\n<script>\n' + main + '</script>\n</body>\n</html>\n'

def _setk(text, start, end, key, val):
    s = text.index(start); e = text.index(end, s + len(start)); part = text[s:e]
    pat = r'(\b' + re.escape(key) + r': *)-?[0-9.]+(?:e-?[0-9]+)?'
    n = len(re.findall(pat, part)); assert n == 1, (key, n)
    return text[:s] + re.sub(pat, lambda m: m.group(1) + val, part, count=1) + text[e:]

def _where(texts, files, marker):
    hits = [f for f in files if marker in texts[f]]
    assert len(hits) == 1, (marker, hits); return hits[0]

def apply_edits(texts, edits):
    mains = [f for f in texts if f.startswith('main/')]
    for ed in edits:
        k, v = ed.split('=', 1); grp, key = k.split('.', 1)
        if grp in ('night', 'dawn', 'day', 'dusk'):
            nxt = {'night': '\n  dawn:', 'dawn': '\n  day:', 'day': '\n  dusk:', 'dusk': '\n};'}[grp]
            f = _where(texts, mains, '  ' + grp + ': {'); texts[f] = _setk(texts[f], '  ' + grp + ': {', nxt, key, v)
        elif grp in ('cam', 'wave'):
            m = {'cam': 'const CAMERA = {', 'wave': 'const WAVE = {'}[grp]
            f = _where(texts, mains, m); texts[f] = _setk(texts[f], m, '};', key, v)
        elif grp == 'lat' and key == 'sways':
            t = texts['sim.js']; assert len(re.findall(r'sways: \[\[.*?\]\],', t)) == 1
            texts['sim.js'] = re.sub(r'sways: \[\[.*?\]\],', 'sways: ' + v + ',', t, count=1)
        elif grp in ('net', 'lat', 'scene'):
            m = {'net': 'const NET = {', 'lat': 'const LAT = {', 'scene': 'const SCENE = {'}[grp]
            texts['sim.js'] = _setk(texts['sim.js'], m, '};', key, v)
        elif grp == 'raw':
            old, new = v.split('>>>')
            f = _where(texts, mains if key == 'main' else ['sim.js'], old)
            assert texts[f].count(old) == 1, (old, texts[f].count(old)); texts[f] = texts[f].replace(old, new)
        else: raise SystemExit('unknown group ' + grp)
    return texts
