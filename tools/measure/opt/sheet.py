# usage: sheet.py out.jpg LABEL=frame.png [LABEL=frame.png ...]  -> same-zoom crop sheet: rows 0.40-0.78 H of each 1920x1080 frame, stacked, labelled
import sys
from PIL import Image, ImageDraw
items = [a.split('=', 1) for a in sys.argv[2:]]
W, y0, y1 = 1920, int(0.40 * 1080), int(0.78 * 1080); h = y1 - y0
out = Image.new('RGB', (W, h * len(items)))
d = ImageDraw.Draw(out)
for i, (lab, path) in enumerate(items):
    im = Image.open(path).convert('RGB')
    if im.size != (1920, 1080): im = im.resize((1920, 1080), Image.LANCZOS)
    out.paste(im.crop((0, y0, W, y1)), (0, i * h))
    d.rectangle((0, i * h, 420, i * h + 22), fill=(0, 0, 0)); d.text((8, i * h + 5), lab, fill=(255, 255, 255))
    if i: d.line((0, i * h, W, i * h), fill=(90, 90, 90))
out.save(sys.argv[1], quality=90); print('wrote', sys.argv[1], out.size)
