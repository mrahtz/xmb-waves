# usage: yt.py out.png DIR fps label [DIR fps label ...] -> y-t plots at x = 0.3, 0.5, 0.7 W: each column's brightness profile over 10 s stacked left to right (time) with y vertical, contrast stretched per panel
import os, sys, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
args=sys.argv[2:]; panels=[]
for i in range(0,len(args),3):
    d,fps,label=args[i],float(args[i+1]),args[i+2]
    files=sorted(os.path.join(d,f) for f in os.listdir(d) if f.endswith('.png'))[:int(10*fps)]
    fr=[gaussian_filter(np.asarray(Image.open(f).convert('L').resize((640,360),Image.LANCZOS),dtype=float),[1.0,0]) for f in files]
    T=len(fr); cols=[]
    for xf in (0.3,0.5,0.7):
        x=int(xf*640); M=np.array([f[:,x] for f in fr]).T   # 360 x T
        M=M[int(0.3*360):int(0.85*360)]
        M=np.clip(M/max(np.percentile(M,99.5),1e-3),0,1)**0.7
        im=Image.fromarray((M*255).astype(np.uint8)).resize((int(T*300/(10*fps)),M.shape[0]),Image.NEAREST)
        cols.append(im)
    W=sum(c.width for c in cols)+20*(len(cols)-1); H=cols[0].height+18
    p=Image.new('L',(W,H),40); d2=ImageDraw.Draw(p); x0=0
    for c in cols: p.paste(c,(x0,18)); x0+=c.width+20
    d2.text((2,2),label+'   (x = 0.3 / 0.5 / 0.7 W; 10 s left to right; y 0.30-0.85 H)',fill=255)
    panels.append(p)
W=max(p.width for p in panels); H=sum(p.height for p in panels)+10*len(panels)
out=Image.new('L',(W,H),0); y=0
for p in panels: out.paste(p,(0,y)); y+=p.height+10
out.save(sys.argv[1]); print('saved')
