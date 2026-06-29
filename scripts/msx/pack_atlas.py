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
for f in ("subterrains", "resources", "buildings", "creatures", "items"):
    s = open(os.path.join(DB, f + ".jsonc")).read()
    refs.update(re.findall(r'"sheet"\s*:\s*"mshock"\s*,\s*"tile"\s*:\s*"([^"]+)"', s))
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

rows = (len(usable) + COLS - 1) // COLS
sheet = Image.new("RGBA", (COLS * CW, rows * CH), (0, 0, 0, 0))
tiles = []
for i, stem in enumerate(usable):
    try:
        im = Image.open(stem2path[stem]).convert("RGBA")
    except Exception as e:
        print("skip", stem, e); continue
    if im.width > CW or im.height > CH:
        im.thumbnail((CW, CH), Image.NEAREST)   # fit, preserve aspect
    w, h = im.width, im.height
    col, row = i % COLS, i // COLS
    x = col * CW + (CW - w) // 2          # horizontally centred
    y = row * CH + (CH - h)              # BOTTOM-anchored in the 32x64 cell
    sheet.alpha_composite(im, (x, y))
    tiles.append([stem, x, y, w, h])

os.makedirs(os.path.dirname(PNG_OUT), exist_ok=True)
sheet.save(PNG_OUT)
json.dump({"cell_w": CW, "cell_h": CH, "cols": COLS, "tiles": tiles}, open(JSON_OUT, "w"))
tall = sum(1 for t in tiles if t[4] > CW)
print(f"wrote {PNG_OUT}  ({COLS}x{rows} cells of {CW}x{CH}, {len(tiles)} tiles, {tall} tall>{CW}px)")
print(f"wrote {JSON_OUT}")
