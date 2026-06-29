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
# Berry-bush pool: base + per-season (_summer/_winter/_autumn) + _harvested variants. ResourceObjectService
# buckets them — season suffix → that season's pool (falling back to base), `harvested` → the foraged-bush
# pool the renderer swaps to while the bush is on cooldown. (Other generic bush/scrubland tiles removed.)
BERRY = [
    "t_shrub", "t_shrub_winter",
    "t_shrub_blackberry", "t_shrub_blackberry_summer", "t_shrub_blackberry_winter", "t_shrub_blackberry_harvested",
    "t_shrub_blueberry", "t_shrub_blueberry_summer", "t_shrub_blueberry_winter", "t_shrub_blueberry_harvested",
    "t_shrub_huckleberry", "t_shrub_huckleberry_summer", "t_shrub_huckleberry_winter", "t_shrub_huckleberry_harvested",
    "t_shrub_raspberry", "t_shrub_raspberry_summer", "t_shrub_raspberry_winter", "t_shrub_raspberry_harvested",
    "t_shrub_strawberry", "t_shrub_strawberry_summer", "t_shrub_strawberry_winter", "t_shrub_strawberry_harvested",
    "t_shrub_peanut", "t_shrub_peanut_autumn", "t_shrub_peanut_winter", "t_shrub_peanut_harvested",
    "t_shrub_rose_autumn", "t_shrub_rose_winter", "t_shrub_rose_harvested"
]
GRAPE = ["t_shrub_grape", "t_shrub_grape_summer", "t_shrub_grape_winter", "t_shrub_grape_harvested"]
# Crops: the 4 generic growth stages IN ORDER (seed→seedling→mature→harvest). A def with a `crop`
# field renders the stage by the tile's growth% (not season / not random) — see applyResourceToGrid.
# Crops use the quartered generic_crop tiles (scripts/msx/quarter_crops.py): one crop per quarter,
# growing through 4 stages. TL wheat · BR rye · BL greens (cabbage/kale/veg) · TR flower (fruit/herb).
def crop_set(qtype):
    return [f"crop_{qtype}_{s}" for s in ("seed", "seedling", "mature", "harvest")]
CROP_QUARTER = {
    "crop_wheat": "wheat", "wild_barley": "wheat",
    "crop_rye": "rye", "wild_rye": "rye",
    "crop_kale": "greens", "crop_cabbage": "greens", "crop_turnip": "greens", "crop_radish": "greens",
    "crop_onion": "greens", "crop_peas": "greens", "crop_beans": "greens",
    "wild_cabbage": "greens", "wild_kale": "greens", "wild_turnip": "greens",
    "wild_onion": "greens", "wild_radish": "greens",
    "crop_berries": "flower", "crop_grapes": "flower", "crop_apples": "flower",
    "crop_flax": "flower", "crop_cotton": "flower", "crop_thyme": "flower", "crop_mint": "flower",
}
# Crops that get a dedicated single sprite (not a generic quarter set).
CROP_OVERRIDE = {"crop_pumpkin": ["f_wildpumpkin"], "crop_turnip": ["f_wildsbeet"]}
FLOWERS = ["f_dandelion", "f_dandelion_season_summer", "f_dandelion_season_autumn", "f_dandelion_season_winter",
           "f_datura", "f_flower_spurge", "f_flower_tulip_1",
           "f_mustard_spring", "f_mustard_summer", "f_mustard_autumn"]

# Trees (Ultica 96x96, rendered bottom-anchored & overflowing — see grid-renderer). Seasonal + harvested
# variants are bucketed by ResourceObjectService. Magic groves carry `glow` so they ignore season and
# always show their magical sprite, lit by the grove's colored glow emitter (hue).
TREES = {
    "pine_tree": ["pine_yar"],  # evergreen conifer
    "yew_tree": ["pine_yar"],
    "birch_tree": ["t_tree_birch", "t_tree_birch_autumn_1", "t_tree_birch_winter",
                   "t_tree_birch_harvested", "t_tree_birch_harvested_autumn_1", "t_tree_birch_harvested_winter"],
    "oak_tree": ["t_tree_beech_season_spring", "t_tree_beech_season_summer",
                 "t_tree_beech_season_autumn", "t_tree_beech_season_winter"],
    "ash_tree": ["t_tree_elm_spring", "t_tree_elm_summer", "t_tree_elm_autumn", "t_tree_elm_winter"],
    "apple_tree": ["t_tree_apple", "t_tree_apple_autumn", "t_tree_apple_winter",
                   "t_tree_apple_harvested", "t_tree_apple_harvested2"],
    "dead_tree": ["t_tree_dead", "deadpine_yar"],
    # magic groves (glow): season-independent
    "heartwood_grove": ["t_tree_cherry"],
    "moonwood_grove": ["t_tree_fungal00", "t_tree_fungal01", "t_tree_fungal02", "t_tree_fungal03"],
    "ironwood_grove": ["t_tree_fungal04", "t_tree_fungal05", "t_tree_fungal06"],
    "emberwood_grove": ["t_tree_cherry_autumn1", "t_tree_maple_autumn", "t_tree_season_autumn"],
}

# def id -> ordered list of tiles (variety / season pool). Crops + wild veg handled by tiles_for().
MAP = {
  # ── subterrains: fertile/forest ground = GRASS (plants layer on top); barren/debris = bare dirt ──
  "dirt": DIRT, "tree_stump": DIRT, "fallen_logs": DIRT, "dead_trees": DIRT,
  "grass": GRASS, "deep_grass": GRASS, "tall_grass": GRASS, "terra_preta": GRASS,
  "tree": GRASS, "bush": GRASS, "scrubland": ["t_grass_dead_unconnected", "t_grass"], "wildflowers": GRASS,
  "mushroom_patch": GRASS,
  # autotile grounds (autotile field set manually in subterrains.jsonc, like dirt) — charSpans = fallback pool
  "savanna": ["t_sand_unconnected", "t_sand_center2", "t_sand_center3", "t_sand_center4"],
  "moss": ["t_moss_unconnected", "t_moss_center2"],
  # ── resources: the green / plants painted ON TOP of soil ──
  "grass_patch": GRASS, "tall_grass_patch": GRASS_TALL, "deep_grass_patch": GRASS_LONG,
  "wildflower_patch": FLOWERS, "scrub_patch": ["t_grass_dead_unconnected", "t_grass"], "berry_bush": BERRY, "wild_grapevine": GRAPE,
  **TREES,
}

def tiles_for(cur):
    if cur in CROP_OVERRIDE: return CROP_OVERRIDE[cur]
    if cur in CROP_QUARTER: return crop_set(CROP_QUARTER[cur])
    if cur.startswith("crop_"): return crop_set("wheat")  # default any unlisted crop to grain
    if cur in MAP: return MAP[cur]
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
