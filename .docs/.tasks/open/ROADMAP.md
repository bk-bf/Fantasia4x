<!-- LOC cap: 300 (created: 2026-05-25) -->

# ROADMAP

> **Related:** [game/DESIGN](../game/DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [PRODUCTION-CHAIN-III](PRODUCTION-CHAIN-III.md) · [SOCIAL-LAYER](SOCIAL-LAYER.md) · [RACE-SYSTEM](RACE-SYSTEM.md) · [ENGINE-PERFORMANCE](../archive/ENGINE-PERFORMANCE.md) · [DISTRIBUTION](DISTRIBUTION.md). [TRAITS](TRAITS.md) · archived: [PRODUCTION-CHAIN-II](../archive/PRODUCTION-CHAIN-II-2026-06-21.md) · [COMBAT-SYSTEM](../archive/COMBAT-SYSTEM-2026-06-11.md) · [RANGED-COMBAT](../archive/RANGED-COMBAT-2026-06-21.md) · [SEASONS_WEATHER](../archive/SEASONS_WEATHER-2026-06-17.md) · [EQUIPMENT-EXPANSION](../archive/EQUIPMENT-EXPANSION.md) · [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) · [SCREEN-REFACTORING](../archive/SCREEN-REFACTORING-2026-06-03.md) · [SURVIVAL-HEALTH](../archive/SURVIVAL-HEALTH-2026-05-30.md)

## Status Key

`[x]` done · `[-]` in progress · `[ ]` not started · `[~]` deprecated — blocked items stay `[ ]` with a **Blocked on…** note.

---

## Phase 1 — Foundation (COMPLETE)

All critical architectural debt resolved. Core survival loop is functional.

| Item                   | Status | Notes                                                     |
| ---------------------- | ------ | --------------------------------------------------------- |
| GameEngine refactoring | [x]    | Reduced from 900+ lines to coordination-only; see archive |
| PawnScreen refactoring | [x]    | Split into 6 sub-components; see archive                  |
| Hunger / rest system   | [x]    | Automatic eat/sleep with multi-turn sessions              |

**Missing from Phase 1**: adverse consequences for unmet needs (starvation death, fatigue collapse) — deferred to Phase 2.

---

## Phase 2 — Core Loop Completion (CURRENT)

| Item                                                                     | Status | Spec                                                                                     |
| ------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------- |
| Screen refactoring (WorkScreen only)                                     | [x]    | archived: `SCREEN-REFACTORING-2026-06-03.md`                                             |
| **Survival consequences** (starvation death, collapse, injuries, health) | [x]    | archived: `SURVIVAL-HEALTH-2026-05-30.md`                                                |
| Production chains (primitives → Maker's Bench, then full expansion)      | [x]    | archived: `PRODUCTION-CHAIN-EXPANSION-2026-06-12.md` (original CHAINS design doc deleted, superseded) |
| Healthcare jobs                                                          | [x]    | delivered as caretaking/healing in `COMBAT-SYSTEM` (archived)                            |
| Cooking as a dedicated job                                               | [x] 2026-06-20 | Food-producing craft jobs now route to the `cooking` labor category (dynamic `recipe-output` source in `jobs.jsonc`/`JobService`) so the Cooking work-tab slider drives them and `cooking_speed`/`cooking_quality` (§F) apply. `jobRegistry.test.ts` guards the mapping. |

---

## Phase 3 — Depth Features (re-prioritised 2026-06-11)

**Dev model: skateboard → bike → motorcycle → car → truck.** Each step must be a
**complete, playable experience**, not a perfected feature. So we sequence the items
that round out the playable loop first and **defer content-expansion features** —
things that mostly add *more stuff* on top of an already-working loop (e.g. taming /
mounts / breeding) — even when they're spec'd, because they don't make the current
slice more complete. Combat, the Entity Spawning world layer, the production chain, and
the **equipment / inventory loadout** are now done; focus shifts to the **Living World**
layer (seasons / weather / fog of war), with **Ranged Combat** sequenced just after it.
**Magic & Skills is pushed back to last** in Phase 3 — behind Ranged Combat, Social
Layer, Research Enhancement, and the deferred Entity Spawning C–E content.

| #  | Item                                                                                                                                                                                                                   | Status         | Spec                                                                                                      |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| —  | **Combat System** (stances, weapons/crit, wounds, pain→collapse, healing, caretaking)                                                                                                                                  | [x] 2026-06-11 | archived: [COMBAT-SYSTEM-2026-06-11.md](../archive/COMBAT-SYSTEM-2026-06-11.md) · ADR-012/013             |
| —  | **Entity Spawning** Phase A–B (mobs, animals, hunting, foraging, butchering)                                                                                                                                           | [x]            | [ENTITIES_SPAWNING.md](ENTITIES_SPAWNING.md)                                                              |
| 1  | **Production Chain Expansion** (smelting, forges, mining, fuel/heat, leather, survival)                                                                                                                                | [x] 2026-06-12 | archived: [PRODUCTION-CHAIN-EXPANSION-2026-06-12.md](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) |
| 2  | **Equipment Expansion** (layered armour slots, mainHand/offHand, weight/volume inventory, durability, material-bonus crafting)                                                                                         | [x] 2026-06-13 | archived: [EQUIPMENT-EXPANSION.md](../archive/EQUIPMENT-EXPANSION.md)                                     |
| 2b | **Physical Production** (reserve-and-fetch crafting: items always physical, haul inputs to workstation, output on station; retire `gs.item`; passive furnaces; building-material hauling; carry budget; tool gating) | [x] 2026-06-13 | archived: [PHYSICAL-PRODUCTION-2026-06-13.md](../archive/PHYSICAL-PRODUCTION-2026-06-13.md) · ADR-016     |
| 2c | **Engine Performance & Scaling** — sim→Worker + soft-body pathfinding + **W2/W2b slim snapshot** → **200+ TPS @4× (goal crushed)**. Then the **§D renderer-hitch arc** (Electron trace): terrain prealloc + designation→terrain decouple + RESYNC 8→32 + worldMapDelta-slim, and the big one — **three `worldMap.map()` full-rebuilds (harvest/forage/footprint) de-immutabled in place → `worldMapRef=0`** (the harvest cliff). **Distribution wrapper = Electron** (A/B vs Tauri). Then **§E chunked terrain (2026-06-20)** — the 500×500 default map (38k→250k tiles) clapped FPS via the whole-map static VBO; sliced into viewport-culled 32² chunks → render cost **O(visible tiles)**, validated in-game (flat 60 TPS, sustained collapse gone). Perf arc **PAUSED**: remaining cost is the entity baseline (~400–500k/flush, a scalar-projection/transferable-buffer *project*, not a cut). LoS deferred (P3). | [x] core+renderer done; entity baseline parked | [ENGINE-PERFORMANCE.md](ENGINE-PERFORMANCE.md) §B/§C/§D/§E · ADR-021                                       |
| 3  | **Living World** (seasons, temperature, weather + particle overlays, wind, snow cover, atmosphere)                                                                                                                      | [x] 2026-06-17 (fog-of-war Phase D → ENGINE-PERF/WASM spatial) | archived: [SEASONS_WEATHER-2026-06-17.md](../archive/SEASONS_WEATHER-2026-06-17.md)                       |
| 4  | **Ranged Combat** (ammunition, line-of-sight, bows/sling/crossbow)                                                                                                                                                     | [x] 2026-06-21 | archived: [RANGED-COMBAT-2026-06-21.md](../archive/RANGED-COMBAT-2026-06-21.md)                            |
| 5  | **Production Chain II** (craft-quality prefixes, magical resources/stat-gear, bulk logistics carts, farming/food/brewing) — second items/buildings/resources pass                                                       | [x] 2026-06-21 | archived: [PRODUCTION-CHAIN-II-2026-06-21.md](../archive/PRODUCTION-CHAIN-II-2026-06-21.md) — §Q (quality, R8) + §M (magical gear → passive buff conditions, MAGIC-SKILLS Phase 0) 2026-06-18; §L pawn-pushed carts 2026-06-20 (roads + draft animals → ENTITIES C–D); §F farming/soil + F8 food chain (mill/bake/brew, alcohol staged mood-good, food poisoning) 2026-06-21. Deferred: meal-variety mood + joy drinking → SOCIAL-LAYER; dairy/manure → ENTITIES C–D |
| 6  | **Entity Spawning** Phase C–E (taming, mounts, breeding) — **deferred** content expansion                                                                                                                              | [ ] (A–B [x])  | [ENTITIES_SPAWNING.md](ENTITIES_SPAWNING.md)                                                              |
| 7  | **Production Chain III** (medieval-depth pass + **magic ages** replacing HSK high-tech: workstation tiers & infused variants, wall ladder → magic-dust concrete, resin/bone glue, carcass yields + beast hides + wool/leather split, armour loadouts chain/plate/beast/bone, alchemy/potions, defence buildings, **Famed items**) — benchmarked vs Hardcore SK + VilesMods (~35 % of in-ceiling target) | [~] data + §I combat stat-explosion done (2026-06-21); deferred: §G drink-use, §H combat traps/turrets, §I craft-roll stamp/display/boss-drop | [PRODUCTION-CHAIN-III.md](PRODUCTION-CHAIN-III.md)                                                        |
| 8  | **Social Layer** (relationships, mood depth, death mood events, pawn traits)                                                                                                                                           | [ ]            | [SOCIAL-LAYER.md](SOCIAL-LAYER.md)                                                                        |
| 9  | **Research Enhancement** (three-tier, lore-item driven; after item DB)                                                                                                                                                 | [ ]            | [RESEARCH-ENHANCEMENT.md](RESEARCH-ENHANCEMENT.md)                                                        |
| 10 | **Magic & Skills** (depth layer; **deferred behind Entity Spawning C–E**)                                                                                                                                              | [ ] deferred   | [MAGIC-SKILLS.md](MAGIC-SKILLS.md)                                                                        |

### Spec Dependency Matrix

| Spec                           | Hard Blockers                                       | Also Benefits From                                 | Enables                                                          |
| ------------------------------ | --------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| SCREEN-REFACTORING [x]         | —                                                   | —                                                  | healthcare / cooking jobs                                        |
| SURVIVAL-HEALTH [x]            | —                                                   | —                                                  | ENTITIES_SPAWNING Phase B (food stakes); COMBAT (injury context) |
| RESEARCH-ENHANCEMENT           | EQUIPMENT-EXPANSION [x] (lore items)                | —                                                  | MAGIC-SKILLS (nodes 3 + 5)                                       |
| SEASONS_WEATHER [x]            | —                                                   | —                                                  | ENTITIES_SPAWNING (night multiplier; seasonal biome weights); fog-of-war → ENGINE-PERFORMANCE |
| PRODUCTION-CHAIN-EXPANSION [x] | —                                                   | —                                                  | EQUIPMENT-EXPANSION Tier 1 + 2                                   |
| ENTITIES_SPAWNING Phase A–B    | —                                                   | SEASONS_WEATHER; SURVIVAL-HEALTH                   | COMBAT-SYSTEM                                                    |
| COMBAT-SYSTEM                  | ENTITIES_SPAWNING Phase A                           | SURVIVAL-HEALTH                                    | MAGIC-SKILLS; EQUIPMENT; SOCIAL; ENTITIES Phase E                |
| EQUIPMENT-EXPANSION [x]        | COMBAT [x] + PRODUCTION-CHAIN [x]                   | —                                                  | MAGIC-SKILLS (staff items); RANGED-COMBAT (bow items + fields)   |
| RANGED-COMBAT [x]              | COMBAT [x] + EQUIPMENT [x]                           | —                                                  | mob archers; MAGIC-SKILLS (enchanted ammo)                       |
| ENGINE-PERFORMANCE             | — (spike standalone); P3 LoS benefits from SEASONS fog | profiler sandbox (validation)                  | RANGED-COMBAT (LoS); SEASONS_WEATHER fog of war; 500+ entity scale |
| PRODUCTION-CHAIN-II [x]        | §L animal carts: ENTITIES C–D                       | EQUIPMENT [x] (§Q rides materialBonuses); SEASONS [x] (§F crop seasons); ENTITIES D (manure/dairy); RESEARCH (§M gate) | closes R8 (item quality); MAGIC-SKILLS (§M foci/heartwood materials) |
| MAGIC-SKILLS                   | COMBAT-SYSTEM                                       | RESEARCH (nodes 3+5 only); EQUIPMENT (staff items); PRODUCTION-CHAIN-II §M (foci materials) | COMBAT depth (skills + spells)                                   |
| SOCIAL-LAYER                   | COMBAT                                              | RACE-SYSTEM [x] Ph0 (`raceRelations` baseline)     | —                                                                |
| RACE-SYSTEM (fwd Ph1–3)        | Ph1: SOCIAL-LAYER · Ph2: an other-faction entity source | —                                             | SOCIAL-LAYER (cross-race friction baseline)                      |
| ENTITIES_SPAWNING Phase C–E    | COMBAT (Phase E); Phase A                           | —                                                  | —                                                                |
| DISTRIBUTION             | Phase 3 complete                                    | —                                                  | —                                                                |

### Implementation Waves

| Wave                | Parallel tracks                                                                       | Prerequisite                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **1** — Phase 2 [x] | SCREEN-REFACTORING [x] · SURVIVAL-HEALTH [x]                                          | complete                                                                                  |
| **2** [x]           | ENTITIES_SPAWNING Phase A–B                                                           | complete                                                                                  |
| **3** [x]           | COMBAT-SYSTEM (incl. wounds, stances, caretaking)                                     | complete (2026-06-11)                                                                     |
| **4** [x]           | PRODUCTION-CHAIN-EXPANSION                                                            | complete (2026-06-12)                                                                     |
| **5** [x]           | EQUIPMENT-EXPANSION                                                                   | complete (2026-06-13); needed PROD-CHAIN [x] (Wave 4) + COMBAT [x]                        |
| **6** [x]           | SEASONS_WEATHER (Living World) [x] 2026-06-17 · ENGINE-PERFORMANCE validation spike · SOCIAL-LAYER | independent / COMBAT [x]; spike gates the rest of ENGINE-PERFORMANCE            |
| **7**               | RANGED-COMBAT [x] · PRODUCTION-CHAIN-II [x] · SOCIAL-LAYER · RESEARCH-ENHANCEMENT · ENTITIES C–E (deferred content) · MAGIC-SKILLS (last) | after Living World; RANGED needs Living World LoS; PROD-CHAIN-II §Q/§F/§M/§L done (§L animal carts → ENTITIES C–D); MAGIC needs COMBAT [x] + EQUIPMENT [x] |
| **8** — Phase 4     | DISTRIBUTION                                                                    | Wave 7 complete                                                                           |

### Other Phase 3 work (no dedicated spec)

| Item                                                                                                          | Status              | Notes                                                                             |
| ------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| **Per-stack craft quality on instances** (R8, moved from CODEBASE-REVIEW 2026-06-16)                          | [x] 2026-06-18      | PROD-CHAIN-II §Q done: `crafting_quality` axis → `rollCraftQuality` tier stamped per-stack on the output `DroppedItem` (weapons/armour/tools) → propagated to `ItemInstance` on equip → consumed by Combat (weapon/armour) + PawnStatService (tool boost) via `scaleWeaponQuality`/`scaleArmorQuality` → name prefix in `getItemDisplayName`. `core/itemQuality.ts` (+ test, 18 cases). Also scales ranged shots (bow/bow-butt). NB: EQUIPMENT `materialBonuses`/`applyMaterialBonuses` was never wired (dead code), so the consumer was built as a fresh per-instance scaling layer instead. `pnpm test` green (380). |
| Building-work integration (bonus stacking)                                                                    | [ ]                 | Analysis in `game/ARCHITECTURE.md`                                                |
| **Migrant wave + world-event foundation** (colony growth: at each season boundary ~every 3 months roll 0–3 hopefuls, count weighted by completed buildings; per-candidate accept/reject shown with **vague ability blurbs, no raw stats**; free reject) | [x] 2026-07-06 | First real consumer of the long-stubbed event system (`core/Events.ts`). Reusable seam: sim raises `GameState.pendingEvent` (one-shot snapshot field) → `EventModalHost` dispatches by `kind` → resolution command clears it. Roll in `systems/migration.ts` (+ `database/migration.jsonc` tuning) at the engine's events phase (turn order: events last); `commitMigrants` places accepted pawns; blurbs via `utils/pawnBlurb.ts` reusing `statBucket`. `check` green. |
| AI event generation expansion (build on the migrant-wave `pendingEvent` seam)                                 | [ ]                 | —                                                                                 |
| **Sim perf scaling** (500+ entities, 1000×1000 maps)                                                          | [ ] superseded      | now driven by [ENGINE-PERFORMANCE.md](../archive/ENGINE-PERFORMANCE.md) (premise corrected: the worker→main **snapshot** was the ceiling, not O(n²) perception); early SIMULATION-PERF spec deleted (superseded) |
| **Unified work model** (single stats.jsonc speed/yield/quality; ModifierSystem work-eff removed)              | [x] 2026-06-13      | ADR-015 in `game/DECISIONS.md`; no separate spec                                  |
| **Work-driven pawn hunting** (mark-to-hunt → chase → resolve as combat → carcass → butchery; prey fight-back) | [x] 2026-06-13      | reuses COMBAT + ENTITIES circuits; no separate spec                               |
| **Data-driven colony jobs** (`database/jobs.jsonc` + `JobService` handler registry; no hardcoded job switches) | [x] 2026-06-13      | ADR-017 in `game/DECISIONS.md`; drift-guarded by `jobRegistry.test.ts`            |
| **Data-driven condition drivers** (malnutrition/dehydration onset/rate/recovery moved to `conditions.jsonc`)  | [x] 2026-06-13      | `ConditionDriver` in `conditions.jsonc`; no separate spec                         |
| **Race overhaul** (procedural 15–25 race pool, mixed colonies + pawn `raceId`, procedural lore/description, trait DB fixed to `stats.jsonc` + condition-resistance hook, Race tab → known-races pokédex, `raceRelations` stub seam for SOCIAL-LAYER) | [x] 2026-06-17 (Phase 0) | [RACE-SYSTEM.md](RACE-SYSTEM.md) · ADR-023; `Race.test.ts`; `check`+`test` (340) green. **Forward phases** (relations→social, encounter pokédex, variety) tracked in the spec |
| **Trait system V2** (condition-backed racial capabilities + per-pawn draw ≤2 racial + ≤3 personal — ADR-023 overhaul; then typed `kind` taxonomy on the `rarities.jsonc` scale, natural-armor-as-gear → encumbrance, afflictions = real permanent wounds, gamification purge + 6 contrast commons, condition relationship graph `flags`/`triggers`/`activateWhen`) — ADR-028 | [x] 2026-07-06 (Phases 1a+1b) | [TRAITS.md](TRAITS.md); guarded by `traitRegistry`/`conditionGraph`/`traitWounds` tests; `check` 0 errors. **Phase 2** (behavioral/needs/transformation kinds) TODO in the spec |
| **PawnStateMachine decomposition** (2818→988 LOC; dispatch table + `pawn/*` helpers/handlers; #1 hotspot)     | [x] 2026-06-13      | archived: `CODEBASE-REVIEW-RESOLVED-2026-06-13.md`; behaviour-locked by tests     |
| **Combat-anatomy depth pass** (unplanned, beyond the archived COMBAT-SYSTEM spec) — ADR-024 | [x] 2026-06-20 | Data-driven **body plans** (`limbmap.jsonc`: 7 plans, per-creature `limbMap`, per-plan `rollBodyPart`/capacities, `bodyScale`-scaled limb HP). **Part-bound natural weapons** (lose the part → lose the attack → `thrash` fallback; pawn two-hands-gone disarm) + **per-part natural armour** (plan = distribution share, `naturalArmor` = magnitude; flat core/peripheral split deleted). **Bone fractures** (cripple-not-sever, weeks-heal, graded `fractured` condition by bone-damage %), **hypovolemic collapse** (blood→consciousness), **brutal conditions** (crush core stats), **innate resistances**, **blunt = trauma not bleed** + limb removal, **skull = instant death**. `damage`/`baseDamage` consolidated. Partially un-defers ADR-013. Guarded by `bodyPlans.test.ts` + `fractures.test.ts`; `check`+`test` (470) green. |

---

## Phase 4 — Distribution

| Item                                                    | Status         | Spec                                                   |
| ------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| Viability spike (WASM + saves in desktop window) — **A/B'd Electron vs Tauri** | [x] **done → Electron chosen** | [DISTRIBUTION.md](DISTRIBUTION.md) Phase A · `desktop-spike/` |
| **App shell — main menu + hardening** (title screen: New/Load/Settings/Exit; deferred sim boot; runtime debug-mode pref → DEBUG tab; selection/context-menu/zoom/drag suppression) | [x] 2026-06-21 | [DISTRIBUTION.md](DISTRIBUTION.md) Phase B0 — menu skipped only by `--debug` (+ the `--profiler` sandbox); `./launch.sh --electron --play` mirrors the player binary for clean playtest |
| Adapter-static migration + AI endpoint decision (now targeting **Electron**) | [ ] — **/api confirmed dev-only** (no runtime server dependency → static build is unblocked) | [DISTRIBUTION.md](DISTRIBUTION.md) Phase B |
| Linux / Windows / macOS release bundles + CI matrix     | [ ]            | [DISTRIBUTION.md](DISTRIBUTION.md) Phase C |

---

## Completed Items (Archive)

See `.tasks/archive/` for full specs.

| Item                                                                          | Completed  | Archive file                            |
| ----------------------------------------------------------------------------- | ---------- | --------------------------------------- |
| GameEngine refactoring Phase 1                                                | 2026-05-25 | `GAMEENGINE-REFACTORING-2026-05-25.md`  |
| PawnScreen refactoring                                                        | 2026-05-25 | `PAWN-SCREEN-REFACTORING-2026-05-25.md` |
| DF-like migration design                                                      | 2026-05-28 | `DF-MIGRATION-2026-05-28.md`            |
| Production chains design                                                      | 2026-05-28 | doc deleted (superseded by EXPANSION)       |
| Fog of War (deferred to Living World)                                         | 2026-05-28 | `FOG-OF-WAR-DEFERRED-2026-05-28.md`     |
| Sim perf Phase 1+1.5 (60 TPS stable, 100+ FPS, rAF-accumulator, campfire fix) | 2026-05-30 | doc deleted (superseded by ENGINE-PERFORMANCE)         |
| Screen refactoring (WorkScreen split into sub-components)                     | 2026-06-03 | `SCREEN-REFACTORING-2026-06-03.md`      |
| Survival consequences (starvation, collapse, injuries, health)                | 2026-05-30 | `SURVIVAL-HEALTH-2026-05-30.md`         |
| Production & early-survival expansion (§A–§G, §1–§6; durability, recipes)      | 2026-06-12 | `PRODUCTION-CHAIN-EXPANSION-2026-06-12.md` |
| Equipment, inventory & combat loadout (layered slots, weight/volume, material-bonus crafting, paper-doll UI) | 2026-06-13 | `EQUIPMENT-EXPANSION.md` |
| Living World (day/night, seasons, temperature, weather + canvas particle overlays, wind, snow cover, panel/map atmosphere); fog-of-war deferred to ENGINE-PERFORMANCE | 2026-06-17 | `SEASONS_WEATHER-2026-06-17.md` |
| Combat System (stances, natural/crafted weapons, crit, wounds, pain→collapse, healing, caretaking) | 2026-06-11 | `COMBAT-SYSTEM-2026-06-11.md` |
| Ranged Combat (ammunition, aim cadence, distance/cover, data-driven `blocksSight` LoS, recovery, bow-butt) | 2026-06-21 | `RANGED-COMBAT-2026-06-21.md` |
| Production Chain II (§Q item quality, §M magic resources/passive-buff gear + arcane staves, §L pawn-carts, §F farming/soil + F8 food chain: mill/bake/brew, staged alcohol mood-good, food poisoning) | 2026-06-21 | `PRODUCTION-CHAIN-II-2026-06-21.md` |
| Mob spawning (superseded — folded into ENTITIES_SPAWNING; spawn model later switched to lairs) | — | doc deleted (superseded) |
