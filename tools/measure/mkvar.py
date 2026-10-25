# usage: python3 mkvar.py NAME group.key=value ...  -> $MEASURE_WORK/var_NAME.html: the current sources with the given
# tunables changed (see buildsrc.py for the keys). Nothing in the repository is changed.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from buildsrc import read_sources, apply_edits, assemble, WORK
name = sys.argv[1]; texts, order = read_sources(); apply_edits(texts, sys.argv[2:])
os.makedirs(WORK, exist_ok=True); out = os.path.join(WORK, 'var_%s.html' % name)
open(out, 'w', encoding='utf-8').write(assemble(texts, order)); print('wrote', out)
