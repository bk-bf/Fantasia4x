#!/usr/bin/env python3
"""Recursively pack EVERY nested png in UltimateCataclysm into the viewer, minus unfitting (modern) tiles.
Collapses only redundant autotile fragments (center/corner/edge/end/t_connection) and numbered duplicates
(t_grass_0/_1/... -> one); keeps every otherwise-distinct sprite (directional, seasonal, items, monsters).
Strips modern: vehicle/appliance/overmap/sci-fi folders, vp_/flag prefixes, gun/ammo/electronics tokens.
Output: per-category 32x32 atlases (paged to fit the browser canvas) + manifest.json."""
import os, re, json
from collections import defaultdict, Counter
from PIL import Image

SRC = "/home/kirill/Documents/Projects/CDDA-Tilesets/gfx/UltimateCataclysm"
OUT = os.path.dirname(os.path.abspath(__file__))
CELL, COLS, PAGE_ROWS = 32, 16, 150          # 150 rows * 32 * 4x zoom < canvas limit

FRAGMENT = re.compile(r"_(center|corner_(ne|nw|se|sw)|edge_(ew|ns)|end_piece_[news]|t_connection_[news])$")
DROP_FOLDERS = {"vehicle","vehicles","appliances","overmap","layers","character",
                "aftershock","exodii","no_hope","dinomod","power_leech","hacks","corpses"}
DROP_PREFIX  = ("vp_","national_","pride_","road_","int1_","int2_","int3_","frame_","xlframe_","hdframe_")
MODERN_TOKENS = {
 "gun","guns","rifle","pistol","shotgun","smg","revolver","carbine","sniper","handgun","ar15","ak47",
 "ammo","bullet","bullets","magazine","mag","grenade","grenades","rocket","missile","launcher","taser",
 "flamethrower","gauge","casing","shell","shells","barrel9",
 "electronic","electronics","battery","batteries","circuit","processor","computer","laptop","smartphone",
 "phone","cellphone","tv","television","radio","antenna","transmitter","solar","alternator","gasoline",
 "diesel","propane","kerosene","fuel","cbm","bionic","bionics","cyber","robot","drone","turret","nanofab",
 "reactor","plutonium","uranium","atomic","nuclear","laser","plasma","emp","kevlar","ballistic","railgun",
 "car","cars","truck","motorcycle","bicycle","bike","atv","motor","engine","chainsaw","jackhammer","welder",
 "soldering","multitool","cigarette","cigarettes","cigar","soda","cola","mp3","flashlight","plastic","mp5mag","m17",
}
CAT_MAP = {"overlay":"apparel"}

def category(rel):
    parts = rel.split(os.sep)
    cat = parts[1] if len(parts) > 1 else parts[0]
    if cat == "mods" and len(parts) > 2: cat = parts[2]
    cat = CAT_MAP.get(cat, cat)
    if cat not in {"items","apparel","terrain","monsters","furniture","fields","magiclysm","traps","megafauna"}:
        cat = "other"
    return cat

def is_modern(stem, rel):
    if set(rel.lower().split(os.sep)) & DROP_FOLDERS: return True
    if stem.startswith(DROP_PREFIX): return True
    return bool(set(stem.lower().split("_")) & MODERN_TOKENS)

# collect: one entry per distinct sprite (drop fragments + numbered dups)
seen, kept = set(), defaultdict(list)   # cat -> [(stem, abspath)]
dropped = Counter()
for root, _, files in os.walk(SRC):
    for fn in sorted(files):
        if not fn.lower().endswith(".png"): continue
        stem = fn[:-4]
        if FRAGMENT.search(stem): continue
        key = re.sub(r"_\d+$", "", stem)          # collapse numbered duplicates
        rel = os.path.join(root, fn).replace(SRC + os.sep, "")
        gkey = (category(rel), key)
        if gkey in seen: continue
        seen.add(gkey)
        if is_modern(stem, rel): dropped[category(rel)] += 1; continue
        kept[category(rel)].append((stem, os.path.join(root, fn)))

def pack(cat, tiles, page, rows_n):
    sheet = Image.new("RGBA", (COLS*CELL, rows_n*CELL), (0,0,0,0)); names=[]
    for i,(stem,path) in enumerate(tiles):
        try: im = Image.open(path).convert("RGBA")
        except Exception: names.append(""); continue
        if im.size != (CELL,CELL): im.thumbnail((CELL,CELL), Image.NEAREST)
        ox,oy=(CELL-im.width)//2,(CELL-im.height)//2; r,c=divmod(i,COLS)
        sheet.alpha_composite(im,(c*CELL+ox, r*CELL+oy)); names.append(stem)
    fn = f"{cat}{('_'+str(page)) if page else ''}.png"; sheet.save(os.path.join(OUT, fn))
    return {"name": cat + (f" {page}" if page else ""), "file": fn, "rows": rows_n, "count": len(tiles), "tiles": names}

manifest = {"cell": CELL, "cols": COLS, "atlases": []}
order = ["furniture","terrain","monsters","magiclysm","megafauna","items","fields","traps","apparel","other"]
total = 0
for cat in order + [c for c in kept if c not in order]:
    tiles = sorted(kept.get(cat, [])); total += len(tiles)
    if not tiles: continue
    per = PAGE_ROWS*COLS
    pages = (len(tiles)+per-1)//per
    for pg in range(pages):
        chunk = tiles[pg*per:(pg+1)*per]
        manifest["atlases"].append(pack(cat, chunk, pg+1 if pages>1 else 0, (len(chunk)+COLS-1)//COLS))
    print(f"{cat:10s} {len(tiles):5d}  ({pages} sheet/s)")
json.dump(manifest, open(os.path.join(OUT,"manifest.json"),"w"))
print(f"\nTOTAL shown: {total}   dropped(modern): {sum(dropped.values())}  {dict(dropped)}")
