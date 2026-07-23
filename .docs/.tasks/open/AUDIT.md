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
- [x] Headless crafting made usable + swept: crafting works end-to-end (queue→fetch→walk→craft→output). Fixes landed while driving it:
  - [x] `buildScenario` now auto-designates a stockpile (shipped a zero-tile zone → crafts silently stalled)
  - [x] `devToggleDecay {kind:'deterioration'|'spoilage'}` — freeze weather wear (buildings+items) / food+carcass spoilage so dev-spawned stuff survives a test
  - [x] Root finding: `getRecipeForItem` = first-producer-wins → 25 recipes sharing an output are unreachable via the card. **18 butchery ones FIXED** (see Butchery); **7 non-butchery remain** (see below)

## Crafting & building

### Known defects (repro headless → fix)
- [x] ⚠→fixed: Lower-tier station disappeared when higher tier built. Root cause was UI-only — `craftLanes` (CraftingScreen) only surfaced station types already hosting an order, so once auto-assign funnelled everything to the workbench the craft_spot got no droppable lane and was unreachable. The service already supports it (`stationFulfills` true for craft_spot↔craft_spot, `moveCraftOrder` re-pins, `craft.ts` runs one order per physical station in parallel). Fix: `craftLanes` now shows a lane for **every** complete station that can host a queued recipe, including idle lower/alternate tiers. Auto-assign still prefers the top tier (`bestCraftStation` unchanged).
- [x] ⚠→fixed: Fermentation ignored temperature. Added `fermentTempRate(temp)` (EnvironmentService, two-sided window: dormant ≤4°C, full 15–28°C, killed ≥40°C — mirrors the drying gate but with an upper bound); `processPassiveProduction` now scales the fermenter's passive work by the station tile's temp, stalling when too cold/hot. Data-driven via `effects.fermentation` on the fermenter (brewing_barrel brines unaffected).
- [x] ⚠→fixed: Onion-on-grass tile not cleared. `plant.ts complete()` now clears occupants by resource count **or** a live growth entry, so a regrowing grass_patch (count 0, growth>0) is stripped and the tile renders dirt→crop correctly. Count-0 patches strip with no drops (no extra rng draw → determinism preserved).
- [x] ⚠→fixed: `make_hide_arrow_sheath` now uses `cured_light_hide` (was the sourceless generic `hide`). Audit of all `hide` inputs: this was the only broken one — the other `hide` uses are `acceptsCategory:"hide"` dynamic slots on rawhide products (raw_hide_vest, rawhide_round_shield), which correctly use raw hide by design.
- [x] ⚠→fixed: `ferment_mead` removed (beekeeping deferred). Replaced with `ferment_cider` (apples → cider) — a `cider` drink item brewable from existing apples at the fermenter. Mead item → cider; honey/fermenter text de-referenced.
- [x] ⚠→fixed: `dressing_stone` was dead (no recipes + `butcheryYieldBonus` read by zero code). Gave butchery stations their own tier ladder (`effects.butcheryTier` 0/1/2/3, separate from the generic tier) so any butchery station renders lower-tier butcher_spot recipes; wired `butcheryYieldBonus` into `craft.ts` so the ACTUAL station's bonus multiplies meat/hide/bone (dressing_stone +25%, flensing/altar +45%). Verified: small_bones 4→5 at a dressing stone.
- [x] ⚠→fixed: `make_firestarter` removed (deprecated recipe + commented-out item both deleted).
- [x] ⚠→fixed: low-work outliers rebalanced — `make_woven_basket` workAmount 2→10, `make_wicker_vest` 5→12 (proportionate to snapsack 8 / gambeson 12 given their material cost).

### Recipes craftable + sane materials (every recipe, grouped by station)

**Swept via headless (`_auditSweep`): 326/334 targets queue (real `craftItem` gating + reservation + carcass dispatch) AND produce correct outputs (`completeCraftOrder`) in a fully-provisioned colony (all research, tool tier 3, every station built, deterioration frozen). Butchery tested per-carcass. Only failures = the 8 shadowed non-butchery duplicates below.** Pawn fetch/walk/craft pipeline verified separately for representatives (cordage etc.); fuel/lighting for passive furnaces is pawn-driven and not exercised per-recipe here.

- [x] chopping_block: split_firewood, hew_beam
- [x] charcoal_pit⚙: burn_charcoal, make_coke
- [x] sawtable: saw_pine_planks, make_{oak,birch,ash,yew,willow}_plank, make_tanning_bucket, make_wooden_chest, make_wheelbarrow, make_handcart
- [x] heartwood_joiner: make_{heartwood,moonwood,ironwood,emberwood}_plank
- [x] hide_rack⚙: make_cured_{thin,light,sturdy,heavy,thick}_hide, cure_beast_hide
- [x] tanning_rack: make_{thin,light,sturdy,heavy,thick}_leather, harden_boiled_leather
- [ ] ⚠ tanning_bucket_station⚙: tan_{thin,light,sturdy,heavy,thick}_leather_bucket — ALL 5 SHADOWED by tanning_rack `make_*_leather` (whole station dead; needs per-recipe card or prune)
- [x] beast_tanning_bucket⚙: tan_beast_leather, tan_scale_plate
- [x] hearth: make_animal_fat, boil_bone_glue, boil_hide_glue — ⚠ `make_ash` SHADOWED by burn_charcoal byproduct
- [x] campfire (cooking): make_spit_meat, make_{small,fine,lavish}_stew, make_pottage, brew_herb_tea, make_clay_cooking_pot
- [x] quern: mill_flour, grind_bone_meal
- [x] oven: bake_bread, bake_{simple,,hearty}_pie
- [x] fermenter⚙: malt_grain, brew_ale, ferment_wine, ferment_cider
- [x] brewing_barrel⚙: brew_tanning_brine, brew_beast_brine
- [x] compost_bin⚙: make_compost, make_fertiliser
- [x] resin_tap⚙: tap_resin
- [x] carpenter_bench: make_wooden_bucket, make_wooden_barrel
- [x] ropewalk: make_rope
- [x] masons_bench: make_{granite,limestone,sandstone,marble}_block, make_slate_tile, make_mortar, crush_stone, make_concrete, mix_magic_concrete
- [x] pottery_kiln⚙: make_fired_brick, make_fire_bricks, make_water_urn, make_clay_mold, make_clay_roof_tile, burn_quicklime, fire_clay_alembic
- [x] advanced_kiln⚙: blow_glassware
- [x] potters_wheel: throw_clay_jug
- [x] porcelain_workshop: refine_porcelain_clay, fire_porcelain_vessels
- [x] spinning_wheel: spin_thread
- [x] weaving_frame: weave_linen, weave_cotton, reel_silk, card_wool, comb_fine_wool, make_felt, weave_woolcloth, make_cushion, make_wool_cloak, make_linen_gambeson, make_direwolf_warcloak, make_regal_robes
- [x] stone_forge⚙: make_{copper,tin,lead,silver,gold}_bar
- [x] casting_hearth: make_bronze_bar, make_bronze_nail, make_tile_mold, make_cast_sling_bullet, make_bronze_punch_dagger, make_leaf_blade_spear, make_cast_bronze_hatchet, make_cast_bronze_skullcap
- [x] bloomery⚙: make_iron_bar
- [x] finery_forge⚙: make_steel_bar
- [x] crucible_steelworks: make_crucible_steel
- [ ] ⚠ blast_furnace: smelt_blast_steel — SHADOWED by finery `make_steel_bar` (bulk-steel path dead; keep + expose or prune)
- [x] clockwork_bench: make_mechanism
- [x] anvil — tools: make_{iron,steel}_{tongs,axe,hammer,shovel,hoe}
- [x] anvil — fasteners/wire: make_iron_nail, make_steel_rivet, draw_rebar, draw_iron_wire, make_mail_rings
- [x] anvil — blades: make_short_seax, make_spatha, make_iron_rondel, make_iron_estoc, make_steel_{longsword,greatsword,stiletto,rapier,cleaver,greatcleaver}, make_iron_greatsword
- [x] anvil — impact: make_iron_{mace,warhammer}, make_steel_{mace,warhammer,flail,pike}
- [x] anvil — ranged/ammo: make_crossbow, make_{iron_arrow,iron_bolt,broadhead_arrow,barbed_arrow,heavy_quarrel}, make_{stiffened_war,banded_bolt}_quiver
- [x] anvil — armor: make_mail_coif, make_mail_hauberk, make_iron_nasal_helm, make_iron_gauntlets, make_iron_shod_boots, make_iron_gorget, make_brigandine_coat, make_iron_boss_shield, make_cave_bear_plate, make_wheel
- [x] anvil — steel plate (T3): make_plate_cuirass, make_great_helm, make_ceremonial_plate
- [x] makers_bench — tools: make_saw, make_stone_{pick,hoe,spear,spade}, make_bone_cleaver, make_candle
- [x] makers_bench — melee: make_flint_handaxe, make_bone_knife, make_antler_club, make_bone_tipped_spear, make_fang_reaver
- [x] makers_bench — ranged: make_{self_bow,hunting_recurve,war_bow,sling,blowgun}, make_throwing_{stone,spear}, make_{blow_dart,sling_stone,flint_arrow,bone_arrow}
- [x] makers_bench — shields/carry: make_wattle_buckler, make_rawhide_round_shield, make_woven_basket, make_hide_scrip, make_hide_tool_roll, make_linen_snapsack, make_wicker_frame_pack, make_hide_arrow_sheath, make_leather_back_quiver, make_leather_bolt_case
- [x] makers_bench — armor: make_rangers_hood, make_archers_bracers, make_marksmans_cloak, make_raw_hide_vest, make_soot_darkened_jerkin, make_padded_cap, make_boiled_leather_jerkin, make_leather_coif, make_stitched_gauntlets, make_tallow_boots, make_scale_cuirass, make_beast_leather_plate, make_bone_plated_cuirass, make_horned_helm
- [x] craft_spot: make_cordage, make_torch, make_chewed_poultice, make_mud_brick, make_flint_{knife,sickle}, make_stone_{chopper,axe,hammer,maul}, make_digging_stick, make_wooden_tongs, make_wicker_vest
- [x] lapidary_bench: cut_{ruby,sapphire,emerald,topaz,amethyst,citrine,moonstone}, attune_*, make_*_ring, make_*_amulet, crowns/pendants, grind_gem_dust, make_arcane_resin — ⚠ `grind_mana_crystal` SHADOWED by grind_gem_dust
- [x] runecarver_bench: make_{ember,frost,spark}_staff
- [x] attunement_altar: make_{pyre,rime,tempest}_staff, make_stargazer_circlet
- [x] runic_crucible/loom/glyph: smelt_magic_alloy, make_arcane_robe, spin_enchant_thread, cut_runed_block
- [x] alchemy_lab: distil_tannin, make_dye, make_soap, brew_{might,vigor,grace,fortitude} potions, brew_{bloodrage,ironhide,vigor,calming,nightglow,frenzy}_draught, brew_venom_coating

### Stations & navigation
- [x] Recipe blocked when required station absent (canQueueCraft station gate); pawn navigates to station tile to craft (verified headless for representatives — cordage etc.)
- [x] Tier coexistence: craft_spot stays a droppable lane after makers_bench/carpenter_bench exist (fixed — see Known defects)
- [x] Higher tier preferred when unpinned (`bestCraftStation`); `craftingBonusOf` feeds workRequired (speed)
- [ ] Specialised (non-tiered) stations never superseded; passive⚙ stations process with no pawn; fuel stations refuse cold; `maxCount` enforced

### Weapons
- **Combat verified headless** (`_weaponsAudit`, 5/5). Two headless facts had to be understood first: attack cadence ≈ 133 ticks (`BASE_ATTACK_INTERVAL_TICKS 120` / attackSpeed, `TICKS_PER_SECOND 60`) so fights need HUNDREDS of ticks; and the sim starts at NIGHT (`ambientLight 0.15`) so mobs don't self-aggro (vision-gated) — an explicit draft attack order drives the fight regardless. New lever added: `devSpawnMobAt {creatureId,x,y}`.
- [x] Melee equips `mainHand` + deals damage of the weapon's type (iron_mace → goblin Corpse; `resolveHit` avg 44, type blunt).
- [x] finesse→PER (steel_rapier PER6 avg 10.4 → PER26 avg 43.6), arcane→INT (ember_staff INT6 6.5 → INT26 25.8), AP applied (armor mitigation below). — *exact damMin–damMax band, strScaled numeric, armorDamage/stun/knockback/on-hit conditions, attackSpeed/reach still not asserted*
- [x] Ranged ammo lifecycle: fires only with matching ammo + consumes it (war_bow arrows 8→6); NO phantom shots at 0 ammo (goblin unharmed, holds); WRONG ammo doesn't feed (bolts in a bow untouched, no fire). — *drawPower scaling / crossbow reload / recoverable-retrieval not yet asserted numerically*
- [x] Magic staves: channeled (no ammo), pays `staminaCost` as mana (ember_staff stamina 124→117 per cast)
- [x] Shield equips to `offHand`. 2H + off-hand is ALLOWED (not forbidden) but penalized: ⚠→fixed with the new `fouled_guard` transient condition — granted when a `twoHanded` mainHand shares the hands with an off-hand item, it scales the DERIVED combat values (not base attributes) to 0.5: dodge, hitChance (aim), attackSpeed, weaponDamage, critChance. Verified headless: 2H+shield vs clean 2H → hit 0.67→0.33, dmg 50.1→25.2, crit 0.06→0.03. (Wired via a generalized `Combat.conditionMult(entity, key)`.) `wieldRequirement.strength` still not exercised.

### Gear
- [x] Worn armor mitigates incoming damage (plate_cuirass: `resolveHit` avg 44 → 32.7). — *per-part coverage, layer-stacking, individual slash/crush/pierce resistances, sane-per-piece values not yet asserted individually*
- [ ] Hit on covered part mitigated (no hit-through); uncovered part bypasses; fatigue/movePenalty apply — *needs per-body-part resolveHit control*
- [x] ⚠→fixed: **shields were near-useless** — one flat ×1.25 dodge, tier-independent, with `defense`/`parryChance`/`bashDamage`/`kickDamage` all dead. Rebuilt as a real **block/parry** axis (2nd negation path, distinct from dodge): new `block` stat (CON + body mass, NOT weight-penalized → the heavy tank's negation); shields add `blockBonus` (the tier ladder made real, 0.12→0.34), a `parryChance` (deflect + **immediate guaranteed free counter**), and on-hit **shield-bash** procs (stagger/knockback/knockdown, heavy tiers). Block covers melee + reduced-vs-ranged. Verified headless: no-shield 26/300 negated → iron shield 131/300 (block 124 + parry 7); buckler 79 < iron boss 127; live bash staggers/knocks down. `SHIELD_DODGE_MULT` removed (no more dodge double-dip). Layer 2 (dodge/block build traits) + creature block deferred. — *armorDamage degradation still not asserted*
  - **Shield audit (adversarial, `_shieldAudit`, 6/6):** ✓ block scales with CON (0.41→0.46); ✓ **the key coherence claim** — block stays high under heavy full-plate (0.42) while dodge stays low (0.18), i.e. the tank blocks rather than evades; ✓ block+parry CAPPED (extreme CON40/140kg tank = 0.57 block, 0.60 negated, still eats real hits — `BLOCK_CAP` holds); ✓ bash procs are heavy-shield only (buckler produces no stagger); ✓ tier ladder + parry occurrence (from `_shieldBlock`). Two findings surfaced, **your call** (not fixed):
    - ⚠ **Mobs get ~1.8% innate block** — the `block` stat is CON+mass, and mobs have CON, so every creature now negates ~2% of melee even with no shield. Creature block was deferred (Layer 3). Tiny, but unintended: gate block behind holding a shield, keep it as negligible "bracing", or make innate block pawn-only?
    - ⚠ **2H + shield gets BOTH the `fouled_guard` debuff AND full shield block/parry** (block 0.47) — so the combo is tanky-defense + crippled-offense (−50% dmg/aim/speed/crit). Coherent defensive-2H niche, or should `fouled_guard` also cut block so a two-hander can't freeload a shield's defense?
- [x] Jewelry grants conditions while worn (ruby_ring → `might` in transientConditions; re-derived each tick, auto-clears on unequip). — *aim gear/quivers → ranged, cold/heat/stealth mods still not asserted*

### Capacity & hauling
- [x] Worn carriers add inventoryBonus to carry budget (wicker_frame: `getCarryBudget` maxWeightKg 16.3→28.3, +12kg). — *back-slot competition not yet asserted*
- [ ] Carts (wheelbarrow/handcart) boost budget + used by haul jobs; quivers add carry+drawspeed
- [ ] Liquid containers track fill/capacity; static storage holds off-budget; carry budget enforced on pickup

### Time-based progression
- [ ] Drying (plant_fiber→hay, meat→dried, wood seasoning) — respects temp (<12°C slow, ≥28 fast) & wetness (soaked reverses); fire-ring faster
- [ ] Fuel depletes per tick, fire dies at empty, cold fire won't process — wet fuel burns worse? raise if inconsistent or track reason
- [x] Fermentation (ale/wine/cider) temp-gated via `fermentTempRate` (dormant <4°C, full 15–28, killed >40); brines stay a plain passive timer
- [ ] Spoilage: food→decaysTo, freezing halts, preservation+roof slow; drying/spoiling mutually exclusive
- [ ] Item deterioration by category every 600 ticks, roof/stored exempts — flat rate, no temp/wetness; raise if unrealistic or track reason
- [ ] Building condition by material×weatherExposure (rain/snow up to 3×), roof shelters; decay buildings need repair

### Crops
- [ ] All 17 crops plantable in soil grow-zone; plant job per eligible tile
- [ ] Tile→empty dirt at plant (clears regrowing grass ⚠); crop glyph only after 20% growth
- [ ] Growth 0→100 gated by temp/moisture/soil/light; 100% yields harvestable; harvest resets tile
- [ ] Soil terraform (lay_poor/loam/rich/terra_preta) changes subterrain + growth rate

### Butchery
- Yield-vs-speed rule (established): butchery stations give a **yield** bonus (better tools → more off a carcass); stations where more-out-than-in makes no sense (tools, smelting ore→ingots, cooking) give **speed** (`craftingBonus`) instead. Fires give more max fuel. Generic stations already give speed; butchery yield now wired.
- [x] Butchery yield bonus wired + tier ladder (`butcheryTier`): dressing_stone/flensing/altar render lower recipes and their `butcheryYieldBonus` (+25/+45%) multiplies output
- [x] ⚠→fixed: great-carcass renders/flenses + humanoid `*_remains` + jackal/quillback/olm were UNREACHABLE (their meat/bones dispatched to a different recipe). Root: butchery dispatched by output meat, and the carcass-card path was dead (`isCarcass` never set → carcass cards never rendered). Fix: `isCarcass` derived from `category==='carcass'` at the item index; orders carry `recipeId`; `craftItem`/`canQueueCraft`/`completeCraftOrder` dispatch butchery by the CARCASS (`resolveCarcassRecipe`, picks the best built station via `butcheryTier`); crafting-screen carcass cards gated on `category` + yields from the recipe. Verified headless: great_wolf→render_great_wolf, goblin→make_goblin_remains, dire_wolf→make_dire_wolf @flensing_table.
- [ ] ⚠ 7 NON-butchery recipes still shadowed (share an output at a different station): `smelt_blast_steel` (vs make_steel_bar), `grind_mana_crystal` (vs grind_gem_dust), `make_ash` (vs burn_charcoal byproduct), `tan_{thin,light,sturdy,heavy,thick}_leather_bucket` (vs tanning_rack). The `recipeId`-on-order plumbing is in place; they need the crafting screen to offer a card PER RECIPE for multi-recipe outputs (or removal if redundant). **Your call: per-recipe cards vs prune.**
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
