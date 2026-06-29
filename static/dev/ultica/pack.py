#!/usr/bin/env python3
"""Recursively pack CDDA tilesets into the viewer, minus unfitting (modern/post-apoc) tiles.
Multi-tileset: each SOURCE is packed into its own per-category atlases ("<tileset> <category>")
so Ultica and MShockXotto+ can be compared side by side. Both are native 32x32.
Collapses autotile fragments + numbered dups; keeps every otherwise-distinct sprite.
Strips: vehicle/appliance/overmap/sci-fi folders, vp_/flag prefixes, gun/ammo/electronics tokens,
zombies/robots/mutants/corpses (Innawood-style), keeping animals + fantasy (Magiclysm)."""
import os, re, json
from collections import defaultdict, Counter
from PIL import Image

GFX = "/home/kirill/Documents/Projects/CDDA-Tilesets/gfx"
SOURCES = [("ultica", f"{GFX}/UltimateCataclysm"), ("mshock", f"{GFX}/MShockXotto+")]
OUT = os.path.dirname(os.path.abspath(__file__))
CELL, COLS, PAGE_ROWS = 32, 16, 150

FRAGMENT = re.compile(r"_(center|corner_(ne|nw|se|sw)|edge_(ew|ns)|end_piece_[news]|t_connection_[news])$")
DROP_FOLDERS = {"vehicle","vehicles","appliances","overmap","layers","character",
                "aftershock","exodii","no_hope","dinomod","power_leech","hacks","corpses"}
DROP_PREFIX  = ("vp_","national_","pride_","road_","int1_","int2_","int3_","frame_","xlframe_","hdframe_")
MODERN_TOKENS = {
 "gun","guns","rifle","pistol","shotgun","smg","revolver","carbine","sniper","handgun","ar15","ak47",
 "ammo","bullet","bullets","magazine","mag","grenade","grenades","rocket","missile","launcher","taser",
 "flamethrower","gauge","casing","shell","shells","mp5mag","m17",
 "electronic","electronics","battery","batteries","circuit","processor","computer","laptop","smartphone",
 "phone","cellphone","tv","television","radio","antenna","transmitter","solar","alternator","gasoline",
 "diesel","propane","kerosene","fuel","cbm","bionic","bionics","cyber","robot","drone","turret","nanofab",
 "reactor","plutonium","uranium","atomic","nuclear","laser","plasma","emp","kevlar","ballistic","railgun",
 "car","cars","truck","motorcycle","bicycle","bike","atv","motor","engine","chainsaw","jackhammer","welder",
 "soldering","multitool","cigarette","cigarettes","cigar","soda","cola","mp3","flashlight","plastic",
}
POSTAPOC_SUBSTR = ("zombie","skeleton","necro","boomer","spitter","shocker","brute","hulk","biollante",
 "triffid","fungaloid","fungal","spore","mycus","migo","nether","shoggoth","gozu","blob","robot","turret",
 "drone","manhack","eyebot","secubot","riotbot","tankbot","skitterbot","tripod","dispatch","cyborg","feral",
 "razorclaw","chickenbot","generator","mutant","amalgamation","decayed","scorched","crawler","gasbag",
 "kreck","gelatin","flaming_eye","broken")
FANTASY_KEEP = {"golem","troll","ogre","demon","dragon","leprechaun","lizardfolk","mossling","yulecat",
                "owlbear","goblin","orc","fairy","pixie","wraith","mammoth","megafauna","direwolf"}
CAT_MAP = {"overlay":"apparel","monster":"monsters","vehicles":"vehicle","item":"items"}
KNOWN = {"items","apparel","terrain","monsters","furniture","fields","field","magiclysm","traps","trap",
         "megafauna","misc","spell"}

def category(rel):
    parts = rel.split(os.sep)
    cat = parts[1] if len(parts) > 1 else parts[0]
    if cat == "mods" and len(parts) > 2: cat = parts[2]
    cat = CAT_MAP.get(cat.lower(), cat.lower())
    cat = CAT_MAP.get(cat, cat)
    return cat if cat in KNOWN else "other"

def is_modern(stem, rel):
    if set(rel.lower().split(os.sep)) & DROP_FOLDERS: return True
    if stem.startswith(DROP_PREFIX): return True
    low = stem.lower()
    if low.startswith("corpse_"): return True
    if low.startswith("mon_") or "/monsters/" in rel.lower() or "/monster/" in rel.lower():
        if set(low.split("_")) & FANTASY_KEEP: return False
        if any(k in low for k in POSTAPOC_SUBSTR): return True
    return bool(set(low.split("_")) & MODERN_TOKENS)

def collect(name, src):
    seen, kept, dropped = set(), defaultdict(list), Counter()
    for root, _, files in os.walk(src):
        for fn in sorted(files):
            if not fn.lower().endswith(".png"): continue
            stem = fn[:-4]
            if FRAGMENT.search(stem): continue
            rel = os.path.join(root, fn).replace(src + os.sep, "")
            cat = category(rel); key = re.sub(r"_\d+$", "", stem)
            gkey = (cat, key)
            if gkey in seen: continue
            seen.add(gkey)
            if is_modern(stem, rel): dropped[cat] += 1; continue
            kept[cat].append((stem, os.path.join(root, fn)))
    return kept, dropped

def pack(atlas_name, slug, tiles, page, rows_n):
    sheet = Image.new("RGBA", (COLS*CELL, rows_n*CELL), (0,0,0,0)); names=[]
    for i,(stem,path) in enumerate(tiles):
        try: im = Image.open(path).convert("RGBA")
        except Exception: names.append(""); continue
        if im.size != (CELL,CELL): im.thumbnail((CELL,CELL), Image.NEAREST)
        ox,oy=(CELL-im.width)//2,(CELL-im.height)//2; r,c=divmod(i,COLS)
        sheet.alpha_composite(im,(c*CELL+ox, r*CELL+oy)); names.append(stem)
    fn = f"{slug}{('_'+str(page)) if page else ''}.png"; sheet.save(os.path.join(OUT, fn))
    return {"name": atlas_name + (f" {page}" if page else ""), "file": fn, "rows": rows_n, "count": len(tiles), "tiles": names}

manifest = {"cell": CELL, "cols": COLS, "atlases": []}
order = ["furniture","terrain","monsters","magiclysm","megafauna","items","fields","field","traps","trap","misc","spell","apparel","other"]
data = {name: collect(name, src) for name, src in SOURCES}
grand_keep = grand_drop = 0
for cat in order:
    for name, _ in SOURCES:
        kept, dropped = data[name]
        tiles = sorted(kept.get(cat, []))
        if not tiles: continue
        grand_keep += len(tiles)
        per = PAGE_ROWS*COLS; pages = (len(tiles)+per-1)//per
        an = f"{name} {cat}"; sl = f"{name}_{cat}"
        for pg in range(pages):
            chunk = tiles[pg*per:(pg+1)*per]
            manifest["atlases"].append(pack(an, sl, chunk, pg+1 if pages>1 else 0, (len(chunk)+COLS-1)//COLS))
        print(f"{an:22s} {len(tiles):5d}  ({pages} sheet/s)")
for name,_ in SOURCES: grand_drop += sum(data[name][1].values())

# Repackaged single-crop tiles (scripts/msx/quarter_crops.py): one crop per quarter × 4 growth stages.
CROPS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(OUT))), "scripts/msx/crops")
if os.path.isdir(CROPS_DIR):
    crop_tiles = sorted((fn[:-4], os.path.join(CROPS_DIR, fn)) for fn in os.listdir(CROPS_DIR) if fn.endswith(".png"))
    if crop_tiles:
        manifest["atlases"].append(pack("crops (quartered)", "crops_view", crop_tiles, 0, (len(crop_tiles)+COLS-1)//COLS))
        grand_keep += len(crop_tiles)
        print(f"crops (quartered)      {len(crop_tiles)}")

json.dump(manifest, open(os.path.join(OUT,"manifest.json"),"w"))
print(f"\nTOTAL shown: {grand_keep}   dropped: {grand_drop}")
