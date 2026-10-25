# usage: xt.py out.png DIR fps label [DIR fps label ...]  -> x-t plots: brightness along the band's brightest row (and rows 12 px above/below) stacked over time, contrast stretched; diagonal streaks = horizontal flow
import os, sys, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
args=sys.argv[2:]; panels=[]
for i in range(0,len(args),3):
    d,fps,label=args[i],float(args[i+1]),args[i+2]
    files=sorted(os.path.join(d,f) for f in os.listdir(d) if f.endswith('.png'))
    fr=[gaussian_filter(np.asarray(Image.open(f).convert('L').resize((640,360),Image.LANCZOS),dtype=float),1.0) for f in files]
    base=fr[0]; bgc=np.percentile(base,15); ex=gaussian_filter(np.maximum(base-bgc,0),4); prof=ex[126:280,:].mean(axis=1); yc=int(np.argmax(prof))+126
    rows=[]
    for y in (yc-12,yc,yc+12):
        st=np.array([f[y,:] for f in fr]); st=st-np.percentile(st,10); st=np.clip(st*2.5,0,255)
        rows.append(st)
    im=np.concatenate(rows,axis=0)  # (3*T) x 640
    # scale time so that 1 s = 20 px for every source
    T=len(fr); h=int(3*T*20/fps); panel=Image.fromarray(im.astype('uint8')).resize((640,h),Image.BILINEAR).convert('RGB')
    dr=ImageDraw.Draw(panel); dr.text((6,4),'%s: x-t at rows %d/%d/%d; 1 s = 20 px down'%(label,yc-12,yc,yc+12),fill=(255,255,0))
    for s in range(1,int(T/fps)+1):
        for k in range(3): yy=int((k*T/fps+s)*20);
        dr.line((0,int(s*20),8,int(s*20)),fill=(255,255,0))
    panels.append(panel)
H=sum(p.height for p in panels)+4*len(panels); o=Image.new('RGB',(640,H),(40,40,40)); y=0
for p in panels: o.paste(p,(0,y)); y+=p.height+4
o.save(sys.argv[1]); print('ok', o.size)
