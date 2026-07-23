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
- [ ] ⚠ tanning_bucket_station⚙: tan_{thin,light,sturdy,heavy,thick}_leather_bucket — ALL 5 SHADOWED by tanning_rack `make_*_leather` (whole station dead). **RESOLUTION: folded into the Tanning chain redesign below (remove the rack; buckets become the only tanning path).**
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
- [ ] ⚠ blast_furnace: smelt_blast_steel — SHADOWED by finery `make_steel_bar`. **RESOLUTION: folded into the Steel chain realism rework below — BOTH recipes are metallurgically wrong and get replaced, not deduped.**
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
- [ ] ⚠ 7 NON-butchery recipes still shadowed (share an output at a different station). **RESOLUTION (see "Material & production reworks" below):** `tan_*_leather_bucket` (×5) → Tanning redesign (rack removed); `smelt_blast_steel` → Steel rework (both steel recipes replaced); `grind_mana_crystal` + `make_ash` → keep-both via per-recipe cards (prune would delete legit sources — winner decision pending).
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

### Tanning chain redesign + hide/leather variety split
Reference: VilesMods "Hell-Bent for Leather" (mandatory tanning step, per-animal leathers) + Hardcore SK.

**Current chain (3 stages):** raw pelt/hide → **cure** (passive, `hide_rack` "Curing Frame", +ash×2 or
salt×1) → **tan** (TWO competing paths: active `tanning_rack` +bark, OR passive `tanning_bucket_station`
fuelled by `tanning_brine`) → **harden** (`tanning_rack`, beast_leather + water → boiled_leather). Brine
brewed passively at `brewing_barrel` (bark+salt+ash+water). ⚠ Bucket recipes take NO material input —
brine is consumed only as station FUEL (`defaultAllowedFuelItemIds`), so it's "cured hide → leather for free".

**Decided direction:**
- [ ] **Remove `tanning_rack` entirely.** Tanning happens only at bucket stations (`tanning_bucket_station`
      / `beast_tanning_bucket`), passive. Prune the 5 `make_*_leather` rack recipes (this unshadows the buckets).
- [ ] **Relocate `harden_boiled_leather`** off the rack (→ beast bucket or a dedicated hardening step).
- [ ] Bucket tanning must consume **real materials** — brine as a LISTED input (± tannin/bark), not just as
      fuel. Close the "free leather" hole.
- [ ] Keep **curing passive** at the Curing Frame (already correct — curing preserves the raw skin so it
      doesn't spoil; that IS its purpose, keep it).
- [ ] Keep an early **`make_ash`** source reachable (see Shadow resolution below): ash is a core tanning
      reagent (every cure + every brine needs it) — the whole chain must not hard-gate on a charcoal pit.

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

- [ ] Fix `jackal` dropping `wolf_hide` → its own `jackal_hide`.
- [ ] Decide cure-stage shape: per-hide cured intermediate (~18 hand recipes) vs a **generic passive cure**
      (rawHide + preservative → cured-of-same-species via category/dynamic recipe). Recommend generic.
- [ ] Rebalance downstream armour/clothing recipes to request the leather whose identity fits (not a flat tier).

### Wool sourcing & furniture materials
**Current:** only `mountain_goat` + `woolly_mammoth` carcasses drop `coarse_wool`; NO shearing (ANIMAL-HUSBANDRY
Phase D wants a `sheep` + live-shear — still open). Wool ladder exists at `weaving_frame`
(`coarse_wool`→`wool`→`fine_wool`→`woolcloth`, + `felt`). Wool items ALREADY carry a `material.building`
comfort/insulation block (wired as a furniture material) — the hook is in place.

**Decided direction** (wool = dominant furniture material; leather only gates top-tier):
- [ ] Add a wool/fur output to every **wool-yes** carcass butchery recipe (mirror `make_goat_meat`'s
      `coarse_wool` line — butchery gives BOTH hide→leather AND wool/fur→soft-goods). Wool-yes carcasses
      lacking it today: aurochs, bear/cave_bear/great_bear, owlbear, worg, jackal, sabretooth,
      wolf/dire_wolf/great_wolf; boar (bristly, borderline); rabbit (tiny). goat + mammoth already have it.
- [ ] Grade wool by source: true fleece (goat/sheep/mammoth) → `coarse_wool`→fine ladder; predator/ursine
      coats → a parallel **fur/pelt-down** soft-goods input (stuffing/trim). Decide: one `coarse_wool` bucket
      vs distinct `bear_fur`/`wolf_fur` grades.
- [ ] Re-gate furniture materials: mid beds & seating built from **wool** (wool-stuffed mattress = the
      "proper bed"; wool-cushioned chair); reserve **leather** for top beds, armchairs, couches only.
- [ ] Cross-link ANIMAL-HUSBANDRY: live-shear (renewable) + butchery-drop (from kills) are complementary
      wool sources — both feed the same ladder.

### Steel chain — realism rework + specific steel types
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

- [ ] Replace `make_steel_bar` + `smelt_blast_steel` with the ore → pig_iron → wrought → steel chain above.
- [ ] Add stations: `cementation_furnace` (blister), a puddling/bessemer step (mild). `crucible_steelworks` exists.
- [ ] Differentiate downstream: blades request crucible/pattern_welded/shear; plate requests mild; springs
      request blister; cast goods request pig_iron; fittings request wrought iron.
- [ ] Add each steel's material stats (hardness → armour-pen/edge, toughness → shatter resistance) to items.
- [ ] This replaces the blast-vs-finery shadow entirely — no prune needed, both current recipes are wrong.

### Shadow-bug resolution (option 1 = prune) — remaining INDEPENDENT cases
- [ ] `grind_mana_crystal` vs `grind_gem_dust` (both → `gem_dust`): NOT truly redundant — `mana_crystal` is a
      richer 4-dust sink; infused gems the 2-dust path. A prune deletes a legit source → **recommend keep both
      via per-recipe cards** instead. Needs a winner decision.
- [ ] `make_ash` (hearth) vs `burn_charcoal` byproduct (both → `ash`): `make_ash` is the early ash bootstrap
      for the tanning chain; charcoal-pit ash is a byproduct. **Recommend keep `make_ash` reachable** (per-recipe
      card or reorder) rather than prune, since tanning depends on early ash. Needs a decision.

## Furniture → pawn systems (comfort / relaxation / socialisation) — AUDIT + proposal

- [x] AUDITED (three code sweeps) — findings below. Nothing implemented yet. Headline: **most of the target
      system is already scaffolded** — this is EXTEND-and-rewire, not build-from-scratch.

**EXISTS today:**
- Beds are the only interactive furniture. 5 tiers (`sleeping_spot`→`hay_bed`→`hide_bed`→`leather_bed`→
  `feather_bed`) carry `sleepQuality`/`fatigueRecovery` → measurably faster rest vs the ground (0.58/s). So
  **"bedroom furniture gives rest-speed bonuses" is ALREADY DONE.** (Only `feather_bed` also carries `comfort` 0.4.)
- A `relaxation` NEED already exists (needs.jsonc; inverted 0–100, decay 0.13/s) + a `Socialising` FSM state —
  the exact template for a new comfort meter + relax state.
- Socialising is satisfied at **gathering buildings** (`buildingProperties.gathering` = campfire + hearth only,
  radius 3), NOT at tables/chairs.
- `comfort` exists only as a building/material **amenity number** (radius 2), feeding 3 small ambient bonuses:
  sleep speed, wound-heal speed, mood lift (cap +3). Chairs/stools/tables/couches emit comfort+beauty but are
  **never sat on or pathed to** — pure scenery.
- Condition plumbing already supports the target: `intoxicated` is a positive-style TIERED, timed,
  severity-decaying condition (the template for a tiered `comfortable`); conditions can slow fatigue
  (`fatigueRate < 1`, e.g. `sheltered` 0.9) and boost mood (`"mood": "cond_*"` → mood.jsonc).

**MISSING (the work to track):**
- [ ] **`comfort` pawn meter/need** — model on `relaxation` (decay block in `processNeedsTick`, kill-switch,
      `moodBands`, `case 'comfort'` in `computeMoodTarget`). Fed by the comfort of furniture the pawn sits on/near.
      ⚠ NAME COLLISION: temperature "comfort band" (cold/heat exposure, `comfortRange`) already exists — keep the
      furniture meter distinct in naming/docs so the two axes don't merge.
- [ ] **Tables/chairs as socialisation anchors** — today only fires. Give dining/gathering furniture
      `gathering: true` (or a new anchor flag) so pawns gather at a table, not just the hearth.
- [ ] **New "sit & relax at table" state** — clone the Socialising path (`tryRouteToSocialise` →
      `handleMovingToNeed` → `handleSocialising`): pawn paths to a chair around a table, sits, fills
      relaxation/comfort. Register the state in **needs.jsonc `states`** (not states.jsonc — the split
      `stateRegistry.test.ts` enforces) + add to `STATE_HANDLERS`.
- [ ] **Chair tiers → comfort** — map each seat/couch tier's `comfort` value into the comfort-meter fill rate
      (better chair = more comfort per sit).
- [ ] **Tiered `comfortable` condition** — model on `intoxicated`: stages (e.g. content → comfy → cosy →
      pampered), each `fatigueRate < 1` (slows tiring) + `"mood": "cond_comfortable"` (mood boost). Granted at
      high comfort, decays when the pawn leaves comfortable surroundings. Add `cond_comfortable` tiers to mood.jsonc.
- [ ] **Bed tier → rested/comfort link** — sleeping in a good bed should feed the comfort meter / grant a
      "well-rested" buff (no positive rested/well_rested condition exists today).
- [ ] (optional) **positive `cond_socialised`** — a timed mood lift after socialising (today social only clears
      the negative `restless`/`starved_company` bands, no positive thought).
- [ ] **Validate the intended loop end-to-end:** kill woolly animals → wool → better beds/chairs → comfort
      meter ↑ → `comfortable` (slower fatigue + mood ↑) → higher productivity.

## Other categories (not yet audited)

- [ ] Combat resolution — hit/dodge/parry rolls, wound/limb model, death conditions, ranged vs melee balance
- [ ] Needs & mood — hunger/sleep/comfort/social decay rates, mood effects, break thresholds
- [ ] Social — relationships, dialog, prestige, kingdom events
- [ ] Research — unlock gating, tier progression, cost balance
- [ ] Exploration & fog-of-war — reveal, nearest-entity queries, spatial correctness
- [ ] World/weather — seasons, temperature, wetness, biome variants, terrain effects
- [ ] Economy balance — resource flow, tool bootstrap (ADR-009), scarcity gates (flint)
- [ ] Save/load & determinism — seed replay byte-identical across all presets
