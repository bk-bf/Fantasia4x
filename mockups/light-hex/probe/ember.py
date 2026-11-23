import json, subprocess, numpy as np
from PIL import Image
from de import de2000
hours=[i/4 for i in range(96)]
ops=json.loads(subprocess.check_output(['node','-e',"import('./ambient.mjs').then(m=>console.log(JSON.stringify(%s.map(h=>m.layerOps(h)))))"%json.dumps(hours)]))
S='full'; meta=json.load(open(f'{S}/meta.json')); W,H=meta['W'],meta['H']
L={t:np.asarray(Image.open(f'{S}/mock-{t}.png').convert('RGB')).astype(float) for t in ['day','dusk','night']}
def comp(op):
    c=np.round(L['day']*(1-op['dusk'])+L['dusk']*op['dusk']); return np.round(c*(1-op['night'])+L['night']*op['night']).clip(0,255).astype(np.uint8)
y0,y1,x0,x1=540,650,1380,1470
out=[]
for h,op in zip(hours,ops):
    m=comp(op)[y0:y1,x0:x1]; g=np.fromfile(f'{S}/raw/g-{h:.2f}.rgba',np.uint8).reshape(H,W,4)[y0:y1,x0:x1,:3]
    mc=m.reshape(-1,3).mean(0); gc=g.reshape(-1,3).mean(0)
    d=float(de2000(np.round(mc).reshape(1,3).astype(np.uint8),np.round(gc).reshape(1,3).astype(np.uint8))[0])
    out.append((h,d,'#%02x%02x%02x'%tuple(np.round(mc).astype(int)),'#%02x%02x%02x'%tuple(np.round(gc).astype(int))))
w=max(out,key=lambda r:r[1]); print('ember box mean-colour dE: mean %.2f worst %.2f at %.2f (%s vs %s)'%(np.mean([r[1] for r in out]),*w[1:2],w[0],w[2],w[3]))
for h in (0,6,12,18,21): r=out[int(h*4)]; print(h, round(r[1],2), r[2], r[3])
