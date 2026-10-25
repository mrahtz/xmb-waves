# usage: cycle.py DIR -> band peak / mean excess over the background for DIR/HHMM.png at eight clock times, beside the reference frames (same measure as bandbright.py)
import sys, os, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
def stats(path):
    g=gaussian_filter(np.asarray(Image.open(path).convert('L').resize((1920,1080),Image.LANCZOS),dtype=float),1.0)
    pk=[];mn=[]
    for x in [300,500,700,900,1200,1500,1700]:
        col=g[:,x]; i=int(np.argmax(col[250:850]))+250; win=col[max(0,i-200):i+200]
        top=col[max(0,i-260):max(1,i-180)].mean(); bot=col[min(1079,i+180):min(1080,i+260)].mean(); bg=min(top,bot)
        ex=win-bg; above=np.where(ex>0.2*ex.max())[0]; band=ex[above.min():above.max()+1]
        pk.append(ex.max()); mn.append(band.mean())
    return np.mean(pk),np.mean(mn)
d=sys.argv[1]; R=os.path.join(os.environ.get('REF_DIR','refs'),'NDx_%s.png')
print('time   reference peak/mean   mine peak/mean')
for t in ['0000','0900','1030','1200','1330','1500','1630','1800']:
    rp,rm=stats(R%t); mp,mm=stats(os.path.join(d,t+'.png'))
    print('%s   +%5.1f / +%5.1f        +%5.1f / +%5.1f'%(t,rp,rm,mp,mm))
