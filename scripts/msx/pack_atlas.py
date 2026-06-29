#!/usr/bin/env python3
"""Pack every referenced MShock tile into a bundled game atlas, KEEPING tall sprites tall.
Layout: uniform 32-wide x 64-tall cells (16 cols). Each sprite is scaled to fit 32x64 (preserving
aspect), then placed BOTTOM-ANCHORED + horizontally centred in its cell — so trees/tall grass keep
their height and the renderer can overflow them upward (CDDA-style). Square tiles fill the lower 32px.
Outputs:
  static/tilesets/mshock_atlas.png
  src/lib/game/core/mshock-atlas.json   { cell_w, cell_h, cols, tiles: [[name,x,y,w,h], ...] }
Re-run after editing charSpans."""
import re, json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "src/lib/game/database")
# Search MShock first (preferred look), then Ultica as fallback for variants MShock lacks.
SRCS = ["/home/kirill/Documents/Projects/CDDA-Tilesets/gfx/MShockXotto+",
        "/home/kirill/Documents/Projects/CDDA-Tilesets/gfx/UltimateCataclysm"]
PNG_OUT = os.path.join(ROOT, "static/tilesets/mshock_atlas.png")
JSON_OUT = os.path.join(ROOT, "src/lib/game/core/mshock-atlas.json")
CW, CH, COLS = 32, 64, 16

refs = set()
resource_tiles = set()   # tiles used by resources.jsonc → bake a ground patch under them so their
                         # transparent pixels don't reveal the near-black subterrain bg (they're drawn
                         # baked into the single terrain grid, not a transparent overlay).
for f in ("subterrains", "resources", "buildings", "creatures", "items"):
    s = open(os.path.join(DB, f + ".jsonc")).read()
    found = re.findall(r'"sheet"\s*:\s*"mshock"\s*,\s*"tile"\s*:\s*"([^"]+)"', s)
    refs.update(found)
    if f == "resources":
        resource_tiles.update(found)
refs = sorted(refs)

stem2path = {}
for SRC in SRCS:
    for root, _, files in os.walk(SRC):
        for fn in files:
            if fn.lower().endswith(".png"):
                stem2path.setdefault(fn[:-4], os.path.join(root, fn))  # first wins → MShock priority

usable = [t for t in refs if t in stem2path]
missing = [t for t in refs if t not in stem2path]
if missing:
    print(f"WARN {len(missing)} referenced tiles missing as files:", missing[:12])

# Ground patch baked under resource sprites (bottom 32px) so they read as plant-on-grass, not
# plant-on-black. t_grass preferred; fall back to first dirt/grass-ish ground we can find.
GROUND = None
for g in ("t_grass", "t_grass_summer", "t_dirt_unconnected"):
    if g in stem2path:
        gi = Image.open(stem2path[g]).convert("RGBA")
        if gi.size != (CW, CW): gi = gi.resize((CW, CW), Image.NEAREST)
        GROUND = gi; break

rows = (len(usable) + COLS - 1) // COLS
sheet = Image.new("RGBA", (COLS * CW, rows * CH), (0, 0, 0, 0))
tiles = []
baked = 0
for i, stem in enumerate(usable):
    try:
        im = Image.open(stem2path[stem]).convert("RGBA")
    except Exception as e:
        print("skip", stem, e); continue
    if im.width > CW or im.height > CH:
        im.thumbnail((CW, CH), Image.NEAREST)   # fit, preserve aspect
    w, h = im.width, im.height
    col, row = i % COLS, i // COLS
    cellX, cellBottom = col * CW, row * CH + CH
    is_res = stem in resource_tiles and GROUND is not None
    if is_res:
        # bake a 32x32 grass patch at the cell bottom, then the sprite over it; the tile now spans the
        # full 32 width and at least 32 tall (taller if the sprite overhangs upward).
        sheet.alpha_composite(GROUND, (cellX, cellBottom - CW))
        sx = cellX + (CW - w) // 2
        sheet.alpha_composite(im, (sx, cellBottom - h))
        tw_ = CW
        th_ = max(h, CW)
        x, y = cellX, cellBottom - th_
        baked += 1
    else:
        w_ = w; x = cellX + (CW - w) // 2; y = cellBottom - h; tw_, th_ = w, h
        sheet.alpha_composite(im, (x, y))
    tiles.append([stem, x, y, tw_, th_])

os.makedirs(os.path.dirname(PNG_OUT), exist_ok=True)
sheet.save(PNG_OUT)
json.dump({"cell_w": CW, "cell_h": CH, "cols": COLS, "tiles": tiles}, open(JSON_OUT, "w"))
tall = sum(1 for t in tiles if t[4] > CW)
print(f"wrote {PNG_OUT}  ({COLS}x{rows} cells of {CW}x{CH}, {len(tiles)} tiles, {tall} tall>{CW}px, {baked} ground-baked)")
print(f"wrote {JSON_OUT}")
