#!/usr/bin/env python3
"""Phase 1: wire the ground/plant layer to MShock variant SETS (multi-entry charSpans → the
existing fantasia-world chars[] position-hash gives per-tile variety). Soil subterrains become
BARE dirt (grass/plants live as resource objects on top); plant resources get proper variant sets.
Summer/base variants only (no season state yet). Other defs keep their single-tile mapping.
Validates JSON before writing."""
import re, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "src/lib/game/database")

DIRT = ["t_dirt_unconnected", "t_dirt_center2", "t_dirt_center3", "t_dirt_center4"]
GRASS = ["t_grass", "t_grass_center2", "t_grass_center3", "t_grass_center4"]
GRASS_LONG = ["t_grass_long_unconnected", "t_grass_long_unconnected2", "t_grass_long_unconnected3", "t_grass_long_unconnected4"]
GRASS_TALL = ["t_grass_tall_unconnected", "t_grass_tall_unconnected2", "t_grass_tall_unconnected3", "t_grass_tall_unconnected4"]
SHRUB = ["t_shrub", "t_shrub_lilac", "t_shrub_hydrangea", "t_shrub_rose"]
BERRY = ["t_shrub_blueberry", "t_shrub_blackberry", "t_shrub_raspberry", "t_shrub_strawberry"]
FERN = ["t_fern", "t_underbrush"]

# def id -> ordered list of mshock tiles (variety pool)
MAP = {
  # ── subterrains: soil ladder + forest/plain ground = BARE earth/forest floor ──
  "dirt": DIRT, "grass": DIRT, "deep_grass": DIRT, "tall_grass": DIRT, "terra_preta": DIRT, "savanna": DIRT,
  "tree": GRASS,            # Forest Floor ground (the tree itself is a resource on top)
  "bush": SHRUB, "scrubland": ["t_shrub", "t_grass_dead_unconnected"], "wildflowers": GRASS,
  "tree_stump": DIRT, "fallen_logs": DIRT, "dead_trees": DIRT, "moss": GRASS, "mushroom_patch": GRASS,
  # ── resources: the green / plants painted ON TOP of soil ──
  "grass_patch": GRASS, "tall_grass_patch": GRASS_TALL, "deep_grass_patch": GRASS_LONG,
  "wildflower_patch": GRASS, "scrub_patch": SHRUB, "berry_bush": BERRY, "wild_grapevine": ["t_shrub_grape"],
  "pine_tree": ["t_tree_pine"], "birch_tree": ["t_tree_birch"], "oak_tree": ["t_tree", "t_tree_beech_season_summer"],
  "apple_tree": ["t_tree_apple"], "ash_tree": ["t_tree"], "yew_tree": ["t_tree_pine"],
  "dead_tree": ["t_tree_dead"], "mushroom_patch_res": ["t_fern"],
}

def arr(tiles):
    return "[ " + ", ".join(f'{{"sheet": "mshock", "tile": "{t}"}}' for t in tiles) + " ]"

ID_RE = re.compile(r'"id"\s*:\s*"([^"]+)"')
CS_RE = re.compile(r'^(\s*"charSpans"\s*:\s*)(\[.*\])(.*)$')
def strip_jsonc(s):
    s = re.sub(r'//.*', '', s); s = re.sub(r'/\*.*?\*/', '', s, flags=re.S); return re.sub(r',(\s*[}\]])', r'\1', s)

total = 0
for f in ("subterrains", "resources"):
    path = os.path.join(DB, f + ".jsonc"); lines = open(path).read().split("\n")
    cur = ""; n = 0
    for i, ln in enumerate(lines):
        m = ID_RE.search(ln)
        if m: cur = m.group(1)
        cm = CS_RE.match(ln)
        if cm and cur in MAP:
            lines[i] = f"{cm.group(1)}{arr(MAP[cur])}{cm.group(3)}"; n += 1
    new = "\n".join(lines)
    try: json.loads(strip_jsonc(new))
    except Exception as e:
        print(f"!! {f}: JSON broke ({e}); NOT writing"); sys.exit(1)
    open(path, "w").write(new)
    print(f"{f:12s} remapped {n} defs to variant sets")
    total += n
print(f"\nTOTAL terrain/plant defs wired: {total}")
