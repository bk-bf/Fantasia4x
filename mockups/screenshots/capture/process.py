import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

src, dst, drop_file = sys.argv[1], sys.argv[2], sys.argv[3]
drop = {l.strip() for l in open(drop_file) if l.strip() and not l.startswith('#')}
man = [m for m in json.load(open(os.path.join(src, 'manifest.json'))) if m['file'] not in drop and os.path.exists(os.path.join(src, m['file']))]

def topic(m):
    s = m['subject']
    if m['hud']: return 'interface'
    if re.search(r'whole-map|continent', s): return 'vistas'
    if re.search(r'heartwood|emberwood|moonwood|witchwood|ironwood|soulwood|bonewood|glowcap|mana|amethyst|emberbloom', s): return 'magic and wonders'
    if re.search(r'battle', s): return 'combat'
    if re.search(r'elk|deer|boar|goat|herd|creature|den|warren|aerie|nest', s): return 'creatures and lairs'
    if re.search(r'construction|mining|field|pawn|woodcut|hunter|first-camp', s): return 'colony at work'
    if re.search(r'hamlet|hold|hearth|stone-house|campfire|forge|full-tech', s): return 'settlements and light'
    if re.search(r'oak|pine|willow|apple|birch', s): return 'trees'
    return 'landscapes'

os.makedirs(os.path.join(dst, 'img'), exist_ok=True)
os.makedirs(os.path.join(dst, 'thumbs'), exist_ok=True)

def work(m):
    f = m['file']
    out = os.path.join(dst, 'img', f)
    subprocess.run(['optipng', '-quiet', '-o2', '-strip', 'all', '-out', out, '-clobber', os.path.join(src, f)], check=True)
    subprocess.run(['cwebp', '-quiet', '-q', '80', '-resize', '640', '360', out, '-o', os.path.join(dst, 'thumbs', f[:-4] + '.webp')], check=True)

with ThreadPoolExecutor(8) as ex: list(ex.map(work, man))
keep = ['file', 'biome', 'subject', 'time', 'timeOfDay', 'season', 'weather', 'zoom', 'camera', 'seed', 'map', 'world', 'hud', 'window']
shots = []
for m in man:
    d = {k: m.get(k) for k in keep}
    d['topic'] = topic(m)
    shots.append(d)
json.dump(shots, open(os.path.join(dst, 'shots.json'), 'w'), indent=0, separators=(',', ':'))
print(len(shots))
