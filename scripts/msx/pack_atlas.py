#!/usr/bin/env python3
"""Pack every MShockXotto+ tile referenced by {"sheet":"mshock","tile":X} in the 5 DB files
into a single bundled game atlas + a name->cellIndex map.
Outputs:
  static/tilesets/mshock_atlas.png            (16-col grid of 32x32 cells, magenta-keyed transparent)
  src/lib/game/core/mshock-atlas.json         ({ "<tile>": <cellIndex> })
Re-run after editing charSpans so newly-referenced tiles get bundled."""
import re, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "src/lib/game/database")
SRC = "/home/kirill/Documents/Projects/CDDA-Tilesets/gfx/MShockXotto+"
PNG_OUT = os.path.join(ROOT, "static/tilesets/mshock_atlas.png")
JSON_OUT = os.path.join(ROOT, "src/lib/game/core/mshock-atlas.json")
CELL, COLS = 32, 16

# 1) collect referenced tile stems
refs = set()
for f in ("subterrains", "resources", "buildings", "creatures", "items"):
    s = open(os.path.join(DB, f + ".jsonc")).read()
    refs.update(re.findall(r'"sheet"\s*:\s*"mshock"\s*,\s*"tile"\s*:\s*"([^"]+)"', s))
refs = sorted(refs)
print(f"referenced mshock tiles: {len(refs)}")

# 2) stem -> source path
stem2path = {}
for root, _, files in os.walk(SRC):
    for fn in files:
        if fn.lower().endswith(".png"):
            stem2path.setdefault(fn[:-4], os.path.join(root, fn))

missing = [t for t in refs if t not in stem2path]
if missing:
    print(f"WARN {len(missing)} referenced tiles not found as files:", missing[:15])

usable = [t for t in refs if t in stem2path]
rows = (len(usable) + COLS - 1) // COLS
sheet = Image.new("RGBA", (COLS * CELL, rows * CELL), (0, 0, 0, 0))
index = {}
for i, stem in enumerate(usable):
    try:
        im = Image.open(stem2path[stem]).convert("RGBA")
    except Exception as e:
        print("skip", stem, e); continue
    if im.size != (CELL, CELL):
        im.thumbnail((CELL, CELL), Image.NEAREST)
    ox, oy = (CELL - im.width) // 2, (CELL - im.height) // 2
    r, c = divmod(i, COLS)
    sheet.alpha_composite(im, (c * CELL + ox, r * CELL + oy))
    index[stem] = i

os.makedirs(os.path.dirname(PNG_OUT), exist_ok=True)
sheet.save(PNG_OUT)
json.dump(index, open(JSON_OUT, "w"), indent=0)
print(f"wrote {PNG_OUT}  ({COLS}x{rows} cells, {len(index)} tiles)")
print(f"wrote {JSON_OUT}")
