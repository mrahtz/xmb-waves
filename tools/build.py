#!/usr/bin/env python3
"""Assemble index.html from src/ (no dependencies). The committed index.html is the output.

Layout: src/head.html (markup, styles, the start of the simulation script), src/sim.js (the
simulation module, shared by the worker and score mode), then the files of src/main/ in the
order given by src/main/ORDER, joined inside one function scope (they share their top-level
names, so the order matters)."""
import os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def src(*p): return open(os.path.join(root, 'src', *p), encoding='utf-8').read()
order = [l.split('#')[0].strip() for l in src('main', 'ORDER').splitlines() if l.split('#')[0].strip()]
main = "(function () {\n'use strict';\n" + ''.join(src('main', n) for n in order) + '})();\n'
out = src('head.html') + src('sim.js') + '</script>\n<script>\n' + main + '</script>\n</body>\n</html>\n'
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(out)
print('wrote index.html (%d bytes)' % len(out))
