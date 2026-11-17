# side by side: footage background estimate (left, wave masked grey) and this build's background-only render (right)
import json, subprocess, numpy as np, os, sys
from PIL import Image, ImageDraw
H = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(H, '..', 'work', 'bgfit'); meta = json.load(open(os.path.join(D, 'meta.json')))
T = np.fromfile(os.path.join(D, 'targets.f32'), dtype=np.float32).reshape(len(meta), 135, 240, 3)
K = np.fromfile(os.path.join(D, 'keep.u8'), dtype=np.uint8).reshape(len(meta), 135, 240)
w = subprocess.Popen(['node', os.path.join(H, 'bgworker.js'), sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
w.stdout.readline(); w.stdin.write(json.dumps({'id': 0, 'p': {}, 'imgs': True}) + '\n{"quit":1}\n'); w.stdin.flush()
r = json.loads(w.stdout.readline())
S = Image.new('RGB', (2 * 484, len(meta) // 2 * 139 + 139))
for j, c in enumerate(meta):
    f = T[j].copy(); f[K[j] == 0] = f[K[j] == 0] * 0.3 + 40
    m = np.array(r['imgs'][j], dtype=np.uint8).reshape(135, 240, 4)[..., :3]
    t = Image.fromarray(np.concatenate([np.clip(f, 0, 255).astype(np.uint8), m], axis=1))
    ImageDraw.Draw(t).text((3, 3), c['time'][:16] + '  %.1f' % r['err'][j], fill=(255, 255, 255))
    S.paste(t, ((j % 2) * 484, (j // 2) * 139))
S.save(sys.argv[2]); print('mean', np.mean(r['err']))
