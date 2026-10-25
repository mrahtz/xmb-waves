# usage: spec46m.py DIR fps  -> motion statistics of spec 4.6 from a wave-only sequence (any size; measured in screen fractions and px at 1920x1080)
import os, sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, label
from scipy.signal import find_peaks
d=sys.argv[1]; fps=float(sys.argv[2])
files=sorted(os.path.join(d,f) for f in os.listdir(d) if f.endswith('.png'))
fr=[]
for f in files:
    im=Image.open(f).convert('L'); w,h=im.size
    fr.append(gaussian_filter(np.asarray(im,dtype=float),[1.0*h/1080*2,0]))
h,w=fr[0].shape; sx=1920/w
def centres(L):
    cm=L.max(axis=0); fmax=L.max(); c=np.full(w,np.nan); t=np.full(w,np.nan); b=np.full(w,np.nan)
    for x in range(w):
        if cm[x]<max(6,0.08*fmax): continue
        vis=np.where(L[:,x]>max(3,0.06*cm[x]))[0]; t[x]=vis.min(); b[x]=vis.max(); c[x]=(vis.min()+vis.max())/2
    return c/h,t/h,b/h
C=np.array([centres(L)[0] for L in fr])   # frames x columns, in H
k1=int(round(fps))
# vertical speed of the centre per column over 1 s
dv=np.abs(C[k1:]-C[:-k1]); dv=dv[~np.isnan(dv)]
# whole-band mean height over time; change within 40 s; slow drift over 5 s windows
m=np.nanmean(C,axis=1); n40=min(len(m)-1,int(40*fps)); ch40=np.nanmax(m[:n40+1])-np.nanmin(m[:n40+1])
k5=int(5*fps); drift5=np.abs(m[k5:]-m[:-k5])/5 if len(m)>k5 else np.array([np.nan])
# swell travel: shift of the centre-line profile (minus its mean) that best matches 1 s later
shifts=[]
for t0 in range(0,len(fr)-k1,k1):
    a=C[t0]-np.nanmean(C[t0]); b=C[t0+k1]-np.nanmean(C[t0+k1]); best=None
    for dx in range(-int(0.25*w),int(0.25*w)+1,max(1,w//320)):
        lo=max(0,-dx); hi=min(w,w-dx); aa=a[lo:hi]; bb=b[lo+dx:hi+dx]; ok=~(np.isnan(aa)|np.isnan(bb))
        if ok.sum()<w*0.3: continue
        cc=np.corrcoef(aa[ok],bb[ok])[0,1]
        if best is None or cc>best[0]: best=(cc,dx)
    if best: shifts.append(best[1]/w)
shifts=np.array(shifts)
# picture correlation after 1 s and 5 s within the band region
def corr(A,B):
    m=(A>0.06*A.max())|(B>0.06*B.max()); a=A[m]-A[m].mean(); b=B[m]-B[m].mean(); return (a*b).mean()/np.sqrt((a*a).mean()*(b*b).mean())
c1=np.mean([corr(fr[i],fr[i+k1]) for i in range(0,len(fr)-k1,k1)]); c5=np.mean([corr(fr[i],fr[i+k5]) for i in range(0,len(fr)-k5,k5)]) if len(fr)>k5 else float('nan')
# strand coherence: per column, peaks (12 % prominence) matched between consecutive frames; vertical speed; difference between adjacent peaks
diffs=[]; speeds=[]
def subpix(c,p):
    if 0<p<len(c)-1:
        den=c[p-1]-2*c[p]+c[p+1]
        if den<0: return p+0.5*(c[p-1]-c[p+1])/den
    return float(p)
kd=max(1,int(round(0.3*fps)))  # speeds over 0.3 s, with sub-pixel peak positions
for i in range(0,len(fr)-kd):
    A,B=fr[i],fr[i+kd]
    for x in range(0,w,max(1,w//120)):
        ca=A[:,x]; cb=B[:,x]
        if ca.max()<6 or cb.max()<6: continue
        pa,_=find_peaks(ca,prominence=0.12*ca.max()); pb,_=find_peaks(cb,prominence=0.12*cb.max())
        if len(pa)<2 or len(pb)<1: continue
        v=[]
        for p in pa:
            j=np.argmin(np.abs(pb-p))
            if abs(pb[j]-p)<=10*h/1080: v.append((subpix(cb,pb[j])-subpix(ca,p))*fps/kd*1080/h)
            else: v.append(np.nan)
        v=np.array(v)
        for a,b in zip(v[:-1],v[1:]):
            if not (np.isnan(a) or np.isnan(b)): diffs.append(abs(a-b)); speeds.append(abs(a)); speeds.append(abs(b))
# features: dark partings tracked between frames (centroid motion and lifetimes)
def partings(L):
    cm=L.max(axis=0); fmax=L.max(); hull=np.zeros_like(L,bool)
    for x in range(w):
        if cm[x]<max(6,0.08*fmax): continue
        vis=np.where(L[:,x]>max(3,0.06*cm[x]))[0]; hull[vis.min():vis.max()+1,x]=True
    dark=hull&(L<0.08*np.maximum(cm,1e-3)[None,:]); lab,n=label(dark); out=[]
    for i in range(1,n+1):
        ys,xs=np.where(lab==i)
        if (xs.max()-xs.min()+1)/w>=0.03 and len(xs)>40*(w/1920)**2*4: out.append((xs.mean(),ys.mean(),xs.min(),xs.max()))
    return out
P=[partings(L) for L in fr]
fspeed=[]; lifetimes=[]; alive={}  # alive: id -> (last frame, start frame, x)
nextid=0; tracks={}
for i in range(len(P)):
    cur=P[i]; assigned={}
    for tid,(lastf,startf,x,y) in list(alive.items()):
        if lastf!=i-1: continue
        best=None
        for j,(cx,cy,x0,x1) in enumerate(cur):
            if j in assigned.values(): continue
            dd=np.hypot(cx-x,(cy-y)*3)
            if dd<0.05*w and (best is None or dd<best[0]): best=(dd,j)
        if best:
            j=best[1]; assigned[tid]=j; cx,cy=cur[j][0],cur[j][1]
            if tid not in tracks: tracks[tid]=[]
            tracks[tid].append((i,cx)); alive[tid]=(i,startf,cx,cy)
    for tid,(lastf,startf,x,y) in list(alive.items()):
        if lastf<i-1: lifetimes.append((lastf-startf+1)/fps); del alive[tid]
    for j,(cx,cy,x0,x1) in enumerate(cur):
        if j not in assigned.values(): alive[nextid]=(i,i,cx,cy); nextid+=1
for tid,(lastf,startf,x,y) in alive.items(): lifetimes.append((lastf-startf+1)/fps)
for tid,tr in tracks.items():
    if len(tr)>=int(0.5*fps): fspeed.append((tr[-1][1]-tr[0][1])/((tr[-1][0]-tr[0][0])/fps)*sx)
fs=np.array(fspeed) if fspeed else np.array([np.nan]); lt=np.array(lifetimes)
print('frames %d at %.1f fps (%.0f s), %dx%d'%(len(fr),fps,len(fr)/fps,w,h))
print('%-62s %s'%('centre vertical speed over 1 s: median / p90 (H/s):','%.3f / %.3f'%(np.median(dv),np.percentile(dv,90))),'   spec: 0.01-0.03, median 0.02')
print('%-62s %s'%('mean height change within 40 s (H); drift over 5 s (H/s):','%.2f; %.4f'%(ch40,np.nanmedian(drift5))),'   spec: 0.1-0.25; < 0.01')
print('%-62s %s'%('swell shift of the centre line per 1 s (W/s): median, p10-p90:','%+.3f, %+.3f..%+.3f -> crossing in %.0f s'%(np.median(shifts),np.percentile(shifts,10),np.percentile(shifts,90),1/max(abs(np.median(shifts)),1e-3))),'   spec: left to right, 10-15 s per screen')
print('%-62s %s'%('picture correlation after 1 s / 5 s:','%.2f / %.2f'%(c1,c5)),'   spec: ~0.5 (half the detail in place) / mostly re-formed')
print('%-62s %s'%('adjacent peaks: vertical speed difference median over 0.3 s (px/s @1080p):','%.1f (peak speeds median %.1f)'%(np.median(diffs),np.median(speeds))),'   spec: ~5 (a fifth of the common motion)')
print('%-62s %s'%('partings alive >= 0.5 s: speed along x median |v|, share rightwards (px/s @1920):','%.0f, %.2f (n=%d)'%(np.nanmedian(np.abs(fs)),np.nanmean(fs>0),len(fs))),'   spec: 10-40, slightly more often rightwards')
print('%-62s %s'%('parting lifetimes: median / max (s):','%.1f / %.1f (n=%d)'%(np.median(lt),lt.max(),len(lt))),'   spec: 0.5-1 / 6-9')
