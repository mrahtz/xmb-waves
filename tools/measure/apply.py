# usage: python3 apply.py group.key=value ...  -> applies the edits to the repository's sources (src/) and rebuilds
# index.html with tools/build.py (see buildsrc.py for the keys)
import os, sys, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from buildsrc import read_sources, apply_edits, ROOT
texts, order = read_sources(); before = dict(texts); apply_edits(texts, sys.argv[1:])
for f, t in texts.items():
    if t != before[f]: open(os.path.join(ROOT, 'src', f), 'w', encoding='utf-8').write(t); print('changed src/' + f)
print(subprocess.run(['python3', os.path.join(ROOT, 'tools', 'build.py')], capture_output=True, text=True).stdout.strip())
