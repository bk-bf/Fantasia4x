# MSX+ (MShockXotto+) tile mapping — proposal

> Generated map of every `charSpans` entity → best MShockXotto+ tile id. **Not applied** — renderer needs a `mshock` sheet first (see chat). Copy a better id from the viewer and edit the chosen column.


## subterrains (28)

| id | name | chosen MSX+ tile | how |
|---|---|---|---|
| `dirt` | Barren Dirt | `t_dirtfloor` | tok |
| `grass` | Poor Soil | `t_grass` | syn |
| `deep_grass` | Rich Soil | `t_grass` | syn |
| `tall_grass` | Loam | `t_grass_long_unconnected` | syn |
| `terra_preta` | Terra Preta | `—` (pick in viewer) | ⚠ FALLBACK |
| `savanna` | Savanna | `t_grass_long_unconnected` | syn |
| `bush` | Bush | `t_shrub` | syn |
| `scrubland` | Scrubland | `t_shrub` | syn |
| `wildflowers` | Wildflowers | `—` (pick in viewer) | ⚠ FALLBACK |
| `tree` | Forest Floor | `t_tree` | syn |
| `tree_stump` | Tree Stump | `t_tree` | syn |
| `fallen_logs` | Fallen Logs | `—` (pick in viewer) | ⚠ FALLBACK |
| `dead_trees` | Dead Trees | `t_tree` | syn |
| `mushroom_patch` | Mushroom Patch | `3060_t_fungus_wall_0` | syn |
| `moss` | Moss | `—` (pick in viewer) | ⚠ FALLBACK |
| `mud` | Mud | `—` (pick in viewer) | ⚠ FALLBACK |
| `bog` | Bog | `t_swater_dp` | syn |
| `clay` | Clay | `t_clay` | syn |
| `quicksand` | Quicksand | `t_sandmound` | syn |
| `shallow_water` | Shallow Water | `t_swater_dp` | syn |
| `water` | Water | `t_water_dp` | syn |
| `rapids` | Rapids | `t_water_dp` | syn |
| `riverbank` | Riverbank | `—` (pick in viewer) | ⚠ FALLBACK |
| `rocky` | Rocky Ground | `t_rock_unconnected` | syn |
| `cave` | Cave | `—` (pick in viewer) | ⚠ FALLBACK |
| `mineral_deposit` | Mineral Deposit | `t_rock_unconnected` | syn |
| `crystal_formation` | Crystal Formation | `—` (pick in viewer) | ⚠ FALLBACK |
| `arcane_glade` | Arcane Glade | `—` (pick in viewer) | ⚠ FALLBACK |

## resources (81)

| id | name | chosen MSX+ tile | how |
|---|---|---|---|
| `heartwood_grove` | Heartwood Tree | `t_tree` | syn |
| `moonwood_grove` | Moonwood Tree | `t_tree` | syn |
| `ironwood_grove` | Ironwood Tree | `t_tree` | syn |
| `emberwood_grove` | Emberwood Tree | `t_tree` | syn |
| `wolf_den` | Wolf Den | `f_midden` | tok |
| `predator_den` | Predator Den | `f_midden` | tok |
| `goblin_warren` | Goblin Warren | `—` (pick in viewer) | ⚠ FALLBACK |
| `swamp_nest` | Swamp Nest | `t_grass_long_unconnected` | syn |
| `harpy_roost` | Harpy Roost | `t_tree` | syn |
| `pine_tree` | Pine Tree | `t_tree_pine` | syn |
| `birch_tree` | Birch Tree | `5425_t_tree_birch_0` | syn |
| `oak_tree` | Oak Tree | `t_tree_deadpine` | syn |
| `apple_tree` | Apple Tree | `t_tree_apple_vitrified` | syn |
| `ash_tree` | Ash Tree | `t_tree` | syn |
| `yew_tree` | Yew Tree | `t_tree_pine` | syn |
| `stone_outcrop` | Stone Outcrop | `t_rock_unconnected` | syn |
| `wildflower_patch` | Wildflower Patch | `f_flower_tulip` | syn |
| `fallen_logs` | Fallen Logs | `f_logstool` | tok |
| `amethyst_node` | Amethyst Crystals | `—` (pick in viewer) | ⚠ FALLBACK |
| `scrub_patch` | Scrub Patch | `t_shrub` | syn |
| `tree_stump` | Tree Stump | `t_tree` | syn |
| `mushroom_patch` | Mushroom Patch | `3060_t_fungus_wall_0` | syn |
| `dead_tree` | Dead Tree | `t_tree` | syn |
| `berry_bush` | Berry Bush | `t_shrub_blueberry` | syn |
| `wild_barley` | Wild Barley | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_rye` | Wild Rye | `f_dryer` | tok |
| `wild_cabbage` | Wild Cabbage | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_turnip` | Wild Turnip | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_onion` | Wild Onion | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_kale` | Wild Kale | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_radish` | Wild Radish | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_beans` | Wild Beans | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_peas` | Wild Peas | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_grapevine` | Wild Grapevine | `—` (pick in viewer) | ⚠ FALLBACK |
| `malachite` | Malachite | `—` (pick in viewer) | ⚠ FALLBACK |
| `chalcopyrite` | Chalcopyrite | `—` (pick in viewer) | ⚠ FALLBACK |
| `azurite` | Azurite | `—` (pick in viewer) | ⚠ FALLBACK |
| `cassiterite` | Cassiterite | `—` (pick in viewer) | ⚠ FALLBACK |
| `hematite` | Hematite | `—` (pick in viewer) | ⚠ FALLBACK |
| `magnetite` | Magnetite | `—` (pick in viewer) | ⚠ FALLBACK |
| `limonite` | Limonite | `—` (pick in viewer) | ⚠ FALLBACK |
| `galena` | Galena | `—` (pick in viewer) | ⚠ FALLBACK |
| `native_gold` | Native Gold | `t_rock_unconnected` | syn |
| `electrum` | Electrum Ore | `f_planter_morel_seed` | tok |
| `coal` | Coal | `t_rock_unconnected` | syn |
| `rock_salt` | Rock Salt | `t_rock_unconnected` | syn |
| `mountain_wall` | Mountain Wall | `997_t_root_wall_1` | syn |
| `cliff_wall` | Cliff Wall | `997_t_root_wall_1` | syn |
| `grass_patch` | Grass Patch | `t_grass` | syn |
| `tall_grass_patch` | Tall Grass | `t_grass_long_unconnected` | syn |
| `deep_grass_patch` | Deep Grass | `t_grass` | syn |
| `savanna` | Savanna | `t_grass_long_unconnected` | syn |
| `moss` | Moss | `—` (pick in viewer) | ⚠ FALLBACK |
| `mud_deposit` | Mud | `—` (pick in viewer) | ⚠ FALLBACK |
| `bog_deposit` | Bog | `t_swater_dp` | syn |
| `fire_clay` | Fire Clay | `1512_f_fireplace_0` | syn |
| `blue_clay` | Blue Clay | `t_clay` | syn |
| `riverbank_deposit` | Riverbank | `—` (pick in viewer) | ⚠ FALLBACK |
| `ruby_node` | Ruby Crystals | `—` (pick in viewer) | ⚠ FALLBACK |
| `sapphire_node` | Sapphire Crystals | `—` (pick in viewer) | ⚠ FALLBACK |
| `emerald_node` | Emerald Crystals | `—` (pick in viewer) | ⚠ FALLBACK |
| `topaz_node` | Topaz Crystals | `—` (pick in viewer) | ⚠ FALLBACK |
| `citrine_node` | Citrine Crystals | `—` (pick in viewer) | ⚠ FALLBACK |
| `moonstone_node` | Moonstone Crystals | `—` (pick in viewer) | ⚠ FALLBACK |
| `crop_wheat` | Wheat | `f_planter` | syn |
| `crop_rye` | Rye | `f_planter` | syn |
| `crop_kale` | Kale Patch | `f_planter` | syn |
| `crop_radish` | Radish Bed | `f_planter` | syn |
| `crop_cabbage` | Cabbage Patch | `f_planter` | syn |
| `crop_turnip` | Turnip Bed | `f_planter` | syn |
| `crop_onion` | Onion Bed | `f_planter` | syn |
| `crop_beans` | Bean Rows | `f_planter` | syn |
| `crop_peas` | Pea Rows | `f_planter` | syn |
| `crop_flax` | Flax Field | `f_planter` | syn |
| `crop_cotton` | Cotton Field | `f_planter` | syn |
| `crop_berries` | Berry Patch | `f_planter` | syn |
| `crop_apples` | Apple Orchard | `f_planter` | syn |
| `crop_grapes` | Grapevine | `f_planter` | syn |
| `crop_thyme` | Thyme Garden | `f_planter` | syn |
| `crop_mint` | Mint Bed | `f_planter` | syn |
| `crop_pumpkin` | Pumpkin Patch | `f_planter` | syn |

## buildings (95)

| id | name | chosen MSX+ tile | how |
|---|---|---|---|
| `campfire` | Campfire | `f_firering` | syn |
| `hearth` | Stone Hearth | `1512_f_fireplace_0` | syn |
| `craft_spot` | Craft Spot | `f_ground_crafting_spot` | tok |
| `makers_bench` | Primitive Workbench | `f_workbench` | syn |
| `butcher_spot` | Butcher Spot | `f_butcher_rack` | syn |
| `dressing_stone` | Dressing Stone | `f_rack` | syn |
| `chopping_block` | Splitting Stump | `4270_t_stump_0` | syn |
| `sawtable` | Sawpit | `1585_f_table_0` | syn |
| `pottery_kiln` | Potter's Kiln | `f_clay_kiln` | syn |
| `advanced_kiln` | Fire-brick Kiln | `f_clay_kiln` | syn |
| `masons_bench` | Stonecutter's Banker | `f_workbench` | syn |
| `charcoal_pit` | Charcoal Pit | `t_rock_unconnected` | syn |
| `ropewalk` | Ropewalk | `—` (pick in viewer) | ⚠ FALLBACK |
| `well` | Draw Well | `3010_t_covered_well_0` | tok |
| `drying_rack` | Drying Rack | `1577_f_smoking_rack_0` | syn |
| `hide_rack` | Curing Frame | `f_rack` | syn |
| `tanning_rack` | Tannery | `t_vat_blue` | syn |
| `stone_forge` | Smelting Hearth | `f_anvil` | syn |
| `bloomery` | Bloomery Furnace | `f_home_furnace` | syn |
| `anvil` | Smithy | `f_anvil` | syn |
| `casting_hearth` | Casting Hearth | `1512_f_fireplace_0` | syn |
| `finery_forge` | Finery Forge | `f_anvil` | syn |
| `wooden_table` | Wooden Table | `1585_f_table_0` | syn |
| `wooden_stool` | Wooden Stool | `f_stool` | syn |
| `wicker_basket` | Wicker Basket | `f_crate_o` | syn |
| `clay_storage_jars` | Clay Storage Jars | `t_clay` | syn |
| `storage_chest` | Wooden-Plank Storage Chest | `f_crate_c` | syn |
| `larder_cupboard` | Larder Cupboard | `f_cupboard_unconnected` | syn |
| `hay_rack` | Hay Rack | `f_rack` | syn |
| `meat_larder` | Meat Hooks | `f_cupboard_unconnected` | syn |
| `salting_barrel` | Salting Barrel | `t_rock_unconnected` | syn |
| `rope_granary` | Rope-Hung Granary | `f_crate_c` | syn |
| `root_clamp` | Root Clamp | `t_root_floor` | tok |
| `thatch_roof` | Thatch Roof | `t_shingle_flat_roof` | syn |
| `tile_roof` | Tiled Roof | `t_shingle_flat_roof` | syn |
| `mountain_roof` | Overhead Mountain | `t_shingle_flat_roof` | syn |
| `door` | Plank Door | `t_door_c` | syn |
| `window` | Branch Window | `t_window` | syn |
| `snare_trap` | Snare | `5187_f_tank_trap_0` | tok |
| `deadfall` | Deadfall Trap | `5187_f_tank_trap_0` | tok |
| `branch_wall` | Branch Wall | `997_t_root_wall_1` | syn |
| `wicker_wall` | Wicker Wall | `997_t_root_wall_1` | syn |
| `daub_wall` | Daub Wall | `997_t_root_wall_1` | syn |
| `mud_brick_wall` | Mud Brick Wall | `997_t_root_wall_1` | syn |
| `stone_block_wall` | Stone Block Wall | `997_t_root_wall_1` | syn |
| `rebar_concrete_wall` | Reinforced Concrete Wall | `997_t_root_wall_1` | syn |
| `magic_concrete_wall` | Runed Concrete Wall | `997_t_root_wall_1` | syn |
| `branch_door` | Branch Door | `t_door_c` | syn |
| `packed_earth_floor` | Packed-Earth Floor | `t_floor` | syn |
| `wooden_floor` | Plank Floor | `t_floor` | syn |
| `stone_floor` | Flagstone Floor | `t_floor` | syn |
| `branch_floor` | Branch Floor | `t_floor` | syn |
| `hay_floor` | Rush Floor | `t_floor` | syn |
| `clay_floor` | Rammed-Clay Floor | `t_clay` | syn |
| `mud_brick_floor` | Mud-Brick Floor | `t_floor` | syn |
| `sleeping_spot` | Sleeping Spot | `1536_f_makeshift_bed_0` | syn |
| `hay_bed` | Hay Bed | `1453_f_bed_0` | syn |
| `hide_bed` | Hide Bed | `1453_f_bed_0` | syn |
| `leather_bed` | Leather Bed | `1453_f_bed_0` | syn |
| `feather_bed` | Feather Bed | `1453_f_bed_0` | syn |
| `cushioned_chair` | Cushioned Chair | `f_armchair` | syn |
| `couch` | Couch | `f_sofa_0` | syn |
| `weaving_frame` | Weaving Frame | `t_door_frame` | tok |
| `lapidary_bench` | Lapidary Bench | `f_workbench` | syn |
| `runecarver_bench` | Runecarver's Bench | `f_workbench` | syn |
| `attunement_altar` | Attunement Altar | `f_magic_circle` | syn |
| `compost_bin` | Compost Bin | `f_glass_cabinet` | tok |
| `lay_poor_soil` | Lay Poor Soil | `t_dirtmound` | syn |
| `lay_loam` | Lay Loam | `t_dirtfloor` | syn |
| `lay_rich_soil` | Lay Rich Soil | `t_dirtmound` | syn |
| `lay_terra_preta` | Lay Terra Preta | `t_clay` | tok |
| `quern` | Quern | `f_still` | syn |
| `oven` | Clay Oven | `f_clay_oven` | syn |
| `fermenter` | Fermenter | `t_vat_blue` | syn |
| `carpenter_bench` | Carpenter's Bench | `f_workbench` | syn |
| `potters_wheel` | Potter's Wheel | `f_clay_kiln` | syn |
| `spinning_wheel` | Spinning Wheel | `—` (pick in viewer) | ⚠ FALLBACK |
| `porcelain_workshop` | Porcelain Workshop | `—` (pick in viewer) | ⚠ FALLBACK |
| `blast_furnace` | Blast Furnace | `f_home_furnace` | syn |
| `crucible_steelworks` | Crucible Steelworks | `—` (pick in viewer) | ⚠ FALLBACK |
| `clockwork_bench` | Clockwork Bench | `f_workbench` | syn |
| `tanning_bucket_station` | Tanning Bucket | `t_vat_blue` | syn |
| `beast_tanning_bucket` | Beast Tanning Bucket | `t_vat_blue` | syn |
| `brewing_barrel` | Brewing Barrel | `f_still` | syn |
| `alchemy_lab` | Alchemy Lab | `t_door_lab_b` | tok |
| `manaforge` | Manaforge | `f_anvil` | syn |
| `runic_crucible` | Runic Crucible | `—` (pick in viewer) | ⚠ FALLBACK |
| `runic_loom` | Runic Loom | `—` (pick in viewer) | ⚠ FALLBACK |
| `glyph_cutters_banker` | Glyph-Cutter's Banker | `f_workbench` | syn |
| `arcane_alembic` | Arcane Alembic | `f_magic_circle` | syn |
| `heartwood_joiner` | Heartwood Joiner | `—` (pick in viewer) | ⚠ FALLBACK |
| `palisade` | Palisade | `t_palisade` | syn |
| `barricade` | Barricade | `f_barricade_road` | syn |
| `gatehouse` | Gatehouse | `t_palisade_gate` | syn |
| `resin_tap` | Resin Tap | `t_resin_hole` | syn |

## creatures (31)

| id | name | chosen MSX+ tile | how |
|---|---|---|---|
| `wolf` | Wolf | `2657_mon_wolf_0` | syn |
| `bear` | Bear | `mon_bear` | syn |
| `goblin` | Goblin | `mon_goblin_slinger` | syn |
| `giant_rat` | Giant Rat | `mon_rattlesnake` | syn |
| `shadow_wraith` | Shadow Wraith | `mon_wraith` | syn |
| `deer` | Deer | `mon_deer` | syn |
| `rabbit` | Rabbit | `2569_mon_rabbit_0` | syn |
| `boar` | Wild Boar | `mon_boar_wild` | syn |
| `elk` | Elk | `mon_moose` | syn |
| `mountain_goat` | Mountain Goat | `mon_goat` | syn |
| `wild_chicken` | Wild Chicken | `mon_chicken_chick` | syn |
| `aurochs` | Aurochs | `mon_cow` | syn |
| `woolly_mammoth` | Woolly Mammoth | `mon_mammoth` | syn |
| `hippogriff` | Hippogriff | `—` (pick in viewer) | ⚠ FALLBACK |
| `hoarfowl` | Hoarfowl | `mon_chicken_chick` | syn |
| `quillback` | Quillback | `mon_pig` | syn |
| `worg` | Worg | `mon_direwolf` | syn |
| `jackal` | Jackal | `mon_coyote` | syn |
| `owlbear` | Owlbear | `mon_bear` | syn |
| `sabretooth` | Sabretooth Cat | `2379_mon_cougar_0` | syn |
| `mire_crocodile` | Mire Crocodile | `mon_crocodile` | syn |
| `marsh_viper` | Marsh Viper | `—` (pick in viewer) | ⚠ FALLBACK |
| `stirge` | Stirge | `mon_mosquito_mega` | syn |
| `grimeling` | Grimeling | `mon_mossling` | syn |
| `giant_olm` | Giant Olm | `mon_frog_giant` | tok |
| `thornwood_spider` | Thornwood Spider | `mon_demon_spider_0` | syn |
| `kobold_skulker` | Kobold Skulker | `mon_goblin_slinger` | syn |
| `gnoll_marauder` | Gnoll Marauder | `5450_mon_jabberwock_0` | syn |
| `orc_reaver` | Orc Reaver | `mon_orc_archer` | syn |
| `harpy` | Harpy | `—` (pick in viewer) | ⚠ FALLBACK |
| `bullywug` | Bullywug | `mon_lizardfolk_hunter` | syn |

## items (475)

| id | name | chosen MSX+ tile | how |
|---|---|---|---|
| `wild_berries` | Wild Berries | `mulberries` | tok |
| `common_carp` | Carp | `t_carpet_red` | tok |
| `wild_oats` | Wild Oats | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_sage` | Wild Sage | `blutwurst_sausage` | tok |
| `woundwort` | Woundwort | `—` (pick in viewer) | ⚠ FALLBACK |
| `chewed_poultice` | Chewed Poultice | `—` (pick in viewer) | ⚠ FALLBACK |
| `river_trout` | River Trout | `screwdriver` | tok |
| `rabbit_carcass` | Rabbit Carcass | `skull_rabbit` | tok |
| `deer_carcass` | Deer Carcass | `teddy_bear_var_toy_plush_wdeer` | tok |
| `rabbit_meat` | Rabbit Meat | `skull_rabbit` | tok |
| `venison` | Venison | `—` (pick in viewer) | ⚠ FALLBACK |
| `hide` | Raw Hide | `acid_soaked_hide` | tok |
| `rotten_hide` | Rotten Hide | `acid_soaked_hide` | tok |
| `tanning_bucket` | Tanning Bucket | `t_vat_blue` | syn |
| `cured_thin_hide` | Cured Thin Hide | `raw_cured_fatty_meat` | tok |
| `cured_light_hide` | Cured Light Hide | `raw_cured_fatty_meat` | tok |
| `cured_sturdy_hide` | Cured Sturdy Hide | `raw_cured_fatty_meat` | tok |
| `cured_heavy_hide` | Cured Heavy Hide | `raw_cured_fatty_meat` | tok |
| `cured_thick_hide` | Cured Thick Hide | `raw_cured_fatty_meat` | tok |
| `thin_leather` | Thin Leather | `t_ice_dp_thin_unconnected` | tok |
| `light_leather` | Light Leather | `lighter` | tok |
| `sturdy_leather` | Sturdy Leather | `leather` | tok |
| `heavy_leather` | Heavy Leather | `273x110slugheavy` | tok |
| `thick_leather` | Thick Leather | `t_ice_dp_thick_unconnected` | tok |
| `spit_meat` | Spit-Roasted Meat | `meat` | tok |
| `small_stew` | Stew | `box_small` | tok |
| `fine_stew` | Fine Stew | `mre_beefstew` | tok |
| `lavish_stew` | Lavish Stew | `mre_beefstew` | tok |
| `pottage` | Pottage | `—` (pick in viewer) | ⚠ FALLBACK |
| `branch` | Branch | `—` (pick in viewer) | ⚠ FALLBACK |
| `small_stone` | Small Stone | `box_small` | tok |
| `flint_shard` | Flint Shard | `flint_steel` | tok |
| `plant_fiber` | Plant Fiber | `eggplant` | tok |
| `bark` | Bark | `birchbark` | tok |
| `hay` | Hay | `f_hay` | tok |
| `pine_log` | Pine Log | `t_tree_pine` | syn |
| `birch_log` | Birch Log | `5425_t_tree_birch_0` | syn |
| `apple_log` | Apple Log | `t_tree_apple_vitrified` | syn |
| `oak_log` | Oak Log | `t_tree_deadpine` | syn |
| `ash_log` | Ash Log | `t_tree` | syn |
| `yew_log` | Yew Log | `t_tree_pine` | syn |
| `green_firewood` | Green Firewood | `1512_f_fireplace_0` | syn |
| `dry_firewood` | Dry Firewood | `1512_f_fireplace_0` | syn |
| `sawdust` | Sawdust | `—` (pick in viewer) | ⚠ FALLBACK |
| `peat` | Peat | `—` (pick in viewer) | ⚠ FALLBACK |
| `charcoal` | Charcoal | `t_rock_unconnected` | syn |
| `coal` | Coal | `t_rock_unconnected` | syn |
| `coke` | Coke | `—` (pick in viewer) | ⚠ FALLBACK |
| `malachite` | Malachite | `—` (pick in viewer) | ⚠ FALLBACK |
| `chalcopyrite` | Chalcopyrite | `—` (pick in viewer) | ⚠ FALLBACK |
| `azurite` | Azurite | `—` (pick in viewer) | ⚠ FALLBACK |
| `cassiterite` | Cassiterite | `—` (pick in viewer) | ⚠ FALLBACK |
| `hematite` | Hematite | `—` (pick in viewer) | ⚠ FALLBACK |
| `magnetite` | Magnetite | `—` (pick in viewer) | ⚠ FALLBACK |
| `limonite` | Limonite | `—` (pick in viewer) | ⚠ FALLBACK |
| `galena` | Galena | `—` (pick in viewer) | ⚠ FALLBACK |
| `native_gold` | Native Gold | `t_rock_unconnected` | syn |
| `electrum` | Electrum Ore | `scorecard` | tok |
| `copper_bar` | Copper Bar | `copper` | tok |
| `tin_bar` | Tin Bar | `5l_tin` | tok |
| `bronze_bar` | Bronze Bar | `5l_bronze` | tok |
| `iron_bar` | Iron Bar | `5l_iron` | tok |
| `iron_nail` | Iron Nails | `5l_iron` | tok |
| `bronze_nail` | Bronze Nails | `5l_bronze` | tok |
| `steel_rivet` | Steel Rivets | `5l_steel` | tok |
| `crucible_steel` | Crucible Steel | `crucible` | tok |
| `mechanism` | Mechanism | `—` (pick in viewer) | ⚠ FALLBACK |
| `lead_bar` | Lead Bar | `lead` | tok |
| `silver_bar` | Silver Bar | `5l_silver` | tok |
| `gold_bar` | Gold Bar | `t_rock_unconnected` | syn |
| `steel_bar` | Steel Bar | `5l_steel` | tok |
| `ash` | Ash | `t_tree` | syn |
| `salt` | Salt | `t_rock_unconnected` | syn |
| `water` | Water | `salt_water` | syn |
| `waterskin` | Waterskin | `salt_water` | syn |
| `flask` | Clay Flask | `t_clay` | syn |
| `jug` | Water Jug | `salt_water` | syn |
| `animal_fat` | Animal Fat | `boxer_shorts_var_boxer_shorts_animal` | tok |
| `torch` | Torch | `—` (pick in viewer) | ⚠ FALLBACK |
| `candle` | Tallow Candle | `t_grass_long_unconnected` | syn |
| `salted_meat` | Salted Meat | `t_rock_unconnected` | syn |
| `dried_meat` | Dried Meat | `meat` | tok |
| `dried_fruit` | Dried Fruit | `dry_fruit` | tok |
| `pine_plank` | Pine Plank | `t_tree_pine` | syn |
| `beam` | Hewn Beam | `wood_beam` | tok |
| `oak_plank` | Oak Plank | `t_tree_deadpine` | syn |
| `birch_plank` | Birch Plank | `5425_t_tree_birch_0` | syn |
| `ash_plank` | Ash Plank | `t_tree` | syn |
| `yew_plank` | Yew Plank | `t_tree_pine` | syn |
| `saw` | Saw | `saw` | tok |
| `granite` | Granite | `—` (pick in viewer) | ⚠ FALLBACK |
| `limestone` | Limestone | `material_limestone` | tok |
| `sandstone` | Sandstone | `—` (pick in viewer) | ⚠ FALLBACK |
| `marble` | Marble | `—` (pick in viewer) | ⚠ FALLBACK |
| `slate` | Slate | `—` (pick in viewer) | ⚠ FALLBACK |
| `granite_block` | Granite Block | `wood_block` | tok |
| `limestone_block` | Limestone Block | `material_limestone` | tok |
| `sandstone_block` | Sandstone Block | `wood_block` | tok |
| `marble_block` | Marble Block | `wood_block` | tok |
| `slate_tile` | Slate Tile | `t_vitrified_tile` | tok |
| `blue_clay` | Blue Clay | `t_clay` | syn |
| `fire_clay` | Fire Clay | `1512_f_fireplace_0` | syn |
| `sand` | Sand | `sandpaper` | tok |
| `sphagnum_moss` | Sphagnum Moss | `mossberg_500` | tok |
| `cordage` | Cordage | `—` (pick in viewer) | ⚠ FALLBACK |
| `rope` | Rope | `t_rope_up_1` | tok |
| `mud_brick` | Mud Brick | `brick` | tok |
| `fired_brick` | Fired Brick | `1512_f_fireplace_0` | syn |
| `fire_bricks` | Fire Brick | `1512_f_fireplace_0` | syn |
| `water_urn` | Clay Urn | `salt_water` | syn |
| `clay_mold` | Clay Mold | `t_clay` | syn |
| `tile_mold` | Tile Mold | `t_vitrified_tile` | tok |
| `clay_roof_tile` | Clay Roof Tile | `t_clay` | syn |
| `flint_knife` | Flint Knife | `flint_steel` | tok |
| `flint_sickle` | Flint Sickle | `flint_steel` | tok |
| `stone_chopper` | Stone Chopper | `stone_chopper` | tok |
| `digging_stick` | Digging Stick | `digging_stick` | tok |
| `stone_axe` | Stone Axe | `pickaxe` | tok |
| `iron_axe` | Iron Axe | `5l_iron` | tok |
| `steel_axe` | Steel Axe | `5l_steel` | tok |
| `stone_hammer` | Stone Hammer | `hammer` | tok |
| `iron_hammer` | Iron Hammer | `5l_iron` | tok |
| `steel_hammer` | Steel Hammer | `5l_steel` | tok |
| `stone_pick` | Stone Pick | `pickaxe` | tok |
| `stone_hoe` | Stone Hoe | `hoe` | tok |
| `stone_spear` | Stone Spear | `speargun` | tok |
| `stone_spade` | Stone Spade | `—` (pick in viewer) | ⚠ FALLBACK |
| `iron_shovel` | Iron Shovel | `5l_iron` | tok |
| `steel_shovel` | Steel Shovel | `5l_steel` | tok |
| `iron_hoe` | Iron Hoe | `5l_iron` | tok |
| `steel_hoe` | Steel Hoe | `5l_steel` | tok |
| `clay_cooking_pot` | Clay Cooking Pot | `t_clay` | syn |
| `woven_basket` | Woven Basket | `f_clay_oven` | syn |
| `wooden_chest` | Wooden Chest | `f_crate_c` | syn |
| `wolf_carcass` | Wolf Carcass | `hoodie_var_wolf` | tok |
| `bear_carcass` | Bear Carcass | `skull_bear` | tok |
| `goblin_carcass` | Goblin Remains | `—` (pick in viewer) | ⚠ FALLBACK |
| `giant_rat_carcass` | Giant Rat Carcass | `vibrator` | tok |
| `boar_carcass` | Boar Carcass | `cardboard` | tok |
| `elk_carcass` | Elk Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `mountain_goat_carcass` | Mountain Goat Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `wild_chicken_carcass` | Wild Chicken Carcass | `egg_chicken` | tok |
| `aurochs_carcass` | Aurochs Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `woolly_mammoth_carcass` | Woolly Mammoth Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `hippogriff_carcass` | Hippogriff Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `hoarfowl_carcass` | Hoarfowl Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `quillback_carcass` | Quillback Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `worg_carcass` | Worg Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `jackal_carcass` | Jackal Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `owlbear_carcass` | Owlbear Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `sabretooth_carcass` | Sabretooth Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `mire_crocodile_carcass` | Mire Crocodile Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `marsh_viper_carcass` | Marsh Viper Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `stirge_carcass` | Stirge Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `grimeling_carcass` | Grimeling Residue | `—` (pick in viewer) | ⚠ FALLBACK |
| `giant_olm_carcass` | Giant Olm Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `thornwood_spider_carcass` | Thornwood Spider Carcass | `bodysuit_lycra_var_spiderman_suit_red` | tok |
| `kobold_skulker_carcass` | Kobold Remains | `—` (pick in viewer) | ⚠ FALLBACK |
| `gnoll_marauder_carcass` | Gnoll Remains | `—` (pick in viewer) | ⚠ FALLBACK |
| `orc_reaver_carcass` | Orc Remains | `porcelain_urn` | tok |
| `harpy_carcass` | Harpy Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `bullywug_carcass` | Bullywug Remains | `—` (pick in viewer) | ⚠ FALLBACK |
| `wolf_meat` | Wolf Meat | `hoodie_var_wolf` | tok |
| `bear_meat` | Bear Meat | `skull_bear` | tok |
| `boar_meat` | Boar Meat | `cardboard` | tok |
| `elk_meat` | Elk Meat | `meat` | tok |
| `goat_meat` | Goat Meat | `meat` | tok |
| `chicken_meat` | Chicken Meat | `egg_chicken` | tok |
| `rat_meat` | Rat Meat | `vibrator` | tok |
| `rabbit_pelt` | Rabbit Pelt | `skull_rabbit` | tok |
| `deer_hide` | Deer Hide | `teddy_bear_var_toy_plush_wdeer` | tok |
| `wolf_hide` | Wolf Hide | `hoodie_var_wolf` | tok |
| `bear_pelt` | Bear Pelt | `skull_bear` | tok |
| `boar_hide` | Boar Hide | `cardboard` | tok |
| `elk_hide` | Elk Hide | `acid_soaked_hide` | tok |
| `goat_hide` | Goat Hide | `acid_soaked_hide` | tok |
| `chicken_feathers` | Chicken Feathers | `egg_chicken` | tok |
| `rat_pelt` | Rat Pelt | `vibrator` | tok |
| `small_bones` | Small Bones | `box_small` | tok |
| `medium_bones` | Medium Bones | `box_medium` | tok |
| `large_bones` | Large Bones | `box_large` | tok |
| `rotten_food` | Rotten Food | `birdfood` | tok |
| `rotten_meat` | Rotten Meat | `meat` | tok |
| `rotten_carcass` | Rotten Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `pawn_carcass` | Carcass | `—` (pick in viewer) | ⚠ FALLBACK |
| `carried_pawn` | Unconscious Body | `bag_body_bag` | tok |
| `bone_cleaver` | Bone Cleaver | `bone` | tok |
| `wooden_tongs` | Green-Wood Tongs | `wooden_grip` | tok |
| `iron_tongs` | Iron Tongs | `5l_iron` | tok |
| `steel_tongs` | Steel Tongs | `5l_steel` | tok |
| `fists` | Fists | `—` (pick in viewer) | ⚠ FALLBACK |
| `kick` | Kick | `swimming_kickboard` | tok |
| `bite` | Bite | `—` (pick in viewer) | ⚠ FALLBACK |
| `claw` | Claw | `claw_bar` | tok |
| `slam` | Slam | `—` (pick in viewer) | ⚠ FALLBACK |
| `tusk` | Tusk | `—` (pick in viewer) | ⚠ FALLBACK |
| `charge` | Charge | `ruger_charger` | tok |
| `boar_tusk` | Boar Tusk | `cardboard` | tok |
| `boar_charge` | Boar Charge | `cardboard` | tok |
| `antler` | Antler | `—` (pick in viewer) | ⚠ FALLBACK |
| `headbutt` | Headbutt | `—` (pick in viewer) | ⚠ FALLBACK |
| `peck` | Peck | `—` (pick in viewer) | ⚠ FALLBACK |
| `spectral_strike` | Spectral Strike | `—` (pick in viewer) | ⚠ FALLBACK |
| `venom_bite` | Venomous Bite | `—` (pick in viewer) | ⚠ FALLBACK |
| `proboscis` | Proboscis | `—` (pick in viewer) | ⚠ FALLBACK |
| `screech` | Screech | `—` (pick in viewer) | ⚠ FALLBACK |
| `tongue` | Snaring Tongue | `—` (pick in viewer) | ⚠ FALLBACK |
| `hide_tool_roll` | Hide Tool-Roll | `acid_soaked_hide` | tok |
| `hide_scrip` | Hide Scrip | `acid_soaked_hide` | tok |
| `linen_snapsack` | Linen Snapsack | `—` (pick in viewer) | ⚠ FALLBACK |
| `wicker_frame` | Wicker Frame | `frame` | tok |
| `flint_handaxe` | Flint Handaxe | `flint_steel` | tok |
| `wattle_buckler` | Wattle Buckler | `3386_t_wall_wattle_0` | tok |
| `bone_knife` | Bone Splinter Knife | `bone` | tok |
| `antler_club` | Antler War Club | `golf_club` | tok |
| `bone_tipped_spear` | Bone-Tipped Thrusting Spear | `bone` | tok |
| `bronze_punch_dagger` | Bronze Punch Dagger | `5l_bronze` | tok |
| `leaf_blade_spear` | Leaf-Blade Spear | `blade` | tok |
| `cast_bronze_hatchet` | Cast Bronze Hatchet | `casting_mold` | tok |
| `self_bow` | Self Bow | `selfbow` | tok |
| `rawhide_round_shield` | Rawhide-Faced Round Shield | `groundnut_boiled` | tok |
| `short_seax` | Short Seax | `shorts` | tok |
| `spatha` | Spatha | `—` (pick in viewer) | ⚠ FALLBACK |
| `bearded_axe` | Bearded Axe | `pickaxe` | tok |
| `framea` | Framea | `—` (pick in viewer) | ⚠ FALLBACK |
| `stone_maul` | Stone Maul | `—` (pick in viewer) | ⚠ FALLBACK |
| `iron_mace` | Iron Mace | `5l_iron` | tok |
| `iron_warhammer` | Iron Warhammer | `5l_iron` | tok |
| `iron_greatsword` | Iron Greatsword | `5l_iron` | tok |
| `steel_longsword` | Steel Longsword | `5l_steel` | tok |
| `steel_greatsword` | Steel Greatsword | `5l_steel` | tok |
| `steel_pike` | Steel Pike | `5l_steel` | tok |
| `steel_mace` | Steel Mace | `5l_steel` | tok |
| `steel_warhammer` | Steel Warhammer | `5l_steel` | tok |
| `steel_cleaver` | Steel Cleaver | `5l_steel` | tok |
| `steel_greatcleaver` | Steel Greatcleaver | `5l_steel` | tok |
| `steel_flail` | Steel Flail | `5l_steel` | tok |
| `iron_rondel` | Iron Rondel Dagger | `5l_iron` | tok |
| `steel_stiletto` | Steel Stiletto | `5l_steel` | tok |
| `iron_estoc` | Iron Estoc | `5l_iron` | tok |
| `steel_rapier` | Steel Rapier | `5l_steel` | tok |
| `war_bow` | War Bow | `ch_talwar` | tok |
| `throwing_stone` | Throwing Stone | `throwing_axe` | tok |
| `sling` | Sling | `slingpack` | tok |
| `throwing_spear` | Throwing Spear | `throwing_axe` | tok |
| `crossbow` | Crossbow | `—` (pick in viewer) | ⚠ FALLBACK |
| `sling_stone` | Sling Stone | `slingpack` | tok |
| `cast_sling_bullet` | Cast Sling Bullet | `casting_mold` | tok |
| `flint_arrow` | Flint-Tipped Arrow | `flint_steel` | tok |
| `bone_arrow` | Bone-Tipped Arrow | `bone` | tok |
| `broadhead_arrow` | Broadhead Arrow | `arrow_cf` | tok |
| `iron_arrow` | Iron Bodkin Arrow | `5l_iron` | tok |
| `barbed_arrow` | Barbed War Arrow | `wire_barbed` | tok |
| `iron_bolt` | Iron Crossbow Bolt | `5l_iron` | tok |
| `heavy_quarrel` | Hardened Quarrel | `273x110slugheavy` | tok |
| `hide_arrow_sheath` | Hide Arrow-Sheath | `acid_soaked_hide` | tok |
| `leather_back_quiver` | Leather Back Quiver | `leather` | tok |
| `stiffened_war_quiver` | Stiffened War Quiver | `ch_talwar` | tok |
| `leather_bolt_case` | Leather Bolt-Case | `leather` | tok |
| `banded_bolt_quiver` | Iron-Banded Bolt-Case | `bolt_cf` | tok |
| `iron_boss_shield` | Iron-Bossed Kite Shield | `5l_iron` | tok |
| `wicker_vest` | Wicker Vest | `vest_leather` | tok |
| `raw_hide_vest` | Raw Hide Vest | `tea_raw` | tok |
| `padded_cap` | Padded Linen Cap | `cloth_vest_padded` | tok |
| `linen_gambeson` | Linen Gambeson | `gambeson_hood` | tok |
| `boiled_leather_jerkin` | Boiled Leather Jerkin | `grain_boiled` | tok |
| `leather_coif` | Leather Coif | `leather` | tok |
| `rangers_hood` | Ranger's Hood | `hoodie` | tok |
| `archers_bracers` | Archer's Bracers | `—` (pick in viewer) | ⚠ FALLBACK |
| `marksmans_cloak` | Marksman's Cloak | `cloak_fur` | tok |
| `cast_bronze_skullcap` | Cast Bronze Skullcap | `casting_mold` | tok |
| `stitched_gauntlets` | Stitched Leather Gauntlets | `leather` | tok |
| `tallow_boots` | Tallow-Dressed Hide Boots | `t_grass_long_unconnected` | syn |
| `mail_coif` | Riveted Mail Coif | `f_mailbox` | tok |
| `iron_nasal_helm` | Iron Nasal Helm | `5l_iron` | tok |
| `mail_hauberk` | Riveted Mail Hauberk | `f_mailbox` | tok |
| `brigandine_coat` | Brigandine Coat | `coat_rain` | tok |
| `iron_gauntlets` | Riveted Iron Gauntlets | `5l_iron` | tok |
| `iron_shod_boots` | Iron-Shod Boots | `5l_iron` | tok |
| `iron_gorget` | Riveted Iron Gorget | `5l_iron` | tok |
| `sinew` | Sinew | `sinew` | tok |
| `flax_fiber` | Flax Fiber | `fiber_mat` | tok |
| `thread` | Spun Thread | `thread` | tok |
| `linen_cloth` | Linen Cloth | `cloth_vest_padded` | tok |
| `heartwood_log` | Heartwood Log | `f_logstool` | syn |
| `moonwood_log` | Moonwood Log | `f_logstool` | syn |
| `ironwood_log` | Ironwood Log | `f_logstool` | syn |
| `emberwood_log` | Emberwood Log | `f_logstool` | syn |
| `heartwood_plank` | Heartwood Plank | `plank_long` | tok |
| `moonwood_plank` | Moonwood Plank | `plank_long` | tok |
| `ironwood_plank` | Ironwood Plank | `plank_long` | tok |
| `emberwood_plank` | Emberwood Plank | `plank_long` | tok |
| `ruby` | Ruby | `—` (pick in viewer) | ⚠ FALLBACK |
| `infused_ruby` | Infused Ruby | `—` (pick in viewer) | ⚠ FALLBACK |
| `cut_ruby` | Cut Ruby | `hotcut` | tok |
| `attuned_ruby` | Attuned Ruby | `—` (pick in viewer) | ⚠ FALLBACK |
| `ruby_ring` | Ruby Ring | `syringe` | tok |
| `ruby_amulet` | Ruby Amulet | `—` (pick in viewer) | ⚠ FALLBACK |
| `sapphire` | Sapphire | `sapphire` | tok |
| `infused_sapphire` | Infused Sapphire | `sapphire` | tok |
| `cut_sapphire` | Cut Sapphire | `hotcut` | tok |
| `attuned_sapphire` | Attuned Sapphire | `sapphire` | tok |
| `sapphire_ring` | Sapphire Ring | `sapphire` | tok |
| `sapphire_amulet` | Sapphire Amulet | `sapphire` | tok |
| `emerald` | Emerald | `emerald` | tok |
| `infused_emerald` | Infused Emerald | `emerald` | tok |
| `cut_emerald` | Cut Emerald | `hotcut` | tok |
| `attuned_emerald` | Attuned Emerald | `emerald` | tok |
| `emerald_ring` | Emerald Ring | `emerald` | tok |
| `emerald_amulet` | Emerald Amulet | `emerald` | tok |
| `topaz` | Topaz | `—` (pick in viewer) | ⚠ FALLBACK |
| `infused_topaz` | Infused Topaz | `—` (pick in viewer) | ⚠ FALLBACK |
| `cut_topaz` | Cut Topaz | `hotcut` | tok |
| `attuned_topaz` | Attuned Topaz | `—` (pick in viewer) | ⚠ FALLBACK |
| `topaz_ring` | Topaz Ring | `syringe` | tok |
| `topaz_amulet` | Topaz Amulet | `—` (pick in viewer) | ⚠ FALLBACK |
| `amethyst` | Amethyst | `amethyst_gold_ring` | tok |
| `infused_amethyst` | Infused Amethyst | `amethyst_gold_ring` | tok |
| `cut_amethyst` | Cut Amethyst | `hotcut` | tok |
| `attuned_amethyst` | Attuned Amethyst | `amethyst_gold_ring` | tok |
| `amethyst_ring` | Amethyst Ring | `amethyst_gold_ring` | tok |
| `amethyst_amulet` | Amethyst Amulet | `amethyst_gold_ring` | tok |
| `citrine` | Citrine | `citrine` | tok |
| `infused_citrine` | Infused Citrine | `citrine` | tok |
| `cut_citrine` | Cut Citrine | `hotcut` | tok |
| `attuned_citrine` | Attuned Citrine | `citrine` | tok |
| `citrine_ring` | Citrine Ring | `citrine` | tok |
| `citrine_amulet` | Citrine Amulet | `citrine` | tok |
| `moonstone` | Moonstone | `—` (pick in viewer) | ⚠ FALLBACK |
| `infused_moonstone` | Infused Moonstone | `—` (pick in viewer) | ⚠ FALLBACK |
| `cut_moonstone` | Cut Moonstone | `hotcut` | tok |
| `attuned_moonstone` | Attuned Moonstone | `—` (pick in viewer) | ⚠ FALLBACK |
| `moonstone_ring` | Moonstone Ring | `syringe` | tok |
| `moonstone_amulet` | Moonstone Amulet | `—` (pick in viewer) | ⚠ FALLBACK |
| `scholars_circlet` | Scholar's Circlet | `—` (pick in viewer) | ⚠ FALLBACK |
| `champions_crown` | Champion's Crown | `—` (pick in viewer) | ⚠ FALLBACK |
| `sovereign_crown` | Sovereign's Crown | `—` (pick in viewer) | ⚠ FALLBACK |
| `wardens_circlet` | Warden's Circlet | `—` (pick in viewer) | ⚠ FALLBACK |
| `gold_torc` | Gold Torc | `t_rock_unconnected` | syn |
| `champions_torc` | Champion's Torc | `—` (pick in viewer) | ⚠ FALLBACK |
| `wayfarers_pendant` | Wayfarer's Pendant | `—` (pick in viewer) | ⚠ FALLBACK |
| `sages_pendant` | Sage's Pendant | `—` (pick in viewer) | ⚠ FALLBACK |
| `ember_staff` | Ember Staff | `i_staff` | tok |
| `pyre_staff` | Pyre Staff | `i_staff` | tok |
| `frost_staff` | Frost Staff | `i_staff` | tok |
| `rime_staff` | Rime Staff | `novel_crime` | tok |
| `spark_staff` | Spark Staff | `i_staff` | tok |
| `tempest_staff` | Tempest Staff | `i_staff` | tok |
| `wheel` | Cart Wheel | `wheel` | tok |
| `wheelbarrow` | Wheelbarrow | `—` (pick in viewer) | ⚠ FALLBACK |
| `handcart` | Handcart | `—` (pick in viewer) | ⚠ FALLBACK |
| `dirt` | Barren Dirt | `t_dirtfloor` | tok |
| `poor_soil` | Poor Soil | `t_dirtmound` | syn |
| `loam` | Loam | `t_dirtfloor` | syn |
| `rich_soil` | Rich Soil | `t_dirtmound` | syn |
| `terra_preta` | Terra Preta | `f_firefly_terrarium` | tok |
| `compost` | Compost | `—` (pick in viewer) | ⚠ FALLBACK |
| `fertiliser` | Fertiliser | `—` (pick in viewer) | ⚠ FALLBACK |
| `grain_seed` | Grain Seed | `grain_boiled` | tok |
| `cabbage_seed` | Cabbage Seed | `seeds` | tok |
| `turnip_seed` | Turnip Seed | `seeds` | tok |
| `rye_seed` | Rye Seed | `f_dryer` | tok |
| `kale_seed` | Kale Seed | `seeds` | tok |
| `radish_seed` | Radish Seed | `seeds` | tok |
| `onion_seed` | Onion Seed | `onion` | tok |
| `bean_seed` | Bean Seed | `can_beans` | tok |
| `pea_seed` | Pea Seed | `pear` | tok |
| `fibre_seed` | Fibre Seed | `plant_fibre` | tok |
| `berry_seed` | Berry Seed | `t_shrub_blueberry` | syn |
| `apple_seed` | Apple Pips | `t_tree_apple_vitrified` | syn |
| `grape_seed` | Grape Cuttings | `grapes` | tok |
| `thyme_seed` | Thyme Seed | `thyme` | tok |
| `mint_seed` | Mint Seed | `mintpatties` | tok |
| `prize_seed` | Prize Seed | `seeds` | tok |
| `wheat` | Wheat | `wheat` | tok |
| `cabbage` | Cabbage | `—` (pick in viewer) | ⚠ FALLBACK |
| `turnip` | Turnip | `—` (pick in viewer) | ⚠ FALLBACK |
| `rye` | Rye | `f_dryer` | tok |
| `kale` | Kale | `—` (pick in viewer) | ⚠ FALLBACK |
| `radish` | Radish | `—` (pick in viewer) | ⚠ FALLBACK |
| `onion` | Onion | `onion` | tok |
| `beans` | Beans | `can_beans` | tok |
| `peas` | Peas | `—` (pick in viewer) | ⚠ FALLBACK |
| `apple` | Apple | `t_tree_apple_vitrified` | syn |
| `grapes` | Grapes | `grapes` | tok |
| `thyme` | Thyme | `thyme` | tok |
| `mint` | Mint | `mintpatties` | tok |
| `pumpkin` | Pumpkin | `pumpkin` | tok |
| `flour` | Flour | `—` (pick in viewer) | ⚠ FALLBACK |
| `bread` | Bread | `bread` | tok |
| `simple_pie` | Pie | `mace_simple` | tok |
| `meat_pie` | Pie | `meat` | tok |
| `hearty_pie` | Hearty Pie | `rapier` | tok |
| `honey` | Honey | `honeydew` | tok |
| `malt` | Malt | `—` (pick in viewer) | ⚠ FALLBACK |
| `ale` | Ale | `inhaler` | tok |
| `herbal_tea` | Herbal Tea | `teapot` | tok |
| `wine` | Wine | `wine_glass` | tok |
| `mead` | Mead | `t_alien_meadow_tree_1` | tok |
| `resin` | Tree Resin | `t_resin_hole` | syn |
| `bone_meal` | Bone Meal | `bone` | tok |
| `bone_glue` | Bone Glue | `bone` | tok |
| `hide_glue` | Hide Glue | `acid_soaked_hide` | tok |
| `wooden_bucket` | Wooden Bucket | `wooden_grip` | tok |
| `wooden_barrel` | Wooden Barrel | `wooden_barrel` | syn |
| `tanning_brine` | Tanning Brine | `t_vat_blue` | syn |
| `beast_brine` | Beast Brine | `—` (pick in viewer) | ⚠ FALLBACK |
| `aurochs_meat` | Aurochs Meat | `meat` | tok |
| `mammoth_meat` | Mammoth Meat | `meat` | tok |
| `owlbear_meat` | Owlbear Meat | `meat` | tok |
| `sabretooth_meat` | Sabretooth Meat | `meat` | tok |
| `crocodile_meat` | Crocodile Meat | `meat` | tok |
| `hippogriff_meat` | Hippogriff Meat | `meat` | tok |
| `fowl_meat` | Fowl Meat | `meat` | tok |
| `worg_meat` | Worg Meat | `meat` | tok |
| `ivory` | Ivory | `—` (pick in viewer) | ⚠ FALLBACK |
| `huge_bones` | Huge Bones | `knife_huge_var_knife_butcher` | tok |
| `feathers` | Feathers | `—` (pick in viewer) | ⚠ FALLBACK |
| `aurochs_hide` | Aurochs Hide | `acid_soaked_hide` | tok |
| `worg_hide` | Worg Hide | `acid_soaked_hide` | tok |
| `owlbear_pelt` | Owlbear Pelt | `—` (pick in viewer) | ⚠ FALLBACK |
| `sabretooth_pelt` | Sabretooth Pelt | `—` (pick in viewer) | ⚠ FALLBACK |
| `mammoth_fur` | Mammoth Fur-Hide | `fur` | tok |
| `croc_scaled_hide` | Scaled Crocodile Hide | `acid_soaked_hide` | tok |
| `hippogriff_feathered_hide` | Feathered Hide | `acid_soaked_hide` | tok |
| `cured_beast_hide` | Cured Beast Hide | `raw_cured_fatty_meat` | tok |
| `beast_leather` | Beast Leather | `leather` | tok |
| `boiled_leather` | Boiled Leather | `grain_boiled` | tok |
| `scale_plate` | Scale Plate | `bathroom_scale` | tok |
| `wool` | Wool | `wool_suit` | tok |
| `coarse_wool` | Coarse Wool | `wool_suit` | tok |
| `fine_wool` | Fine Wool | `wool_suit` | tok |
| `felt` | Felt | `felt_patch` | tok |
| `woolcloth` | Woolcloth | `—` (pick in viewer) | ⚠ FALLBACK |
| `cotton_seed` | Cotton Seed | `cotton_ball` | tok |
| `cotton_fiber` | Cotton | `cotton_ball` | tok |
| `cotton_cloth` | Cotton Cloth | `cotton_ball` | tok |
| `raw_silk` | Raw Silk | `tea_raw` | tok |
| `silk_cloth` | Silk Cloth | `cloth_vest_padded` | tok |
| `cushion` | Stuffed Cushion | `—` (pick in viewer) | ⚠ FALLBACK |
| `wool_cloak` | Wool Cloak | `wool_suit` | tok |
| `arcane_robe` | Arcane Robe | `robe_wizard` | tok |
| `quicklime` | Quicklime | `—` (pick in viewer) | ⚠ FALLBACK |
| `mortar` | Mortar | `f_m224_mortar` | tok |
| `crushed_stone` | Crushed Stone | `—` (pick in viewer) | ⚠ FALLBACK |
| `concrete` | Concrete | `t_concrete` | tok |
| `rebar` | Rebar | `rebar` | tok |
| `gem_dust` | Gem Dust | `mask_dust_var_blue_mask_dust` | tok |
| `magic_concrete` | Runed Concrete | `cards_magic` | tok |
| `arcane_resin` | Arcane Binder | `t_resin_hole` | syn |
| `iron_wire` | Iron Wire | `5l_iron` | tok |
| `mail_rings` | Mail Rings | `f_mailbox` | tok |
| `scale_cuirass` | Scale Cuirass | `bathroom_scale` | tok |
| `plate_cuirass` | Steel Plate Cuirass | `hotplate` | tok |
| `great_helm` | Steel Great Helm | `compgreatbow` | tok |
| `beast_leather_plate` | Beast-Leather Plate | `leather` | tok |
| `bone_plated_cuirass` | Bone-Plated Cuirass | `bone` | tok |
| `horned_helm` | Horned Helm | `firehelmet` | tok |
| `ceremonial_plate` | Ceremonial Plate | `hotplate` | tok |
| `regal_robes` | Regal Robes | `—` (pick in viewer) | ⚠ FALLBACK |
| `clay_alembic` | Clay Alembic | `t_clay` | syn |
| `glassware` | Glassware | `—` (pick in viewer) | ⚠ FALLBACK |
| `clay_jug` | Clay Jug | `t_clay` | syn |
| `porcelain_clay` | Porcelain Clay | `t_clay` | syn |
| `porcelain_vessels` | Porcelain Vessels | `porcelain_urn` | tok |
| `tannin` | Tannin Concentrate | `—` (pick in viewer) | ⚠ FALLBACK |
| `dye` | Dye | `hair_dye_kit` | tok |
| `soap` | Soap | `soap` | tok |
| `potion_of_might` | Potion of Might | `—` (pick in viewer) | ⚠ FALLBACK |
| `draught_of_vigor` | Draught of Vigor | `—` (pick in viewer) | ⚠ FALLBACK |
| `elixir_of_grace` | Elixir of Grace | `—` (pick in viewer) | ⚠ FALLBACK |
| `tonic_of_fortitude` | Tonic of Fortitude | `—` (pick in viewer) | ⚠ FALLBACK |
| `magic_alloy_bar` | Magic-Alloy Bar | `cards_magic` | tok |
| `enchant_thread` | Enchant-Thread | `thread` | tok |
| `runed_block` | Runed Block | `wood_block` | tok |