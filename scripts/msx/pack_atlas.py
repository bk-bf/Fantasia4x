#!/usr/bin/env python3
"""Pack referenced CDDA tiles into the bundled game atlas, KEEPING tall sprites tall.
Source policy for cohesion:
  • GROUND (t_dirt*, t_grass*) → Ultica (its dirt autotiles blend grass↔dirt).
  • trees/bushes/ferns (t_shrub*, t_tree*, t_fern*, t_underbrush*) → MShockXotto+.
  • everything else → MShock, Ultica fallback.
Also packs every autotile variant (t_dirt_center/edge/corner/end/t_connection/unconnected) for any
subterrain with an "autotile":"<base>" field, even though only <base> appears literally in charSpans.
Layout: uniform 32-wide x 64-tall cells (16 cols), sprites scaled to fit + bottom-anchored.
Outputs static/tilesets/mshock_atlas.png + src/lib/game/core/mshock-atlas.json."""
import re, json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "src/lib/game/database")
GFX = "/home/kirill/Documents/Projects/CDDA-Tilesets/gfx"
MSHOCK_SRC, ULTICA_SRC = f"{GFX}/MShockXotto+", f"{GFX}/UltimateCataclysm"
PNG_OUT = os.path.join(ROOT, "static/tilesets/mshock_atlas.png")
JSON_OUT = os.path.join(ROOT, "src/lib/game/core/mshock-atlas.json")
CW, CH, COLS = 32, 64, 16

def index(src):
    m = {}
    for root, _, files in os.walk(src):
        for fn in files:
            if fn.lower().endswith(".png"):
                m.setdefault(fn[:-4], os.path.join(root, fn))
    return m
MSHOCK, ULTICA = index(MSHOCK_SRC), index(ULTICA_SRC)
# Repackaged single-crop tiles (quarter_crops.py): crop_<type>_<stage>. Take priority for crop_* names.
CROPS = index(os.path.join(ROOT, "scripts/msx/crops"))

GROUND = re.compile(r"^t_(dirt|grass)(_|$)")
TREEBUSH = re.compile(r"^t_(shrub|tree|fern|underbrush)(_|$)")
def resolve(stem):
    if stem in CROPS: return CROPS[stem]
    if GROUND.match(stem) and stem in ULTICA: return ULTICA[stem]
    if TREEBUSH.match(stem) and stem in MSHOCK: return MSHOCK[stem]
    return MSHOCK.get(stem) or ULTICA.get(stem)

AUTOTILE_VARIANTS = ["center", "edge_ns", "edge_ew", "corner_ne", "corner_nw", "corner_se",
    "corner_sw", "end_piece_n", "end_piece_e", "end_piece_s", "end_piece_w",
    "t_connection_n", "t_connection_e", "t_connection_s", "t_connection_w", "unconnected"]

refs = set()
for f in ("subterrains", "resources", "buildings", "creatures", "items"):
    refs.update(re.findall(r'"sheet"\s*:\s*"mshock"\s*,\s*"tile"\s*:\s*"([^"]+)"',
                           open(os.path.join(DB, f + ".jsonc")).read()))
# autotile bases → every variant sprite
for base in re.findall(r'"autotile"\s*:\s*"([^"]+)"', open(os.path.join(DB, "subterrains.jsonc")).read()):
    refs.add(base)
    refs.update(f"{base}_{v}" for v in AUTOTILE_VARIANTS)
refs = sorted(refs)

usable = [t for t in refs if resolve(t)]
missing = [t for t in refs if not resolve(t)]
if missing:
    print(f"WARN {len(missing)} tiles missing in both sets:", missing[:12])

rows = (len(usable) + COLS - 1) // COLS
sheet = Image.new("RGBA", (COLS * CW, rows * CH), (0, 0, 0, 0))
tiles = []
for i, stem in enumerate(usable):
    try:
        im = Image.open(resolve(stem)).convert("RGBA")
    except Exception as e:
        print("skip", stem, e); continue
    if im.width > CW or im.height > CH:
        im.thumbnail((CW, CH), Image.NEAREST)
    w, h = im.width, im.height
    col, row = i % COLS, i // COLS
    x = col * CW + (CW - w) // 2
    y = row * CH + (CH - h)
    sheet.alpha_composite(im, (x, y))
    tiles.append([stem, x, y, w, h])

os.makedirs(os.path.dirname(PNG_OUT), exist_ok=True)
sheet.save(PNG_OUT)
json.dump({"cell_w": CW, "cell_h": CH, "cols": COLS, "tiles": tiles}, open(JSON_OUT, "w"))
gnd = sum(1 for t in tiles if GROUND.match(t[0]))
print(f"wrote atlas {COLS}x{rows} cells, {len(tiles)} tiles ({gnd} ground from Ultica), {sum(1 for t in tiles if t[4]>CW)} tall")
