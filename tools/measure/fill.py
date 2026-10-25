# usage: fill.py LABEL=frame.png[,frame.png...] ... -> fill of the band: share of band pixels above 40 % / 25 % of the column max, mean band level / column max, and the share of band pixels below 8 % (dark)
import sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
def measure(path):
    L=np.asarray(Image.open(path).convert('L').resize((1920,1080),Image.LANCZOS),dtype=float); L=gaussian_filter(L,[1,0]); fmax=L.max()
    a40=[];a25=[];mean=[];dark=[]
    for x in range(0,1920,2):
        c=L[:,x]; cm=c.max()
        if cm<max(6,0.08*fmax): continue
        vis=np.where(c>max(3,0.06*cm))[0]; seg=c[vis.min():vis.max()+1]/cm
        a40.append((seg>0.4).mean()); a25.append((seg>0.25).mean()); mean.append(seg.mean()); dark.append((seg<0.08).mean())
    return np.mean(a40),np.mean(a25),np.mean(mean),np.mean(dark)
print('%-10s %s'%('','share>40%  share>25%  mean/max  share<8%'))
for arg in sys.argv[1:]:
    lab,files=arg.split('=',1); r=np.array([measure(f) for f in files.split(',')])
    m=r.mean(axis=0); lo=r.min(axis=0); hi=r.max(axis=0)
    print('%-10s %.2f [%.2f-%.2f]  %.2f [%.2f-%.2f]  %.2f [%.2f-%.2f]  %.2f [%.2f-%.2f]'%(lab,m[0],lo[0],hi[0],m[1],lo[1],hi[1],m[2],lo[2],hi[2],m[3],lo[3],hi[3]))
