# usage: REF=ref.png MINE=mine.png python3 sbs.py out.jpg LABEL -> side-by-side of a reference frame (default
# $REF_DIR/NDx_1200.png) and one of mine, three band sections at the same zoom (band rows searched in the middle of the frame)
import sys, numpy as np
from PIL import Image, ImageDraw
import os
R=os.environ.get('REF',os.path.join(os.environ.get('REF_DIR','refs'),'NDx_1200.png'))
ref=Image.open(R).convert('RGB'); mine=Image.open(os.environ.get('MINE','mine1200.png')).convert('RGB'); tag=sys.argv[2] if len(sys.argv)>2 else ''
def band_row(im, half):
    g=np.asarray(im.convert('L'),dtype=float); h,w=g.shape
    sub=g[int(.25*h):int(.75*h), :w//2] if half=='left' else g[int(.25*h):int(.75*h), w//2:]
    return int(np.argmax(sub.mean(axis=1)))+int(.25*h)
o=Image.new('RGB',(1920,1620))
yr=band_row(ref,'left'); ym=band_row(mine,'left')
o.paste(ref.crop((0,max(0,yr-540),1920,max(0,yr-540)+1080)).resize((960,540),Image.LANCZOS),(0,0))
o.paste(mine.crop((0,max(0,ym-270),960,max(0,ym-270)+540)),(960,0))
o.paste(ref.crop((300,yr-270,1260,yr+270)),(0,540)); o.paste(mine.crop((150,ym-135,630,ym+135)).resize((960,540),Image.LANCZOS),(960,540))
yr2=band_row(ref,'right'); ym2=band_row(mine,'right')
o.paste(ref.crop((2200,yr2-270,3160,yr2+270)),(0,1080)); o.paste(mine.crop((1100,ym2-135,1580,ym2+135)).resize((960,540),Image.LANCZOS),(960,1080))
d=ImageDraw.Draw(o)
for y in (0,540,1080): d.text((8,y+8),'reference (public ref 1, %s, 4K)'%os.environ.get('REFLABEL','12:00 PM'),fill=(255,255,255)); d.text((968,y+8),'mine '+tag,fill=(255,255,255))
o.save(sys.argv[1],quality=90)
