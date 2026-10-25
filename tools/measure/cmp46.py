# usage: cmp46.py LABEL=file.txt ... -> for each measure, the first number of each frame cell, summarised as median [min-max] per label
import sys, re, numpy as np
def parse(path):
    out={}
    for line in open(path):
        if ':' not in line or line.strip().startswith('spec:'): continue
        name,rest=line.split(':',1)
        if 'peak width' in name: name='peak width lines/all/sheen'; rest=rest.split(':',1)[1]
        cells=[c.strip() for c in rest.strip().split('|')]
        vals=[]
        for c in cells:
            nums=re.findall(r'[-+]?\d+\.?\d*',c)
            if nums: vals.append([float(n) for n in nums])
        out[name.strip()]=vals
    return out
labels=[]; data={}
for arg in sys.argv[1:]:
    lab,files=arg.split('=',1); labels.append(lab); merged={}
    for f in files.split(','):
        for k,v in parse(f).items(): merged.setdefault(k,[]).extend(v)
    data[lab]=merged
keys=list(data[labels[0]].keys())
idx={'peaks/column at 12 %: mean, 1..6,7+ %':0,'brightest fold / face: median, p90; avg peak / face median':0,'thickest/thinnest, pinch <0.08H, <0.05H':1,'partings >= 5 % W: count, length median / max':0,'thin lines >= 10 % W: count, >= 25 % W, length median':0,'peaks/column at 25 % and 40 %':0}
print('%-58s'%'measure (first number of each cell)'+''.join('%-24s'%l for l in labels))
for k in keys:
    row='%-58s'%k[:58]
    for l in labels:
        v=data[l].get(k,[])
        i=idx.get(k,0)
        a=np.array([c[i] for c in v if len(c)>i])
        row+='%-24s'%('%.2f [%.2f-%.2f]'%(np.median(a),a.min(),a.max()) if len(a) else '-')
    print(row)
