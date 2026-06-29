#!/usr/bin/env python3
"""Pack Ultica (CDDA-Tilesets) named PNGs into 32x32 browsing atlases + a name manifest.
Tiles live as pngs_normal_32x32/<category>/<tile_id>/<id>_<variant>.png (CDDA autotiles).
We pick ONE representative sprite per tile-id and pack per category.
Output: this folder's *.png atlases + manifest.json (consumed by ../ultica-viewer.html)."""
import os, json, re
from collections import defaultdict
from PIL import Image

SRC  = "/home/kirill/Documents/Projects/CDDA-Tilesets/gfx/UltimateCataclysm/pngs_normal_32x32"
OUT  = os.path.dirname(os.path.abspath(__file__))
CELL = 32
COLS = 16

CATS = {
    "furniture": lambda p: "/furniture/" in p,
    "terrain":   lambda p: "/terrain/" in p,
    "monsters":  lambda p: "/monsters/" in p,
    "items":     lambda p: "/items/" in p,
}

VARIANT = re.compile(
    r"_(center|unconnected|corner_(ne|nw|se|sw)|edge_(ew|ns)|end_piece_[news]"
    r"|t_connection_[news]|season_(summer|winter|spring|autumn))$")

def tile_id(stem):
    s = VARIANT.sub("", stem)
    s = re.sub(r"_\d+$", "", s)   # drop numbered random variants
    return s

def rep_rank(stem, tid):
    if stem == tid: return 0
    if stem == tid + "_unconnected": return 1
    if stem == tid + "_center": return 2
    if stem.endswith("_season_summer"): return 3
    if stem == tid + "_0": return 4
    return 9

manifest = {"cell": CELL, "cols": COLS, "atlases": []}
for cat, pred in CATS.items():
    groups = defaultdict(list)   # tid -> [(rank, path)]
    for root, _, files in os.walk(SRC):
        for fn in files:
            if not fn.lower().endswith(".png"): continue
            p = os.path.join(root, fn)
            if not pred(p.replace(SRC, "")): continue
            stem = fn[:-4]
            tid = tile_id(stem)
            groups[tid].append((rep_rank(stem, tid), p))
    ids = sorted(groups)
    if not ids:
        print("(empty)", cat); continue
    rows = (len(ids) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (COLS * CELL, rows * CELL), (0, 0, 0, 0))
    names = []
    for i, tid in enumerate(ids):
        _, path = min(groups[tid], key=lambda t: t[0])
        try:
            im = Image.open(path).convert("RGBA")
        except Exception:
            names.append(""); continue
        if im.size != (CELL, CELL):
            im.thumbnail((CELL, CELL), Image.NEAREST)
        ox, oy = (CELL - im.width) // 2, (CELL - im.height) // 2
        r, c = divmod(i, COLS)
        sheet.alpha_composite(im, (c * CELL + ox, r * CELL + oy))
        names.append(tid)
    fn = f"{cat}.png"
    sheet.save(os.path.join(OUT, fn))
    manifest["atlases"].append({"name": cat, "file": fn, "rows": rows, "count": len(ids), "tiles": names})
    print(f"{cat:10s} {len(ids):5d} ids -> {fn} ({COLS}x{rows})")

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"))
print("wrote manifest.json")
