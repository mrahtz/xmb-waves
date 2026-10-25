# usage: thick.py DIR -> per-frame band thickness (median over columns of the extent above 6 % of the column max) for a wave-only sequence; prints the distribution over frames
import os, sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
d=sys.argv[1]; files=sorted(os.path.join(d,f) for f in os.listdir(d) if f.endswith('.png'))
th=[]; cen=[]
for f in files:
    L=gaussian_filter(np.asarray(Image.open(f).convert('L'),dtype=float),[1,0]); h,w=L.shape; fmax=L.max(); t=[]; c=[]
    for x in range(0,w,2):
        col=L[:,x]; cm=col.max()
        if cm<max(6,0.08*fmax): continue
        vis=np.where(col>max(3,0.06*cm))[0]; t.append((vis.max()-vis.min())/h); c.append((vis.max()+vis.min())/2/h)
    th.append(np.median(t) if t else np.nan); cen.append(np.median(c) if c else np.nan)
th=np.array(th); cen=np.array(cen)
print('%s: %d frames; thickness median per frame: median %.3f, min %.3f, max %.3f, share > 0.23 H: %.0f %%, share < 0.08 H: %.0f %%; centre %.2f-%.2f H'%(d,len(th),np.nanmedian(th),np.nanmin(th),np.nanmax(th),100*np.nanmean(th>0.23),100*np.nanmean(th<0.08),np.nanmin(cen),np.nanmax(cen)))
