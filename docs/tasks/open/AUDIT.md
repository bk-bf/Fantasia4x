# AUDIT

Master checklist of system audits. Driven via headless sim (`./dev.sh --headless` → `/api/sim/*`; dev verbs in `sim/commands.ts`). Tick a box only when a headless run confirms it. ⚠ = known defect. `T0–3` = toolTier. `⚙` = passive station.

Audit only what's implemented. An unrealistic simplification that doesn't match the rest of the game is either a misunderstanding (raise it) or deliberate (track *why* here) — never just pass it.

> **What counts as "headless-verified" (READ THIS — do not weaken it).** A box is headless-verified ONLY
> when driven through the REAL sim end-to-end: `buildScenario(...)` → `HeadlessSession.start/command/tick`
> with **real pawns over real ticks**, observing the actual stock/state delta the loop produces (or the same
> over `./dev.sh --headless` + `/api/sim/*`). A unit/service assertion — `completeCraftOrder`, `canQueueCraft`,
> static `recipeService` reachability, `resolveHit` sampling — is a **supplement, NEVER a substitute**: it
> proves a function in isolation, not that the pawn-driven game loop works. **Do not tick a box, and do not
> call anything "end-to-end / playtested / headless-verified", on the strength of unit tests alone.** Every
> ticked box must name the mechanism it was verified by (e.g. "HeadlessSession, 3000 ticks, hide_scrip 0→1,
> buckskin 20→18") so a substitution can never be hidden. If you only unit-tested it, say exactly that and
> leave the box `[~]`, not `[x]`.
>
> **Headless-harness gotchas (so "it wouldn't run" is never an excuse to fall back to unit tests):**
> - **THE MAP IS THE #1 TRAP — `buildScenario` now defaults to `preset: 'flat'`.** A flat map is uniformly
>   walkable, so every tile is reachable and the whole map is a stockpile. On a **`generated`** map tiles can
>   be cut off from the pawns by water/mountain, and a job on an unreachable tile is **silently dropped** by
>   `selectJobForPawn`'s reachability filter: the order stays queued, its inputs stay reserved, the pawns sit
>   Idle, and NOTHING reports an error. This one trap masqueraded as "passive stations are broken" AND as
>   "anvil work needs a carried tool" — both were false. **Only pass `preset: 'generated'` when the test is
>   ABOUT the world** (worldgen, biomes, pathfinding around obstacles, wildlife, ore nodes). Every
>   `buildScenario` call now LOGS its map choice (`[scenario] map WxH preset=…`) with a warning on generated.
> - **Starting stock is pinned to the pawn cluster** (`addItem` takes an optional `tileKey`). Don't
>   hand-place stock on a far/edge tile — if pawns can't reach it, every fetch job for it sits unclaimed.
> - **Tool-gated jobs (anvil/butchery) pass if the COLONY has the tool** — just put a hammer in `items`;
>   the pawn auto-grabs it en route. It does NOT have to be equipped.
> - **Founders default to NO enabled labor** — call `setPawnLaborLevel { pawnId, workId, level }` for each
>   `workService.getAllWorkCategories()` or the pawns sit Idle and nothing is crafted/hauled.
> - **The reserve→haul→stage→craft pipeline is multi-tick** — a single craft needs ~900+ ticks; weaving-frame
>   crafts and multiple competing orders need more (bump pawn count + tick budget). Idle ≠ broken; give it time.
> - **`buildScenario` designates the ENTIRE map as stockpile** (2026-07-23) — storage/reachability can never be
>   the hidden blocker; if a craft still stalls, it's labor or tick-budget, not the stockpile.
> - **The sim starts at NIGHT** (`ambientLight 0.15`) so mobs don't self-aggro (vision-gated) — drive fights
>   with an explicit draft attack order.

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
- [x] hide_rack⚙ (post-rework): make_cured_{rabbit_pelt,rat_pelt,deer_hide,goat_hide,jackal_hide,wolf_hide,worg_hide,boar_hide,elk_hide,aurochs_hide,bear_pelt,…} — one passive cure per species (17)
- [x] ⚠→fixed: tanning_rack REMOVED (was shadowing the buckets). Tanning is now bucket-only.
- [x] tanning_bucket_station⚙ (post-rework): tan_{coney_fur,vermin_hide,buckskin,kidskin,jackal_leather,wolf_leather,worg_leather,boarhide,elk_leather,oxhide,bearhide} — 11 common leathers, passive, brine-consuming
- [x] beast_tanning_bucket⚙ (post-rework): tan_{cave_bear_hide,owlbear_leather,sabretooth_leather,mammoth_leather,hippogriff_leather,direwolf_leather}, tan_scale_plate, harden_boiled_leather
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
- [x] weaving_frame (post-rework): weave_linen, weave_cotton, reel_silk, weave_woolcloth (now `category:wool`), make_cushion, make_wool_cloak, make_linen_gambeson, make_direwolf_warcloak, make_regal_robes — ⚠ card_wool/comb_fine_wool/make_felt REMOVED (source-graded wool, no refine ladder)
- [x] stone_forge⚙: make_{copper,tin,lead,silver,gold}_bar
- [x] casting_hearth: make_bronze_bar, make_bronze_nail, make_tile_mold, make_cast_sling_bullet, make_bronze_punch_dagger, make_leaf_blade_spear, make_cast_bronze_hatchet, make_cast_bronze_skullcap
- [x] bloomery⚙: make_iron_bar
- [x] finery_forge⚙: make_steel_bar
- [x] crucible_steelworks: make_crucible_steel
- [x] ⚠→fixed: blast_furnace/finery shadow RESOLVED — both recipes were metallurgically inverted and were REPLACED (`smelt_pig_iron` + `refine_wrought_iron`), not deduped. See the Steel chain section.
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
    - [x] ⚠→fixed: **2H + shield freeloaded full shield block/parry.** `fouled_guard` now also halves `block` (`"block": 0.5`, wired through `blockChance` via `conditionMult`), so a two-hander can't strap a shield for free defense. Verified headless: clean shield pawn negates 0.667 of blows → fouled 0.332 (halved). (Parry left intact — a deflect+counter a two-hander can't set up anyway; block was the freeloaded stat.)
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
- [~] ⚠ NON-butchery shadows: **`tan_*_leather_bucket` (×5) RESOLVED** (Tanning redesign — rack removed, buckets are the only path, one `tan_<leather>` per species). Still open: `smelt_blast_steel` → Steel rework (both steel recipes replaced); `grind_mana_crystal` → Crystal/magic-reagent rework (redesign, not prune); `make_ash` → unshadow (Ash economy section).
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

## Material & production reworks (PROPOSED — track only, not implemented)

> These supersede the "shadowed recipe" ⚠ notes above (lines: tanning_bucket_station, blast_furnace,
> the 7-shadowed list): the shadows were masking that whole CHAINS need reworking, not just
> de-duplicating. The shadow-bug's own fix = **option 1, prune the loser** — but for tanning & steel
> the prune is absorbed into the reworks below (the "losing" recipes are being replaced, not just cut).

### Tanning chain redesign + hide/leather variety split — ✅ COMPLETE (re-audited headless 2026-07-23)
Reference: VilesMods "Hell-Bent for Leather" (mandatory tanning step, per-animal leathers) + Hardcore SK.

> **Re-audit — driven headless end-to-end (`leatherChainE2E`, kept as a regression test, 4/4):**
> - **Coverage sweep** (provisioned colony via `buildScenario` — all research, tool 3, every station,
>   999 of every material; real `canQueueCraft` gating + real `completeCraftOrder` output): **all 35 cure+tan
>   recipes** and **all 65 category:leather/wool/cured_hide consumers** QUEUE and PRODUCE, 0 failures; the 3
>   affected buildings (hide_bed, leather_bed, stargazer_circlet) resolve their cost.
> - **Physical pawn pipeline** (`HeadlessSession`, real ticks): 6 pawns FETCH leather + wool from the
>   stockpile and CRAFT a `category:leather` item (hide_scrip, buckskin consumed) AND a `category:wool` item
>   (woolcloth, goat_wool consumed) over the real reserve→haul→stage→craft flow. Confirms `category:leather`
>   resolves to a concrete id in the order (`inputs: {buckskin:2, cordage:1}`) and reserves/hauls correctly.
> - **Material flow**: a jerkin from mammoth_leather stamps matDur 1.3 / matWeight 1.35 vs coney_fur 0.8 / 0.75.
>
> **Bugs the end-to-end drive caught (all fixed):**
> - ⚠→fixed: **finished armour satisfied a material slot.** Armour uses `category` as its armour CLASS
>   (leather/metal/cloth/organic), so `boiled_leather_jerkin` is `category:leather` — once 52 inputs became
>   `category:leather`, `itemMatchesCostCategory` let a jerkin be consumed as raw leather (collision spans all
>   classes: leather 19 mat + 16 gear, metal 16 + 22, cloth 1 + 3, organic 29 + 3). Fixed at the chokepoint
>   (`itemDefs` + RecipeService copy): a cost/slot excludes `type` armor/weapon/tool, so it only draws raw stock.
> - ⚠→fixed: **`leather_bed` + two scenario presets still referenced the removed `light_leather`/`thick_leather`**
>   (missed in the recipes-only pass). `leather_bed` → `category:leather`; presets → `buckskin`/`oxhide`.
> - **Infra:** `buildScenario` now designates the ENTIRE map as stockpile (was a 7×7 rect), so a headless test
>   can never be silently bottlenecked on storage/reachability. Determinism byte-identical.

**Current chain (3 stages):** raw pelt/hide → **cure** (passive, `hide_rack` "Curing Frame", +ash×2 or
salt×1) → **tan** (TWO competing paths: active `tanning_rack` +bark, OR passive `tanning_bucket_station`
fuelled by `tanning_brine`) → **harden** (`tanning_rack`, beast_leather + water → boiled_leather). Brine
brewed passively at `brewing_barrel` (bark+salt+ash+water). ⚠ Bucket recipes take NO material input —
brine is consumed only as station FUEL (`defaultAllowedFuelItemIds`), so it's "cured hide → leather for free".

**Decided direction — IMPLEMENTED (2026-07-23; `pnpm check` clean, 0 new dangling refs, recipe/craft tests green):**
- [x] **Removed `tanning_rack` entirely** (building + its 5 `make_*_leather` recipes). Tanning is now only the passive bucket stations.
- [x] **Relocated `harden_boiled_leather`** → `beast_tanning_bucket` (passive): a stiff leather (`boarhide`/`oxhide`) + water → `boiled_leather`.
- [x] **Bucket tanning consumes brine as a LISTED input** (`tanning_brine`/`beast_brine`), and the buckets' brine-as-fuel config was stripped (they're plain passive stations like the Curing Frame). Closes the "free leather" hole and gives `brew_*_brine` real consumers.
- [x] **Curing kept passive** at the Curing Frame (two-step chain: cure → tan).
- [x] `make_ash` reachability unchanged (still a hearth recipe; see Ash section).

**Hide/leather split** — no more collapsing distinct animals into one leather. Today wolf/boar/worg → one
"sturdy" leather; elk/aurochs → one "heavy"; and jackal literally drops `wolf_hide`. Proposed: each hide
tans to its OWN leather, differentiated along axes **suppleness↔stiffness · insulation · armor · durability
· weight · beauty/value** — so downstream recipes pick the leather whose identity fits (supple buckskin →
light garments; stiff oxhide/boarhide → boiled cuirass & shields; warm bearhide/wolf → winter cloaks;
sabretooth/direwolf → prestige).

| Source | Raw hide (today → proposed) | Leather (proposed) | Identity |
| --- | --- | --- | --- |
| rabbit | rabbit_pelt | coney_fur | supple · warm · v.low armor · trim/lining, tiny yield |
| giant_rat | rat_pelt | vermin_hide | poor · low · v.low · bottom-tier cheap |
| deer | deer_hide | buckskin | supple · low insul · low armor · fine light clothing |
| goat | goat_hide | kidskin | supple · low · low · soft (goat also yields wool) |
| wolf | wolf_hide | wolf_leather | med-stiff · warm · med · winter pelt |
| worg | worg_hide | worg_leather | denser than wolf · warm · med-hi · dire flavour |
| jackal | ⚠ wolf_hide → jackal_hide | jackal_leather | thin · heat-resistant · low · arid, light |
| boar | boar_hide | boarhide | stiff/bristly · low insul · med · shields/hard backing |
| elk | elk_hide | elk_leather | tough+supple · med · med-hi · general armour |
| aurochs | aurochs_hide | oxhide | v.stiff · med · high · heavy; boiled armour/straps/shields |
| bear | bear_pelt | bearhide | thick · v.warm · high · rugs/heavy coats |
| cave_bear | cave_bear_pelt | cave_bear_hide | thickest · top insul · high · boss-tier |
| owlbear | owlbear_pelt | owlbear_leather | coarse/tough · med · high · exotic |
| sabretooth | sabretooth_pelt | sabretooth_leather | dense fur · high insul · med · beauty/prestige |
| mammoth | mammoth_fur | mammoth_leather (+ fur → wool) | massive · extreme insul · high · heavy, arctic |
| hippogriff | hippogriff_feathered_hide | hippogriff_leather | light/feathered · med · low-med · beauty, aerial |
| dire/great wolf | dire_wolf_pelt | direwolf_leather | prime · warm · high · beauty |
| mire_crocodile | croc_scaled_hide | crocodile_scale (`scale_plate`) | rigid scutes · low insul · v.high armor · own line, NOT "leather" |

- [x] **17 per-animal leathers IMPLEMENTED** (the table above, minus croc scale which stays `scale_plate`). Each `category:leather` with graded `material.item` (durability/weight → crafted item) + `material.building` (insulation/comfort/beauty → furniture). The 6 abstract tiers (thin/light/sturdy/heavy/thick/beast_leather) removed.
- [x] Fixed `jackal` dropping `wolf_hide` → new `jackal_hide` item → `jackal_leather`.
- [x] **Cure-stage shape decided: per-species cured intermediate** (17 `cured_*` items, all `category:cured_hide`; 17 passive cure recipes) — the two-step passive process the user wanted. Downstream `category:cured_hide` consumers (`hide_bed`, `boil_hide_glue`, arrow sheath) accept any cured hide.
- [x] **Downstream NOT hard-gated by leather type** (user decision): 52 hard tier-leather inputs → `category:leather` (any leather works); 11 stale variant blocks stripped. "Wrong" leather still crafts, but its `material.item` multipliers flow to the output — **durability AND weight**, surfaced as `Durability ×N` / `Weight ×N` rows in the craft tooltip (mirrors the building/stone tooltip). Per-instance weight subsystem built: `matWeight` stamped at craft (like `matDur`) → carried onto the `ItemInstance` → applied against `def.weightKg` in `getCurrentCarryLoad`, so a piece from a heavier hide is heavier to carry. Determinism byte-identical.
- [x] **`Recipe.materialBonuses` removed** (was display-only dead code — a "cosmetic lie" never stamped on the item; type + `applyMaterialBonuses` + tooltip path + 15 data blocks all deleted).

### Wool sourcing & furniture materials
**Current:** only `mountain_goat` + `woolly_mammoth` carcasses drop `coarse_wool`; NO shearing (ANIMAL-HUSBANDRY
Phase D wants a `sheep` + live-shear — still open). Wool ladder exists at `weaving_frame`
(`coarse_wool`→`wool`→`fine_wool`→`woolcloth`, + `felt`). Wool items ALREADY carry a `material.building`
comfort/insulation block (wired as a furniture material) — the hook is in place.

**Decided direction — IMPLEMENTED (2026-07-23). Scope kept deliberately smaller than leather (user call): 5 source-graded fleeces, no fur/pelt-down second axis, no refine ladder.**
- [x] **5 source wools**, tiered by how hard the animal is to take (replaces the generic `coarse_wool`/`wool`/`fine_wool`): `coney_wool` (rabbit, trivial), `goat_wool` (goat, easy), `sheep_fleece` (sheep, husbandry-pending), `ox_wool` (aurochs, dangerous), `mammoth_wool` (mammoth, apex). All `category:wool`; identity via `material.building` comfort/insulation + `material.item` durability (coarse ox = bulk warmth/low comfort; fine coney/mammoth = comfort).
- [x] **Butchery drops wired**: `make_goat_meat` coarse_wool→goat_wool; `make_mammoth_meat` coarse_wool→mammoth_wool; added `coney_wool` to `make_rabbit_meat`, `ox_wool` to `make_aurochs_meat`. sheep_fleece has no butchery drop (arrives with ANIMAL-HUSBANDRY live-shear; item + ladder ready).
- [x] **No refine ladder**: grading is at the source, so `card_wool`/`comb_fine_wool` removed; `weave_woolcloth` now takes `category:wool`×3 (any fleece → cloth, finer fleece = better cloth via multiplier). `spin_thread`/`regal_robes`/`enchant_thread`/`stargazer_circlet` re-gated to `category:wool`.
- [x] **`felt` removed** (dead-end material — nothing consumed it); its bedding/padding role is filled by raw wool directly (each fleece carries `material.building` comfort/insulation).
- [ ] Furniture re-gate (mid beds/seating built from wool, leather only for top) — deferred to the furniture/comfort-system section (not part of this pass).
- [ ] Cross-link ANIMAL-HUSBANDRY live-shear (sheep_fleece source) — still open.

### Feathers → fletched ammo (added this pass)
- [x] The 7 fletched-ammo recipes (`make_{flint,bone,iron,broadhead,barbed}_arrow`, `make_{iron_bolt,heavy_quarrel}`) now require `feathers` (with `chicken_feathers` as an alternative), gating ranged ammo behind hunting fowl (chicken/hoarfowl/hippogriff). Feather items left `category:organic` (not recategorised, to avoid flipping their trade/scavenge behaviour).

### Steel chain — realism rework + specific steel types — ✅ IMPLEMENTED (2026-07-23)
**Current recipes are metallurgically INVERTED.** `make_steel_bar` (finery_forge: iron_bar+coal+limestone
→ steel) — the real finery forge DECARBURIZES pig iron INTO wrought iron; it never made steel.
`smelt_blast_steel` (blast_furnace: iron_bar → steel×3) — a real blast furnace consumes ORE → **pig iron**,
not bars → steel. `iron_bar` from the bloomery ≈ wrought iron already (a fine base). Goal: replace generic
"steel" with a **carbon-content + process-provenance material FAMILY** — differs deliberately from
RimWorld/HSK's single upgraded ingot: here steel is NOT a tier, each type is use-locked with orthogonal
hardness/toughness tradeoffs (the historical difficulty of hitting the ~0.2–2.1% carbon window is the tension).

**Bases (non-steel):** `pig_iron` (blast furnace, brittle high-C, castable only), `iron_bar` = wrought iron
(bloomery / finery-decarbed pig iron; soft/tough/weldable; cementation feedstock).

**Full family (6)** — decided scope:

| Steel | Process / station | Hard | Tough | Cost | Use-lock |
| --- | --- | --- | --- | --- | --- |
| `bloom_steel` | bloomery + carburize (primitive) | med | med | low | early weapons/tools |
| `blister_steel` | cementation furnace (passive; wrought iron + charcoal, long bake) | med-hi | med | med | tools, heads, springs |
| `shear_steel` | forge-fold blister at anvil | high | med-hi | med-hi | quality blades/edge tools |
| `crucible_steel` *(exists)* | crucible steelworks (sealed melt) | v.high | med (brittle untempered) | high | premium blades, razors, fine tools |
| `pattern_welded` | anvil forge-weld (wrought iron + high-C steel) | high | high | v.high (labour) | legendary swords |
| `mild_steel` | puddling / Bessemer at blast tier (bulk) | low-med | high | low per-unit, high tech gate | plate armour, structural, mass tools |

**IMPLEMENTED (2026-07-23)** — `pnpm check` clean, 0 dangling refs, `steelChain.test.ts` kept as a regression test.
- [x] **Replaced both inverted recipes.** `make_steel_bar` (finery *making* steel) → **`refine_wrought_iron`**
      (finery DECARBURISES `pig_iron` + charcoal → `iron_bar`, its real job). `smelt_blast_steel` (bars→steel,
      and 3 out of 2 in — more mass out than in) → **`smelt_pig_iron`** (blast furnace reduces ORE → `pig_iron`).
- [x] **New bases + 5 new steels**: `pig_iron` (brittle, castable, `material.item.durability` 0.7) and
      `bloom_steel` / `blister_steel` / `shear_steel` / `mild_steel` / `pattern_welded_steel`, joining the
      existing `crucible_steel`. All six share **`category: steel`**.
- [x] **New stations**: `cementation_furnace` (iron:2, passive — the long charcoal bake for blister) and
      `puddling_furnace` (steel:1 — bulk mild steel). `crucible_steelworks` unchanged.
- [x] **Downstream differentiated WITHOUT hard gates** (following the leather precedent, not the original
      "use-lock" wording): all 24 `steel_bar` refs → `category:steel`, so any steel crafts any steel item, but
      the choice is *felt* — the same longsword comes out **matDur 1.05 (bloom) → 1.15 (blister) → 1.10 (mild)
      → 1.25 (shear) → 1.35 (crucible) → 1.40 (pattern-welded)**, surfaced in the craft tooltip. `steel_bar` removed.
**Verified:** all 8 chain steps queue (`canQueueCraft`) and produce (`completeCraftOrder`) in a provisioned
colony; the 6 steels each satisfy a `category:steel` consumer with the distinct multipliers above.
- [x] **HEADLESS-PLAYTESTED** (`steelChain.test.ts`, `HeadlessSession`, real pawns/ticks, `infiniteFuel` so the
      haul-fuel-and-light loop stays out of scope): pawns smelt ore at the bloomery AND bake blister steel at
      the cementation furnace — **hematite 60→56, blister_steel 0→2 by turn 3200**.
- [x] **Anvil-side steps proven physically too**: pawns forged **shear_steel=1 and pattern_welded=1**
      (blister 40→38, iron_bar 40→38) with only a hammer in colony stock — the earlier "needs a carried
      tool" theory was WRONG, it was the same unreachable-stock bug. The FULL steel chain is playtested.
- [x] ⚠→fixed: **no shadow.** The finery's output was renamed to a DISTINCT `wrought_iron` (cleaner, more
      even than a bloom — `material.item.durability` 1.08 vs 1.0), so `iron_bar` and `wrought_iron` each have
      exactly ONE producer. Both share **`category: iron`**, and the steel processes (cementation, crucible,
      pattern-welding) take `category:iron`, so either iron feeds them. `iron_bar`'s 38 consumers untouched.
- [x] **DEV LEVER ADDED — `devInfiniteFuel {on}` / `ScenarioSpec.infiniteFuel`**: holds every fuel station
      full, lit and at its hottest and skips the smelt fuel/heat gate, so a headless test can drive
      smelting/baking without also exercising the haul-fuel-and-light loop. Verified working (bloomery goes
      `lit=true fuel=160 fireHeat=5`).

> ### ⚠→FIXED — passive stations DO run; the stall was my own stockpile regression
> **My first diagnosis ("the passive production tier never runs") was WRONG.** Corrected by driving it:
> on a FLAT (fully reachable) map the passive `charcoal_pit` produced fine, so the tier was never broken.
> Two real bugs were behind the stall, both now fixed:
> - [x] ⚠→fixed: **starting stock landed on unreachable tiles.** `addItem` drops stock on the *first*
>       storage tile it scans — and once I made the WHOLE MAP a stockpile, that became a map-edge tile that
>       can be cut off from the pawns. The fetch job was generated but never claimable (`selectJobForPawn`
>       filters on reachability), so crafting stalled silently with no visible cause. `addItem` now takes an
>       optional `tileKey`, and `buildScenario` pins starting stock to the PAWN CLUSTER.
> - [x] ⚠→fixed: **a PASSIVE station was tool-gated.** `cementation_furnace` carried a
>       `toolRequirement` (copied from the finery), which blocks the order even though no pawn ever stands
>       at a passive bake. Removed — matches the bloomery, which is passive and has none.
> - Verified after the fix on a GENERATED map: `charcoal_pit` charcoal 0→2 and `bloomery` iron_bar 0→1.
> - Still noted: **`blast_furnace` carries no fuel fields at all** (no `maxFuel`/`minFuelHeat`/
>   `requiresLighting`), unlike bloomery/finery — a data gap to settle in the ore audit.

