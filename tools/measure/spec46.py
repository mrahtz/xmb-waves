# usage: spec46.py frame.png [...]  -> statistics of spec 4.6 from wave-only frames at 1920x1080 (the wave's light alone, black background)
import sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, label
from scipy.signal import find_peaks, peak_widths
W,H=1920,1080
def pct(a,q): return np.percentile(a,q) if len(a) else float('nan')
def analyse(path):
    L=np.asarray(Image.open(path).convert('L').resize((W,H),Image.LANCZOS),dtype=float)
    L=gaussian_filter(L,[1.0,0])
    fmax=L.max()
    cols=range(0,W,2)
    thick=[]; centre=[]; npk12=[]; npk25=[]; npk40=[]; face=[]; foldface=[]; avgface=[]; overlap=[]; widths=[]; bwidths=[]; edge=[]; part=[]; linepk=[]
    top=np.full(W,-1); bot=np.full(W,-1); peakrows={}  # for partings and line tracking
    for x in cols:
        c=L[:,x]; cm=c.max()
        if cm<max(6,0.08*fmax): continue
        vis=np.where(c>max(3,0.06*cm))[0]; t,b=vis.min(),vis.max(); top[x]=t; bot[x]=b
        thick.append((b-t)/H); centre.append((t+b)/2/H)
        p12,pr12=find_peaks(c,prominence=0.12*cm); p25,_=find_peaks(c,prominence=0.25*cm); p40,_=find_peaks(c,prominence=0.40*cm)
        npk12.append(len(p12)); npk25.append(len(p25)); npk40.append(len(p40)); peakrows[x]=(p12,pr12['prominences'],c[p12])
        if len(p12)>=2:
            mins=[c[p12[i]:p12[i+1]].min() for i in range(len(p12)-1)]
            fl=np.median(mins); face.append(fl/cm); foldface.append(cm/max(fl,1e-3)); avgface.append(c[p12].mean()/max(fl,1e-3)); overlap.append(max(mins)/max(min(mins),1e-3))
            part.append(sum(1 for m in mins if m<0.08*cm))
        elif len(p12)==1:
            part.append(0)
        if len(p12):
            w=peak_widths(c,p12,rel_height=0.5)[0]; widths.extend(w.tolist()); bwidths.append(w[np.argmax(c[p12])])
            # thin-line peak height relative to the band's median level in the column
            band=c[t:b+1]; med=np.median(band[band>max(3,0.06*cm)])
            for pk,ww in zip(p12,w):
                if ww<12: linepk.append(c[pk]/max(med,1e-3))
        # edge rise 10 -> 90 % of the outermost peak's height, from outside inwards
        if len(p12):
            for side in (0,1):
                pk=p12[0] if side==0 else p12[-1]; h=c[pk]
                seg=c[t:pk+1] if side==0 else c[pk:b+1][::-1]
                if seg.size==0: continue
                i10=np.argmax(seg>=0.1*h); i90=np.argmax(seg>=0.9*h)
                if i90>i10: edge.append(i90-i10)
    thick=np.array(thick); centre=np.array(centre); npk12=np.array(npk12)
    # partings: dark gaps inside the band hull, as connected components
    hull=np.zeros((H,W),bool)
    for x in cols:
        if top[x]>=0: hull[top[x]:bot[x]+1,x:x+2]=True
    colmax=L.max(axis=0); dark=hull&(L<0.08*np.maximum(colmax,1e-3)[None,:])
    lab,n=label(dark); lens=[]
    for i in range(1,n+1):
        ys,xs=np.where(lab==i); ln=(xs.max()-xs.min()+1)/W
        if ln>=0.05 and len(xs)>200: lens.append(ln)
    # thin bright lines: track narrow peaks along x
    segs=[]; active=[]  # active: [y, x_start, x_last, count_outer]
    for x in cols:
        if x not in peakrows: active=[s for s in active if x-s[2]<=6]; continue
        p,pr,hgt=peakrows[x]; w=peak_widths(L[:,x],p,rel_height=0.5)[0] if len(p) else []
        cand=[(py,pw) for py,pw in zip(p,w) if pw<12]
        used=set(); newact=[]
        for s in active:
            best=None
            for k,(py,pw) in enumerate(cand):
                if k in used: continue
                if abs(py-s[0])<=3 and (best is None or abs(py-s[0])<best[0]): best=(abs(py-s[0]),k)
            if best is not None:
                k=best[1]; used.add(k); py=cand[k][0]; T=top[x]; B=bot[x]; th=max(B-T,1); outer=(py-T)/th<0.2 or (B-py)/th<0.2
                newact.append([py,s[1],x,s[3]+(1 if outer else 0),s[4]+1])
            elif x-s[2]<=6: newact.append(s)
            else: segs.append(s)
        for k,(py,pw) in enumerate(cand):
            if k not in used:
                T=top[x]; B=bot[x]; th=max(B-T,1); outer=(py-T)/th<0.2 or (B-py)/th<0.2
                newact.append([py,x,x,1 if outer else 0,1])
        active=newact
    segs.extend(active)
    seglen=np.array([(s[2]-s[1])/W for s in segs]); outer=np.array([s[3]/max(s[4],1) for s in segs])
    long10=seglen>=0.10; long25=seglen>=0.25
    thirds=[npk12[(np.array(list(peakrows.keys()))<W/3)].mean() if len(npk12) else 0, 0, 0]
    xs=np.array(list(peakrows.keys()))
    out={}
    out['centre median / range']='%.2f / %.2f-%.2f H'%(np.median(centre),centre.min(),centre.max())
    out['top edge min, bottom edge max']='%.2f, %.2f H'%((np.array([top[x] for x in cols if top[x]>=0])/H).min(),(np.array([bot[x] for x in cols if top[x]>=0])/H).max())
    out['tilt (right - left centre), arch']='%+.2f H, %.2f H'%(np.mean(centre[-20:])-np.mean(centre[:20]), np.max(np.abs(centre-np.linspace(np.mean(centre[:20]),np.mean(centre[-20:]),len(centre)))))
    out['thickness median / p10-p90']='%.3f / %.3f-%.3f H'%(np.median(thick),pct(thick,10),pct(thick,90))
    out['thickest/thinnest, pinch <0.08H, <0.05H']='%.1f, %.0f %%, %.0f %%'%(pct(thick,95)/max(pct(thick,5),1e-3),100*(thick<0.08).mean(),100*(thick<0.05).mean())
    hist=[100*(npk12==k).mean() for k in range(1,7)]+[100*(npk12>=7).mean()]
    out['peaks/column at 12 %: mean, 1..6,7+ %']='%.1f, '%npk12.mean()+' / '.join('%.0f'%h for h in hist)
    out['peaks/column at 25 % and 40 %']='%.1f, %.1f'%(np.mean(npk25),np.mean(npk40))
    out['peaks by thirds (12 %)']='%.1f / %.1f / %.1f'%(npk12[xs<W/3].mean(),npk12[(xs>=W/3)&(xs<2*W/3)].mean(),npk12[xs>=2*W/3].mean())
    out['face level (of column max) median / p10-p90']='%.2f / %.2f-%.2f'%(np.median(face),pct(face,10),pct(face,90))
    out['brightest fold / face: median, p90; avg peak / face median']='%.1f, %.1f; %.1f'%(np.median(foldface),pct(foldface,90),np.median(avgface))
    out['overlap ratio (brightest/faintest face) median']='%.2f'%np.median(overlap)
    wd=np.array(widths); out['peak width at half prominence: lines (<15 px) median, all median, sheen (>=15) median']='%.1f, %.1f, %.1f px'%(np.median(wd[wd<15]) if (wd<15).any() else float('nan'),np.median(wd),np.median(wd[wd>=15]) if (wd>=15).any() else float('nan'))
    out['brightest line width median']='%.1f px'%np.median(bwidths)
    out['edge rise 10-90 % median / p10-p90']='%.1f / %.1f-%.1f px'%(np.median(edge),pct(edge,10),pct(edge,90))
    out['dark partings per column (mean)']='%.2f'%np.mean(part)
    out['partings >= 5 % W: count, length median / max']='%d, %.2f / %.2f W'%(len(lens),np.median(lens) if lens else float('nan'),max(lens) if lens else float('nan'))
    out['thin lines >= 10 % W: count, >= 25 % W, length median']='%d, %d, %.2f W'%(long10.sum(),long25.sum(),np.median(seglen[long10]) if long10.any() else float('nan'))
    out['share of line pixels in outer fifths']='%.2f'%(np.mean(outer[long10]) if long10.any() else float('nan'))
    out['line peak / band median level: median']='%.2f'%np.median(linepk)
    return out
SPEC={'centre median / range':'0.57 / 0.45-0.70 H (point: 0.3-0.8)','top edge min, bottom edge max':'rarely above 0.30, rarely below 0.86 H','tilt (right - left centre), arch':'up to +-0.33 H, up to 0.2 H','thickness median / p10-p90':'0.15 / 0.07-0.23 H','thickest/thinnest, pinch <0.08H, <0.05H':'1.5-4, ~10 %, a few %','peaks/column at 12 %: mean, 1..6,7+ %':'3-4, 3 / 15 / 29 / 29 / 16 / 6 / 2','peaks/column at 25 % and 40 %':'2-3, 1-2','peaks by thirds (12 %)':'~3 / ~4 / ~4','face level (of column max) median / p10-p90':'0.20 / 0.12-0.30','brightest fold / face: median, p90; avg peak / face median':'5, 8 (up to 12); 3','overlap ratio (brightest/faintest face) median':'1.8 (1.2-3)','peak width at half prominence: lines (<15 px) median, all median, sheen (>=15) median':'lines 6 (4-9); sheen 19 (8-37) px','brightest line width median':'8 (5-11) px','edge rise 10-90 % median / p10-p90':'3.5 / 1.5-9 px','dark partings per column (mean)':'1-2','partings >= 5 % W: count, length median / max':'8-13, 0.03-0.14 / rarely > 0.33 W','thin lines >= 10 % W: count, >= 25 % W, length median':'10-17, 1-5, 0.12-0.28 W','share of line pixels in outer fifths':'> 0.5','line peak / band median level: median':'1.5 (1-2.5)'}
results=[analyse(p) for p in sys.argv[1:]]
for k in results[0]:
    print('%-78s %s'%(k+':', ' | '.join(r[k] for r in results)))
    print('%-78s spec: %s'%('',SPEC[k]))
