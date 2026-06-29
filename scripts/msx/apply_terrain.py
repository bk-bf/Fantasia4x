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
# Berry/shrub pools include base + per-season variants; ResourceObjectService buckets them by the
# _season_/_summer/_winter/_autumn/_spring suffix in the name, and the renderer picks the current
# season's pool (falling back to the un-suffixed base when a season has no specific sprite).
SHRUB = ["t_shrub", "t_shrub_winter", "t_shrub_lilac_spring", "t_shrub_lilac_summer", "t_shrub_lilac_autumn",
         "t_shrub_lilac_winter", "t_shrub_hydrangea", "t_shrub_hydrangea_summer", "t_shrub_hydrangea_winter",
         "t_shrub_rose_autumn", "t_shrub_rose_winter", "t_shrub_peanut", "t_shrub_peanut_autumn", "t_shrub_peanut_winter"]
BERRY = ["t_shrub_blueberry", "t_shrub_blueberry_summer", "t_shrub_blueberry_winter",
         "t_shrub_blackberry", "t_shrub_blackberry_summer", "t_shrub_blackberry_winter",
         "t_shrub_raspberry", "t_shrub_raspberry_summer", "t_shrub_raspberry_winter",
         "t_shrub_strawberry", "t_shrub_strawberry_summer", "t_shrub_strawberry_winter",
         "t_shrub_huckleberry", "t_shrub_huckleberry_summer", "t_shrub_huckleberry_winter"]
GRAPE = ["t_shrub_grape", "t_shrub_grape_summer", "t_shrub_grape_winter"]
# Crops: the 4 generic growth stages IN ORDER (seed→seedling→mature→harvest). A def with a `crop`
# field renders the stage by the tile's growth% (not season / not random) — see applyResourceToGrid.
CROP_STAGES = ["generic_crop_seed", "generic_crop_seedling", "generic_crop_mature", "generic_crop_harvest"]
FLOWERS = ["f_dandelion", "f_dandelion_season_summer", "f_dandelion_season_autumn", "f_dandelion_season_winter",
           "f_datura", "f_flower_spurge", "f_flower_tulip_1",
           "f_mustard_spring", "f_mustard_summer", "f_mustard_autumn"]
CARROT = ["f_carrot_wild", "f_carrot_wild_season_autumn", "f_carrot_wild_season_winter"]
WILDVEG = {"wild_cabbage", "wild_turnip", "wild_onion", "wild_kale", "wild_radish", "wild_beans", "wild_peas"}

# def id -> ordered list of tiles (variety / season pool). Crops + wild veg handled by tiles_for().
MAP = {
  # ── subterrains: fertile/forest ground = GRASS (plants layer on top); barren/debris = bare dirt ──
  "dirt": DIRT, "tree_stump": DIRT, "fallen_logs": DIRT, "dead_trees": DIRT,
  "grass": GRASS, "deep_grass": GRASS, "tall_grass": GRASS, "terra_preta": GRASS, "savanna": GRASS,
  "tree": GRASS, "bush": GRASS, "scrubland": ["t_shrub", "t_grass_dead_unconnected"], "wildflowers": GRASS,
  "moss": GRASS, "mushroom_patch": GRASS,
  # ── resources: the green / plants painted ON TOP of soil ──
  "grass_patch": GRASS, "tall_grass_patch": GRASS_TALL, "deep_grass_patch": GRASS_LONG,
  "wildflower_patch": FLOWERS, "scrub_patch": SHRUB, "berry_bush": BERRY, "wild_grapevine": GRAPE,
  "pine_tree": ["t_tree_pine"], "birch_tree": ["t_tree_birch"], "oak_tree": ["t_tree", "t_tree_beech_season_summer"],
  "apple_tree": ["t_tree_apple"], "ash_tree": ["t_tree"], "yew_tree": ["t_tree_pine"], "dead_tree": ["t_tree_dead"],
  "wild_barley": CROP_STAGES, "wild_rye": CROP_STAGES,
}

def tiles_for(cur):
    if cur in MAP: return MAP[cur]
    if cur.startswith("crop_"): return CROP_STAGES
    if cur in WILDVEG: return CARROT
    return None

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
        tl = tiles_for(cur) if cm else None
        if cm and tl:
            lines[i] = f"{cm.group(1)}{arr(tl)}{cm.group(3)}"; n += 1
    new = "\n".join(lines)
    try: json.loads(strip_jsonc(new))
    except Exception as e:
        print(f"!! {f}: JSON broke ({e}); NOT writing"); sys.exit(1)
    open(path, "w").write(new)
    print(f"{f:12s} remapped {n} defs to variant sets")
    total += n
print(f"\nTOTAL terrain/plant defs wired: {total}")
