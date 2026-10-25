# usage: plotprof.py out.png ref.png mine1.png [mine2.png ...] -> column brightness profiles (background-subtracted for the reference) at x = 0.2/0.4/0.6/0.8 W
import sys, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
def lum(path):
    im=Image.open(path).convert('RGB').resize((1920,1080),Image.LANCZOS)
    a=np.asarray(im,dtype=float); return gaussian_filter(0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2],[1,0])
out=sys.argv[1]; paths=sys.argv[2:]; imgs=[lum(p) for p in paths]
ys=np.arange(1080); rows=np.r_[int(0.15*1080):int(0.33*1080), int(0.86*1080):int(0.97*1080)]
PW,PH=480,220; cols=[0.2,0.4,0.6,0.8]
sheet=Image.new('RGB',(PW*4,PH*len(imgs)),'white'); d=ImageDraw.Draw(sheet)
y0,y1=int(0.35*1080),int(0.85*1080)
for r,L in enumerate(imgs):
    for j,xf in enumerate(cols):
        x=int(xf*1920); c=L[:,x].copy()
        if r==0:
            A=np.vstack([rows,np.ones_like(rows)]).T; k,b=np.linalg.lstsq(A,c[rows],rcond=None)[0]; c=c-(k*ys+b)
        seg=c[y0:y1]; m=max(seg.max(),1e-3)
        ox,oy=j*PW,r*PH
        d.rectangle([ox,oy,ox+PW-1,oy+PH-1],outline='gray')
        pts=[(ox+10+(i/(y1-y0))*(PW-20), oy+PH-15-(v/m)*(PH-40)) for i,v in enumerate(seg)]
        d.line(pts,fill='blue',width=1)
        d.line([(ox+10,oy+PH-15),(ox+PW-10,oy+PH-15)],fill='black')
        d.text((ox+12,oy+4),'%s x=%.1fW max %.0f'%(('ref' if r==0 else 'img%d'%r),xf,m),fill='black')
        for frac in (0.2,0.5):
            yy=oy+PH-15-frac*(PH-40); d.line([(ox+10,yy),(ox+PW-10,yy)],fill='lightgray')
sheet.save(out); print('saved',out)
