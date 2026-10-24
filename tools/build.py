#!/usr/bin/env python3
"""Assemble index.html from src/ (no dependencies). The committed index.html is the output."""
import os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = lambda n: open(os.path.join(root, 'src', n), encoding='utf-8').read()
out = src('head.html') + src('sim.js') + '</script>\n<script>\n' + src('main.js') + '</script>\n</body>\n</html>\n'
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(out)
print('wrote index.html (%d bytes)' % len(out))
