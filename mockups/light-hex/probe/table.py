import sys, json, subprocess, numpy as np
from PIL import Image
from de import de2000
TAG = sys.argv[1] if len(sys.argv) > 1 else 'before'
hours = [i / 4 for i in range(96)]
ops = json.loads(subprocess.check_output(['node', '-e', "import('./ambient.mjs').then(m=>console.log(JSON.stringify(%s.map(h=>m.layerOps(h)))))" % json.dumps(hours)]))
def comp(L, op):
    c = np.round(L['day'] * (1 - op['dusk']) + L['dusk'] * op['dusk'])
    return np.round(c * (1 - op['night']) + L['night'] * op['night']).clip(0, 255).astype(np.uint8)
load = lambda d, t: np.asarray(Image.open(f'{d}/mock-{t}.png').convert('RGB')).astype(np.float64)
X0, Y0, CW, CH = 544, 224, 832, 544
LA = {t: load('.', t)[Y0:Y0+CH, X0:X0+CW] for t in ['day', 'dusk', 'night']}
same = []
for h, op in zip(hours, ops):
    g = np.fromfile(f'raw/game-{h:.2f}.rgba', np.uint8).reshape(CH, CW, 4)[..., :3]
    d = de2000(comp(LA, op), g)
    same.append({'h': h, 'mean': round(float(d.mean()), 2), 'p95': round(float(np.percentile(d, 95)), 2), 'max': round(float(d.max()), 2)})
import os
S = os.environ.get('S', 'summer')
meta = json.load(open(f'{S}/meta.json'))
W, H, TW, TH = meta['W'], meta['H'], meta['TW'], meta['TH']
LS = {t: load(S, t) for t in ['day', 'dusk', 'night']}
alb = np.asarray(Image.open(f'{S}/albedo.png').convert('RGB')).astype(int)
algr = np.asarray(Image.open(f'{S}/albedo-ground.png').convert('RGB')).astype(int)
gfull = np.fromfile(f'{S}/raw/g-13.00.rgba', np.uint8).reshape(H, W, 4)[..., :3].astype(int)
gbare = np.fromfile(f'{S}/raw/g-bare-13.00.rgba', np.uint8).reshape(H, W, 4)[..., :3].astype(int)
tile = lambda arr: np.repeat(np.repeat(np.array(arr).reshape(TH, TW), 32, 0), 32, 1)
ground = tile([['grass', 'tall_grass', 'deep_grass', 'water', 'shallow_water', 'rocky', 'dirt'].index(g) if g in ['grass', 'tall_grass', 'deep_grass', 'water', 'shallow_water', 'rocky', 'dirt'] else -1 for g in meta['ground']])
wall = tile(meta['wall'])
tx = np.arange(W) // 32; ty = np.arange(H) // 32
TX, TY = np.meshgrid(tx, ty)
colony = (TX >= 16) & (TX <= 33) & (TY >= 7) & (TY <= 27)
lit = np.zeros((H, W), bool)
yy, xx = np.mgrid[0:H, 0:W]
for l in meta['lights']:
    lit |= np.hypot(xx - l['x'], (yy - l['y']) * 1.25) < l['rad'] * 1.1
def classes(full, bare):
    diff = np.any(full != bare, -1)
    r = (full + 0.5) / (bare + 0.5)
    shadow = diff & np.all((r > 0.3) & (r < 0.93), -1) & ((r.max(-1) - r.min(-1)) < 0.15)
    sprite = diff & ~shadow
    return ~diff, sprite, shadow
mfree, msprite, mshadow = classes(alb, algr)
gfree, gsprite, gshadow = classes(gfull, gbare)
mt = wall == meta['mountain']
inner = mt.copy()
for dy in (-32, 0, 32):
    for dx in (-32, 0, 32):
        inner &= np.roll(np.roll(mt, dy, 0), dx, 1)
fire = meta['lights'][[i for i, l in enumerate(meta['lights']) if l['x'] == 912 and l['y'] == 525][0]]
fd = np.hypot(xx - fire['x'], (yy - fire['y']) * 1.25) / fire['rad']
green = lambda img: (img[..., 1] > img[..., 0]) & (img[..., 1] > img[..., 2])
samples = {
    'grass': lambda free, spr, sh, img: free & np.isin(ground, [0, 1, 2]) & ~colony & ~lit,
    'foliage': lambda free, spr, sh, img: spr & (TX < 18) & ~lit & green(img),
    'water': lambda free, spr, sh, img: free & np.isin(ground, [3, 4]) & ~lit,
    'rock': lambda free, spr, sh, img: inner & ~lit,
    'shadow': lambda free, spr, sh, img: sh & ~colony & ~lit,
    'fire-lit ground': lambda free, spr, sh, img: free & (fd > 0.2) & (fd < 0.55),
}
M = {k: f(mfree, msprite, mshadow, alb) for k, f in samples.items()}
G = {k: f(gfree, gsprite, gshadow, gfull) for k, f in samples.items()}
hexs = lambda c: '#%02x%02x%02x' % tuple(int(v) for v in c)
rows = []
crops = {}
for h, op in zip(hours, ops):
    m = comp(LS, op)
    g = np.fromfile(f'{S}/raw/g-{h:.2f}.rgba', np.uint8).reshape(H, W, 4)[..., :3]
    for k in samples:
        mc = np.round(m[M[k]].mean(0)).astype(int); gc = np.round(g[G[k]].mean(0)).astype(int)
        de = float(de2000(mc.reshape(1, 3).astype(np.uint8), gc.reshape(1, 3).astype(np.uint8))[0])
        rows.append({'h': h, 'sample': k, 'mock': hexs(mc), 'game': hexs(gc), 'de': round(de, 2), 'diff': (gc - mc).tolist()})
    if h in (0, 6, 7, 12, 18, 19.5, 21):
        crops[h] = (m, g)
counts = {k: [int(M[k].sum()), int(G[k].sum())] for k in samples}
json.dump({'same': same, 'rows': rows, 'counts': counts}, open(f'table-{TAG}.json', 'w'))
for h, (m, g) in crops.items():
    Image.fromarray(np.concatenate([m[400:720, 1100:1780], g[400:720, 1100:1780]], 1)).save(f'sheet-{TAG}-{h:05.2f}.png')
print('counts', counts)
sm = max(same, key=lambda r: r['max']); print('same-pixels worst mean %.2f at %s, worst max %.2f at %s' % (max(r['mean'] for r in same), max(same, key=lambda r: r['mean'])['h'], sm['max'], sm['h']))
for k in samples:
    rk = [r for r in rows if r['sample'] == k]; w = max(rk, key=lambda r: r['de'])
    print('%-16s mean dE %.2f worst %.2f at %.2f (%s vs %s)' % (k, np.mean([r['de'] for r in rk]), w['de'], w['h'], w['mock'], w['game']))
