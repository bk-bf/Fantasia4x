# AUDIT

Master checklist of system audits. Driven via headless sim (`./dev.sh --headless` → `/api/sim/*`; dev verbs in `sim/commands.ts`). Tick a box only when a headless run confirms it. ⚠ = known defect. `T0–3` = toolTier. `⚙` = passive station.

Audit only what's implemented. An unrealistic simplification that doesn't match the rest of the game is either a misunderstanding (raise it) or deliberate (track *why* here) — never just pass it.

## Done (this session)

- [x] Headless sim end-to-end — session/tick/command/state/query/save/load/trace verified live over curl
- [x] Creature AI sweep (map full of mobs, monitored logs)
  - [x] Pathfinding — no stuck/oscillating pathing under Node
  - [x] Needs/hunger driving FSM correctly
  - [x] ⚠→fixed: sated predators froze (Wander↔Hunting flip) — opp-hunt vs sated-exit contradiction; gated opp-hunt on hunger. See [BUGS](../../game/BUGS.md)
  - [x] Dev-spawned hunters auto-assigned a nearby lair

## Crafting & building

### Known defects (repro headless → fix)
- [x] ⚠→fixed: Lower-tier station disappeared when higher tier built. Root cause was UI-only — `craftLanes` (CraftingScreen) only surfaced station types already hosting an order, so once auto-assign funnelled everything to the workbench the craft_spot got no droppable lane and was unreachable. The service already supports it (`stationFulfills` true for craft_spot↔craft_spot, `moveCraftOrder` re-pins, `craft.ts` runs one order per physical station in parallel). Fix: `craftLanes` now shows a lane for **every** complete station that can host a queued recipe, including idle lower/alternate tiers. Auto-assign still prefers the top tier (`bestCraftStation` unchanged).
- [ ] ⚠ Fermentation ignores temperature — `processPassiveProduction` runs a pure timer with no temp gate. **Confirmed oversight**: fermentation should only proceed in an optimal temp range (expected temp-dependent). Needs a temp window on fermenter/brewing_barrel recipes.
- [ ] ⚠ Onion-on-grass tile not cleared — `plant.ts complete()` skips regrowing grass (count 0, growth>0) ([plant.ts:122](../../../src/lib/game/services/jobs/plant.ts#L122))
- [ ] ⚠ `make_hide_arrow_sheath` — eats generic `hide` (no source); should be `acceptsCategory:"hide"`
- [ ] ⚠ `ferment_mead` — needs `honey` (no source, awaits beekeeping)
- [ ] ⚠ `dressing_stone` (+0.25 yield) — zero recipes authored to it; dead station or yield routes elsewhere?
- [ ] `make_firestarter` disabled — confirm intentional
- [ ] low-work outliers: `make_woven_basket`, `make_wicker_vest` (huge material, ~0 work)

### Recipes craftable + sane materials (every recipe, grouped by station)
- [ ] chopping_block: split_firewood, hew_beam
- [ ] charcoal_pit⚙: burn_charcoal, make_coke
- [ ] sawtable: saw_pine_planks, make_{oak,birch,ash,yew,willow}_plank, make_tanning_bucket, make_wooden_chest, make_wheelbarrow, make_handcart
- [ ] heartwood_joiner: make_{heartwood,moonwood,ironwood,emberwood}_plank
- [ ] hide_rack⚙: make_cured_{thin,light,sturdy,heavy,thick}_hide, cure_beast_hide
- [ ] tanning_rack: make_{thin,light,sturdy,heavy,thick}_leather, harden_boiled_leather
- [ ] tanning_bucket_station⚙: tan_{thin,light,sturdy,heavy,thick}_leather_bucket
- [ ] beast_tanning_bucket⚙: tan_beast_leather, tan_scale_plate
- [ ] hearth: make_ash, make_animal_fat, boil_bone_glue, boil_hide_glue
- [ ] campfire (cooking): make_spit_meat, make_{small,fine,lavish}_stew, make_pottage, brew_herb_tea, make_clay_cooking_pot
- [ ] quern: mill_flour, grind_bone_meal
- [ ] oven: bake_bread, bake_{simple,,hearty}_pie
- [ ] fermenter⚙: malt_grain, brew_ale, ferment_wine, ⚠ferment_mead
- [ ] brewing_barrel⚙: brew_tanning_brine, brew_beast_brine
- [ ] compost_bin⚙: make_compost, make_fertiliser
- [ ] resin_tap⚙: tap_resin
- [ ] carpenter_bench: make_wooden_bucket, make_wooden_barrel
- [ ] ropewalk: make_rope
- [ ] masons_bench: make_{granite,limestone,sandstone,marble}_block, make_slate_tile, make_mortar, crush_stone, make_concrete, mix_magic_concrete
- [ ] pottery_kiln⚙: make_fired_brick, make_fire_bricks, make_water_urn, make_clay_mold, make_clay_roof_tile, burn_quicklime, fire_clay_alembic
- [ ] advanced_kiln⚙: blow_glassware
- [ ] potters_wheel: throw_clay_jug
- [ ] porcelain_workshop: refine_porcelain_clay, fire_porcelain_vessels
- [ ] spinning_wheel: spin_thread
- [ ] weaving_frame: weave_linen, weave_cotton, reel_silk, card_wool, comb_fine_wool, make_felt, weave_woolcloth, make_cushion, make_wool_cloak, make_linen_gambeson, make_direwolf_warcloak, make_regal_robes
- [ ] stone_forge⚙: make_{copper,tin,lead,silver,gold}_bar
- [ ] casting_hearth: make_bronze_bar, make_bronze_nail, make_tile_mold, make_cast_sling_bullet, make_bronze_punch_dagger, make_leaf_blade_spear, make_cast_bronze_hatchet, make_cast_bronze_skullcap
- [ ] bloomery⚙: make_iron_bar
- [ ] finery_forge⚙: make_steel_bar
- [ ] crucible_steelworks: make_crucible_steel
- [ ] blast_furnace: smelt_blast_steel
- [ ] clockwork_bench: make_mechanism
- [ ] anvil — tools: make_{iron,steel}_{tongs,axe,hammer,shovel,hoe}
- [ ] anvil — fasteners/wire: make_iron_nail, make_steel_rivet, draw_rebar, draw_iron_wire, make_mail_rings
- [ ] anvil — blades: make_short_seax, make_spatha, make_iron_rondel, make_iron_estoc, make_steel_{longsword,greatsword,stiletto,rapier,cleaver,greatcleaver}, make_iron_greatsword
- [ ] anvil — impact: make_iron_{mace,warhammer}, make_steel_{mace,warhammer,flail,pike}
- [ ] anvil — ranged/ammo: make_crossbow, make_{iron_arrow,iron_bolt,broadhead_arrow,barbed_arrow,heavy_quarrel}, make_{stiffened_war,banded_bolt}_quiver
- [ ] anvil — armor: make_mail_coif, make_mail_hauberk, make_iron_nasal_helm, make_iron_gauntlets, make_iron_shod_boots, make_iron_gorget, make_brigandine_coat, make_iron_boss_shield, make_cave_bear_plate, make_wheel
- [ ] anvil — steel plate (T3): make_plate_cuirass, make_great_helm, make_ceremonial_plate
- [ ] makers_bench — tools: make_saw, make_stone_{pick,hoe,spear,spade}, make_bone_cleaver, make_candle
- [ ] makers_bench — melee: make_flint_handaxe, make_bone_knife, make_antler_club, make_bone_tipped_spear, make_fang_reaver
- [ ] makers_bench — ranged: make_{self_bow,hunting_recurve,war_bow,sling,blowgun}, make_throwing_{stone,spear}, make_{blow_dart,sling_stone,flint_arrow,bone_arrow}
- [ ] makers_bench — shields/carry: make_wattle_buckler, make_rawhide_round_shield, make_woven_basket, make_hide_scrip, make_hide_tool_roll, make_linen_snapsack, make_wicker_frame_pack, ⚠make_hide_arrow_sheath, make_leather_back_quiver, make_leather_bolt_case
- [ ] makers_bench — armor: make_rangers_hood, make_archers_bracers, make_marksmans_cloak, make_raw_hide_vest, make_soot_darkened_jerkin, make_padded_cap, make_boiled_leather_jerkin, make_leather_coif, make_stitched_gauntlets, make_tallow_boots, make_scale_cuirass, make_beast_leather_plate, make_bone_plated_cuirass, make_horned_helm
- [ ] craft_spot: make_cordage, make_torch, make_chewed_poultice, make_mud_brick, make_flint_{knife,sickle}, make_stone_{chopper,axe,hammer,maul}, make_digging_stick, make_wooden_tongs, make_wicker_vest (+ ⚠make_firestarter disabled)
- [ ] lapidary_bench: cut_{ruby,sapphire,emerald,topaz,amethyst,citrine,moonstone}, attune_*, make_*_ring, make_*_amulet, crowns/pendants, grind_gem_dust, grind_mana_crystal, make_arcane_resin
- [ ] runecarver_bench: make_{ember,frost,spark}_staff
- [ ] attunement_altar: make_{pyre,rime,tempest}_staff, make_stargazer_circlet
- [ ] runic_crucible/loom/glyph: smelt_magic_alloy, make_arcane_robe, spin_enchant_thread, cut_runed_block
- [ ] alchemy_lab: distil_tannin, make_dye, make_soap, brew_{might,vigor,grace,fortitude} potions, brew_{bloodrage,ironhide,vigor,calming,nightglow,frenzy}_draught, brew_venom_coating

### Stations & navigation
- [ ] Recipe blocked when required station absent; pawn navigates to station tile to craft
- [x] Tier coexistence: craft_spot stays a droppable lane after makers_bench/carpenter_bench exist (fixed — see Known defects)
- [ ] Higher tier preferred when unpinned; `craftingBonusOf` feeds speed/quality
- [ ] Specialised (non-tiered) stations never superseded; passive⚙ stations process with no pawn; fuel stations refuse cold; `maxCount` enforced

### Weapons
- [ ] Melee → mainHand (2H blocks offHand); shields → offHand; 2H+shield blocked; `wieldRequirement.strength` gates
- [ ] Damage in damMin–damMax; damageType/AP/armorDamage/stun/knockback/on-hit conditions apply
- [ ] finesse→PER, strScaled→STR, arcane→INT (no STR+INT double-dip on staves); attackSpeed/reach respected
- [ ] Ranged: fires only with matching-category ammo carried; no phantom shots at 0 ammo; consumes 1/shot; stops when empty; wrong ammo doesn't feed; drawPower multiplies ammo dmg; crossbow slower reload; recoverable ammo retrieved
- [ ] Magic staves: channeled (no ammo), pay staminaCost as mana, stop when mana out

### Gear
- [ ] Worn armor raises armorValue on covered parts (sane values); layers stack; resistances apply
- [ ] Hit on covered part mitigated (no hit-through); uncovered part bypasses; fatigue/movePenalty apply
- [ ] armorDamage degrades worn armor; shields mitigate via defense/parry not armorValue
- [ ] Jewelry grants conditions while worn (removed on unequip); aim gear/quivers feed ranged; cold/heat/stealth mods feed their systems

### Capacity & hauling
- [ ] Worn carriers add inventoryBonus to carry budget; back-slot carriers compete
- [ ] Carts (wheelbarrow/handcart) boost budget + used by haul jobs; quivers add carry+drawspeed
- [ ] Liquid containers track fill/capacity; static storage holds off-budget; carry budget enforced on pickup

### Time-based progression
- [ ] Drying (plant_fiber→hay, meat→dried, wood seasoning) — respects temp (<12°C slow, ≥28 fast) & wetness (soaked reverses); fire-ring faster
- [ ] Fuel depletes per tick, fire dies at empty, cold fire won't process — wet fuel burns worse? raise if inconsistent or track reason
- [ ] Fermentation (ale/wine/mead/brines) passive timer, respects minFuelHeat — ⚠ ignores temp (see Known defects)
- [ ] Spoilage: food→decaysTo, freezing halts, preservation+roof slow; drying/spoiling mutually exclusive
- [ ] Item deterioration by category every 600 ticks, roof/stored exempts — flat rate, no temp/wetness; raise if unrealistic or track reason
- [ ] Building condition by material×weatherExposure (rain/snow up to 3×), roof shelters; decay buildings need repair

### Crops
- [ ] All 17 crops plantable in soil grow-zone; plant job per eligible tile
- [ ] Tile→empty dirt at plant (clears regrowing grass ⚠); crop glyph only after 20% growth
- [ ] Growth 0→100 gated by temp/moisture/soil/light; 100% yields harvestable; harvest resets tile
- [ ] Soil terraform (lay_poor/loam/rich/terra_preta) changes subterrain + growth rate

### Butchery
- [ ] Gating: needs knife/butchery tool; T2 needs tier 2 — below-tier pawn blocked
- [ ] Spoiled carcass yields proportionally less (conditionMult)
- [ ] butcher_spot T0 — all common game: make_{rabbit,venison,wolf,bear,boar,elk,goat,chicken,rat,aurochs,mammoth,owlbear,sabretooth,crocodile,hippogriff,hoarfowl,worg,jackal,quillback,olm}_meat, harvest_thornwood_silk
- [ ] butcher_spot T0 — humanoid remains (bones/sinew only): make_{goblin,kobold,gnoll,orc,harpy,bullywug,stirge,viper}_remains; make_salted_meat
- [ ] butcher_spot T1 — boss render: render_great_{wolf,bear,boar,weaver}
- [ ] flensing_table T2: make_{dire_wolf,cave_bear,direboar,broodmother}
- [ ] sanguinary_altar T2 — full flense (rare organs): flense_great_{wolf,bear,boar,weaver}
- [ ] ~220 creatures have NO butchery recipe — list spawnable un-butcherable carcasses; decide add/generic/none

### Pawn skill effects
- [ ] Skill speeds craft (getWorkModifiers) & raises output quality (itemQuality §Q)
- [ ] Butchery skill raises yield; recipe→discipline routing correct (craftDiscipline)
- [ ] Zero-skill pawn still completes T0 (no bootstrap deadlock); tool-tier gates only where intended
- [ ] Quality matters downstream (better weapon/armor/tool stats into combat/work)

## Other categories (not yet audited)

- [ ] Combat resolution — hit/dodge/parry rolls, wound/limb model, death conditions, ranged vs melee balance
- [ ] Needs & mood — hunger/sleep/comfort/social decay rates, mood effects, break thresholds
- [ ] Social — relationships, dialog, prestige, kingdom events
- [ ] Research — unlock gating, tier progression, cost balance
- [ ] Exploration & fog-of-war — reveal, nearest-entity queries, spatial correctness
- [ ] World/weather — seasons, temperature, wetness, biome variants, terrain effects
- [ ] Economy balance — resource flow, tool bootstrap (ADR-009), scarcity gates (flint)
- [ ] Save/load & determinism — seed replay byte-identical across all presets
