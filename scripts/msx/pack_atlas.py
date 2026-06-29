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

GROUND = re.compile(r"^t_(dirt|grass|sand|moss|clay|claymound|mud|water_dp|water_sh)(_|$)")
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
# autotile bases → every variant sprite, plus the extra center frames (center2/3/4) used for the
# animated-water shimmer and for plain center variety (only those that exist in the set are kept).
for base in re.findall(r'"autotile"\s*:\s*"([^"]+)"', open(os.path.join(DB, "subterrains.jsonc")).read()):
    refs.add(base)
    refs.update(f"{base}_{v}" for v in AUTOTILE_VARIANTS)
    refs.update(f"{base}_center{n}" for n in (2, 3, 4))
refs = sorted(refs)

# t_mud_bog: a murky-green hue-shift of t_mud, baked here (full-colour sprites ignore the fg tint, so
# the bog hue must live in the pixels). Per-channel multiply pushes the brown mud toward olive/green.
BOG_TINT = (0.60, 0.95, 0.45)
def make_bog():
    src = ULTICA.get("t_mud") or MSHOCK.get("t_mud")
    if not src: return None
    im = Image.open(src).convert("RGBA"); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (int(r * BOG_TINT[0]), int(g * BOG_TINT[1]), int(b * BOG_TINT[2]), a)
    return im
SYNTH = {}
_bog = make_bog()
if _bog: SYNTH["t_mud_bog"] = _bog

usable = [t for t in refs if resolve(t) or t in SYNTH]
missing = [t for t in refs if not resolve(t) and t not in SYNTH]
if missing:
    print(f"WARN {len(missing)} tiles missing in both sets:", missing[:12])

# Shelf-pack at NATIVE size (capped at MAXPX) so big sprites stay big — CDDA trees are 96x96 (3×3
# cells), drawn bottom-anchored & overflowing by the renderer (qW=tileW*w/32, qH=tileH*h/32). The
# renderer reads each tile's [x,y,w,h] rect, so any layout works; we just pack tightly into rows.
MAXPX, ATLAS_W = 96, 512
loaded = []
for stem in usable:
    try:
        im = SYNTH[stem] if stem in SYNTH else Image.open(resolve(stem)).convert("RGBA")
    except Exception as e:
        print("skip", stem, e); continue
    if im.width > MAXPX or im.height > MAXPX:
        im.thumbnail((MAXPX, MAXPX), Image.NEAREST)
    loaded.append((stem, im))

x = y = row_h = 0
placed = []  # (stem, im, px, py)
for stem, im in loaded:
    w, h = im.size
    if x + w > ATLAS_W:
        x = 0; y += row_h; row_h = 0
    placed.append((stem, im, x, y)); x += w; row_h = max(row_h, h)
atlas_h = y + row_h

sheet = Image.new("RGBA", (ATLAS_W, atlas_h), (0, 0, 0, 0))
tiles = []
for stem, im, px, py in placed:
    sheet.alpha_composite(im, (px, py))
    tiles.append([stem, px, py, im.width, im.height])

os.makedirs(os.path.dirname(PNG_OUT), exist_ok=True)
sheet.save(PNG_OUT)
json.dump({"cell_w": CW, "cell_h": CH, "cols": COLS, "tiles": tiles}, open(JSON_OUT, "w"))
gnd = sum(1 for t in tiles if GROUND.match(t[0]))
big = sum(1 for t in tiles if t[3] > 32 or t[4] > 32)
print(f"wrote atlas {ATLAS_W}x{atlas_h}, {len(tiles)} tiles ({gnd} ground from Ultica), {big} larger-than-1-cell")
