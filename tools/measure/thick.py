# usage: thick.py DIR [--json OUT] -> per-frame band thickness (median over columns of the extent above 6 % of the column max) for a wave-only sequence; prints the distribution over frames
# (battery.py imports frame(a), which takes one frame as an 8-bit grey array; the numbers are the same as from files)
import os, sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
def frame(a):
    """one 8-bit grey frame -> (thickness median, centre median) in H, NaN where the band is not seen"""
    L=gaussian_filter(np.asarray(a,dtype=float),[1,0]); h,w=L.shape; fmax=L.max()
    # every second column: where the band is seen (max >= max(6, 8 % of the frame's max)), its first and last row above
    # max(3, 6 % of the column max); all columns at once (the same rows as np.where column by column)
    Ls=L[:,::2]; cm=Ls.max(axis=0); keep=~(cm<max(6,0.08*fmax))
    vis=Ls>np.maximum(3,0.06*cm)[None,:]; top=vis.argmax(axis=0)[keep]; bot=(h-1-vis[::-1].argmax(axis=0))[keep]
    t=(bot-top)/h; c=(bot+top)/2/h
    return (np.median(t) if len(t) else np.nan), (np.median(c) if len(c) else np.nan)
if __name__=='__main__':
    d=sys.argv[1]; files=sorted(os.path.join(d,f) for f in os.listdir(d) if f.endswith('.png'))
    th=[]; cen=[]
    for f in files:
        a,b=frame(np.asarray(Image.open(f).convert('L'))); th.append(a); cen.append(b)
    th=np.array(th); cen=np.array(cen)
    print('%s: %d frames; thickness median per frame: median %.3f, min %.3f, max %.3f, share > 0.23 H: %.0f %%, share < 0.08 H: %.0f %%; centre %.2f-%.2f H'%(d,len(th),np.nanmedian(th),np.nanmin(th),np.nanmax(th),100*np.nanmean(th>0.23),100*np.nanmean(th<0.08),np.nanmin(cen),np.nanmax(cen)))
    if '--json' in sys.argv:
        import json; json.dump({'thick':th.tolist(),'centre':cen.tolist()},open(sys.argv[sys.argv.index('--json')+1],'w'))
