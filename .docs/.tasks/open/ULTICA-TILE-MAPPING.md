# Ultica Tile Mapping — Audit & Proposal

> **Related:** [ROADMAP](./ROADMAP.md) · source set: CDDA-Tilesets `gfx/UltimateCataclysm` (CC-BY-SA 3.0) · viewer: `static/dev/ultica-viewer.html`

Audit of `src/lib/game/database/*.jsonc` against the **UltimateCataclysm (Ultica)** tile vocabulary
(14,416 PNGs; namespaces `t_` terrain 3482, `f_` furniture 487, `mon_` creatures 401, items ~rest).
Goal: a candidate Ultica tile id for every entity that currently carries a bitlands `charSpans`, plus an
honest gap list. **This is a proposal — no `charSpans` were rewired.**

## How to browse / verify
1. `cd ../Fantasia4x-ultica && pnpm install` (worktree has no node_modules), run the dev server (it takes 5174 if main holds 5173).
2. Open `http://localhost:5174/dev/ultica-viewer.html` — filter box + hover-for-id + click-to-copy-id.
3. Atlases regenerate via `static/dev/ultica/pack.py` (re-point `SRC` if the CDDA checkout moves).

## Coverage scorecard

| Domain | Entities | Strong | Reuse/approx ⚠ | Gap ❌ |
|---|---|---|---|---|
| Buildings | 95 | ~70 | ~18 | ~7 (bespoke magic stations, ropewalk, heartwood joiner) |
| Creatures | 31 | 13 real animals + demon-spider | — | **17 D&D-type monsters** (goblin/orc/harpy/owlbear/hippogriff/gnoll/kobold/worg/aurochs/mammoth/…) |
| Resources | 81 | trees/grass/rock/water/clay/moss + crops (growth tiles) | gems→reuse t_rock | ore minerals (malachite/hematite/…), magic groves |
| Subterrains | 28 | dirt/grass/water/mud/clay/moss/rock/tree | savanna/bog/scrub/rapids→variant reuse | — |

**Headline:** environment + furniture + workshops are very well covered (the thing the current set lacked).
The two real holes are **fantasy creatures** and **ore/mineral nodes** — neither exists in a post-apoc set.

## ⭐ Free upgrade: autotiles
Ultica ships walls/floors/doors/fences as **full autotile sets** (`_center/_corner_*/_edge_*/_end_piece_*/_t_connection_*`).
Adopting these means *connected* walls/floors instead of one static glyph — a large visual jump over the current
single-tile-per-building model. Worth designing the new tile-ref schema to carry an autotile group, not just one id.

---

## Buildings (recommended Ultica id)

### Workshops / production
| db id | recommended | note |
|---|---|---|
| campfire | `f_firering` | or `f_brazier` |
| hearth | `f_fireplace` | |
| craft_spot / makers_bench / masons_bench / lapidary_bench / carpenter_bench / clockwork_bench / glyph_cutters_banker | `f_workbench` | generic bench; differentiate by tint/label |
| butcher_spot | `f_butcher_rack` | |
| dressing_stone | `f_anvil` ⚠ | stone slab — no exact tile |
| chopping_block | `t_stump` | tree stump reads perfectly |
| sawtable (Sawpit) | `f_workbench` ⚠ | no sawpit tile |
| pottery_kiln / advanced_kiln / porcelain_workshop | `f_clay_kiln` / `f_kiln_empty` | |
| charcoal_pit | `f_clay_kiln` ⚠ | or `f_firering` |
| ropewalk | `f_spinwheel_cordage` ⚠ | cordage spinwheel is the closest |
| well | `t_wooden_well` | also `t_covered_well` |
| drying_rack / hide_rack / meat_larder | `f_smoking_rack` | `f_smoking_rack_active` variant exists |
| tanning_rack / tanning_bucket_station / beast_tanning_bucket | `t_vat` | |
| stone_forge / anvil (Smithy) / casting_hearth / finery_forge / blast_furnace / crucible_steelworks | `f_anvil` | no `f_forge`; anvil is the forge tile |
| bloomery | `f_home_furnace` | |
| quern | `f_water_mill` ⚠ | hand-mill → mill tile |
| oven | `f_clay_oven` | |
| fermenter / brewing_barrel / salting_barrel | `t_vat` / item `wooden_barrel` ⚠ | no `f_` brewing furniture |
| compost_bin | `f_recycle_bin` ⚠ | |
| potters_wheel / spinning_wheel | `f_spinwheel` | |
| weaving_frame / runic_loom | `f_spinwheel` ⚠ | no `f_loom` |
| resin_tap | `t_resin_hole` | exact |
| lay_poor_soil / lay_loam / lay_rich_soil / lay_terra_preta | `t_dirtmound` ⚠ | soil designations |

### Magic stations (Magiclysm content IS present)
| db id | recommended | note |
|---|---|---|
| arcane_alembic | `f_alembic` | exact |
| runecarver_bench / manaforge / runic_crucible / alchemy_lab | `f_magic_bench` | |
| attunement_altar | `f_magic_circle` | |
| heartwood_joiner | `f_workbench` ❌ | no fitting tile |

### Furniture / storage / shelter
| db id | recommended |
|---|---|
| wooden_table | `f_table` |
| wooden_stool | `f_stool` |
| cushioned_chair | `f_armchair` |
| couch | `f_sofa` |
| storage_chest / rope_granary | `f_crate_c` |
| larder_cupboard | `f_cupboard` |
| hay_rack / clay_storage_jars | `f_rack_wood` / `f_standing_tank` |
| wicker_basket | `f_crate_o` ⚠ |
| root_clamp | `t_rootcellar` |
| sleeping_spot / hay_bed | `f_makeshift_bed` |
| hide_bed / leather_bed / feather_bed | `f_bed` |

### Structure (walls / floors / doors — use autotile groups)
| db id | recommended |
|---|---|
| branch_wall | `t_wall_log` |
| wicker_wall / daub_wall / mud_brick_wall | `t_adobe_brick_wall` |
| stone_block_wall | `t_brick_wall` / `t_wall` |
| rebar_concrete_wall / magic_concrete_wall | `t_concrete_wall` |
| palisade | `t_palisade` |
| gatehouse | `t_palisade_gate` |
| barricade | `f_barricade_road` |
| door / branch_door | `t_door_c` |
| window | `t_window` |
| packed_earth_floor | `t_dirtfloor` |
| wooden_floor / branch_floor / hay_floor | `t_floor` |
| stone_floor | `t_rock_floor` |
| clay_floor / mud_brick_floor | `t_clay` |
| thatch_roof / tile_roof / mountain_roof | `t_shingle_flat_roof` ⚠ |
| snare_trap / deadfall | `tr_beartrap` ⚠ |

---

## Creatures
**Real animals — strong:** wolf `mon_wolf` · bear/owlbear `mon_bear` · deer `mon_deer_buck` · rabbit `mon_rabbit` ·
boar `mon_boar_wild` · elk `mon_moose` · mountain_goat `mon_goat` · wild_chicken `mon_chicken1` ·
sabretooth `mon_cougar` · giant_rat `mon_rat_king` · thornwood_spider `mon_demon_spider` ·
shadow_wraith `mon_shadow`/`mon_wraith` · giant_olm `mon_frog_giant` (reuse).

**❌ Gap — D&D-type monsters with no CDDA equivalent (17):** goblin, aurochs, woolly_mammoth, hippogriff,
hoarfowl, quillback, worg, jackal, mire_crocodile, marsh_viper, stirge, grimeling, kobold_skulker,
gnoll_marauder, orc_reaver, harpy, bullywug.
→ **This is the decision point for the Chibi cross-test** — Chibi_Ultica / a CDDA fantasy creature mod, or commission. Post-apoc Ultica will never cover these.

---

## Resources & Subterrains
- **Trees:** generic `t_tree` + specifics where they exist (`t_tree_birch`, `t_tree_apple`, fruit trees). pine/oak/ash/yew → reuse `t_tree`. Magic groves (heartwood/moonwood/ironwood/emberwood) ❌ → tint/overlay a tree.
- **Ground/subterrain:** dirt `t_dirt` · grass `t_grass` (+ `_long` for tall/deep) · moss `t_moss` · mud `t_mud` · clay `t_clay` · water `t_water_sh`/`t_water_dp` · rocky `t_rock`. savanna/bog/scrubland/quicksand/rapids/riverbank ⚠ → reuse grass/water/dirt variants.
- **Rock/walls:** stone_outcrop `t_rock` · mountain_wall/cliff_wall `t_wall`/`t_rock_wall`.
- **Crops:** all `crop_*` → `f_planter_seedling` → `f_planter_mature` → `f_planter_harvest` (growth-stage tiles exist!) or `generic_crop_seedling`.
- **Mushroom/berry/flower:** `t_fungus1..5` · `t_shrub_blackberry` · `f_flower_*`.
- **Gems (ruby/sapphire/emerald/topaz/citrine/moonstone/amethyst nodes):** only jewelry *items* exist (`ruby_gold_ring`…), not ore nodes → reuse `t_rock` tinted per gem ⚠.
- **❌ Ore minerals** (malachite, chalcopyrite, azurite, cassiterite, hematite, magnetite, limonite, galena, native_gold, electrum, coal, rock_salt): no CDDA ore-vein tiles → reuse `t_rock`/`t_rock_red`/`t_rock_blue` variants, or commission ore overlays.
- **Magic terrain:** crystal_formation `f_huge_mana_crystal` · arcane_glade `f_magic_circle` ⚠.

---

## Integration notes (follow-up, not done here)
- [ ] **Tile size:** Ultica is 32×32 vs current 12×18 cell — atlas/`BASE_TILE_PX` change project-wide; existing bitlands tiles would need 2× upscale to coexist, or full swap.
- [ ] **Tinting:** Ultica tiles are **full-color baked** — the current white-mask 3-colour runtime tint can't recolour them. Per-material variation (wood types) must be **baked hue/colorize passes per material** (batch), not runtime mask-tint. Decide the new tile-ref schema (single id vs autotile group, + per-material variant set).
- [ ] **Licensing:** ship CC-BY-SA attribution for any Ultica tile used; keep Ultica-derived tiles BY-SA.
- [ ] **Gaps:** resolve fantasy creatures (Chibi cross-test) and ore nodes (commission/overlay) before they block content.
```
