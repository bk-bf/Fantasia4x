<!-- LOC cap: 300 (created: 2026-05-25) -->

# ROADMAP

> **Related:** [game/DESIGN](../game/DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) · [SEASONS_WEATHER](SEASONS_WEATHER.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [RANGED-COMBAT](RANGED-COMBAT.md) · [SOCIAL-LAYER](SOCIAL-LAYER.md) · [TAURI-DISTRIBUTION](TAURI-DISTRIBUTION.md) · archived: [EQUIPMENT-EXPANSION](../archive/EQUIPMENT-EXPANSION.md) · [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) · [SCREEN-REFACTORING](../archive/SCREEN-REFACTORING-2026-06-03.md) · [SURVIVAL-HEALTH](../archive/SURVIVAL-HEALTH-2026-05-30.md) · [SIMULATION-PERF](../archive/SIMULATION-PERF-2026-05-30.md)

## Status Key

`[x]` done · `[-]` in progress · `[ ]` not started · `[~]` deprecated — blocked items stay `[ ]` with a **Blocked on…** note.

---

## Phase 1 — Foundation (COMPLETE [x])

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
| Production chains (primitives → Maker's Bench, then full expansion)      | [x]    | archived: `PRODUCTION-CHAINS-2026-05-28.md` + `PRODUCTION-CHAIN-EXPANSION-2026-06-12.md` |
| Healthcare jobs                                                          | [x]    | delivered as caretaking/healing in `COMBAT-SYSTEM.md`                                    |
| Cooking as a dedicated job                                               | [ ]    | Hearth/Kitchen/Drying-Rack buildings exist; standalone cooking job unclaimed             |

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
**Magic & Skills is pushed back** after Living World.

| #  | Item                                                                                                                                                                                                                   | Status         | Spec                                                                                                      |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| —  | **Combat System** (stances, weapons/crit, wounds, pain→collapse, healing, caretaking)                                                                                                                                  | [x] 2026-06-11 | [COMBAT-SYSTEM.md](COMBAT-SYSTEM.md) · ADR-012/013                                                        |
| —  | **Entity Spawning** Phase A–B (mobs, animals, hunting, foraging, butchering)                                                                                                                                           | [x]            | [ENTITIES_SPAWNING.md](ENTITIES_SPAWNING.md)                                                              |
| 1  | **Production Chain Expansion** (smelting, forges, mining, fuel/heat, leather, survival)                                                                                                                                | [x] 2026-06-12 | archived: [PRODUCTION-CHAIN-EXPANSION-2026-06-12.md](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) |
| 2  | **Equipment Expansion** (layered armour slots, mainHand/offHand, weight/volume inventory, durability, material-bonus crafting)                                                                                         | [x] 2026-06-13 | archived: [EQUIPMENT-EXPANSION.md](../archive/EQUIPMENT-EXPANSION.md)                                     |
| 2b | **Physical Production** (reserve-and-fetch crafting: items always physical, haul inputs to workstation, output on station; retire `gs.item`) — Pass 1 active only; passive furnaces + building-material hauling follow | [-]            | [PHYSICAL-PRODUCTION.md](PHYSICAL-PRODUCTION.md) · ADR-016                                                |
| 3  | **Living World B–D** (seasons, temperature, weather, fog of war)                                                                                                                                                       | [ ] B–D        | [SEASONS_WEATHER.md](SEASONS_WEATHER.md)                                                                  |
| 4  | **Ranged Combat** (ammunition, line-of-sight, bows/sling/crossbow) — after Living World                                                                                                                                | [ ]            | [RANGED-COMBAT.md](RANGED-COMBAT.md)                                                                      |
| 5  | **Magic & Skills** (depth layer; **reorganised after Living World**)                                                                                                                                                   | [ ] deferred   | [MAGIC-SKILLS.md](MAGIC-SKILLS.md)                                                                        |
| 6  | **Social Layer** (relationships, mood depth, death mood events, pawn traits)                                                                                                                                           | [ ]            | [SOCIAL-LAYER.md](SOCIAL-LAYER.md)                                                                        |
| 7  | **Research Enhancement** (three-tier, lore-item driven; after item DB)                                                                                                                                                 | [ ]            | [RESEARCH-ENHANCEMENT.md](RESEARCH-ENHANCEMENT.md)                                                        |
| 8  | **Entity Spawning** Phase C–E (taming, mounts, breeding) — **deferred** content expansion                                                                                                                              | [ ] (A–B [x])  | [ENTITIES_SPAWNING.md](ENTITIES_SPAWNING.md)                                                              |

### Spec Dependency Matrix

| Spec                           | Hard Blockers                                       | Also Benefits From                                 | Enables                                                          |
| ------------------------------ | --------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| SCREEN-REFACTORING [x]         | —                                                   | —                                                  | healthcare / cooking jobs                                        |
| SURVIVAL-HEALTH [x]            | —                                                   | —                                                  | ENTITIES_SPAWNING Phase B (food stakes); COMBAT (injury context) |
| RESEARCH-ENHANCEMENT           | EQUIPMENT-EXPANSION [x] (lore items)                | —                                                  | MAGIC-SKILLS (nodes 3 + 5)                                       |
| SEASONS_WEATHER B–D            | —                                                   | —                                                  | ENTITIES_SPAWNING (night multiplier; seasonal biome weights)     |
| PRODUCTION-CHAIN-EXPANSION [x] | —                                                   | —                                                  | EQUIPMENT-EXPANSION Tier 1 + 2                                   |
| ENTITIES_SPAWNING Phase A–B    | —                                                   | SEASONS_WEATHER; SURVIVAL-HEALTH                   | COMBAT-SYSTEM                                                    |
| COMBAT-SYSTEM                  | ENTITIES_SPAWNING Phase A                           | SURVIVAL-HEALTH                                    | MAGIC-SKILLS; EQUIPMENT; SOCIAL; ENTITIES Phase E                |
| EQUIPMENT-EXPANSION [x]        | COMBAT [x] + PRODUCTION-CHAIN [x]                   | —                                                  | MAGIC-SKILLS (staff items); RANGED-COMBAT (bow items + fields)   |
| RANGED-COMBAT                  | COMBAT [x] + EQUIPMENT [x] + Living World (LoS/fog) | —                                                  | mob archers; MAGIC-SKILLS (enchanted ammo)                       |
| MAGIC-SKILLS                   | COMBAT-SYSTEM                                       | RESEARCH (nodes 3+5 only); EQUIPMENT (staff items) | COMBAT depth (skills + spells)                                   |
| SOCIAL-LAYER                   | COMBAT                                              | —                                                  | —                                                                |
| ENTITIES_SPAWNING Phase C–E    | COMBAT (Phase E); Phase A                           | —                                                  | —                                                                |
| TAURI-DISTRIBUTION             | Phase 3 complete                                    | —                                                  | —                                                                |

### Implementation Waves

| Wave                | Parallel tracks                                                                       | Prerequisite                                                                              |
| ------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **1** — Phase 2 [x] | SCREEN-REFACTORING [x] · SURVIVAL-HEALTH [x]                                          | complete                                                                                  |
| **2** [x]           | ENTITIES_SPAWNING Phase A–B                                                           | complete                                                                                  |
| **3** [x]           | COMBAT-SYSTEM (incl. wounds, stances, caretaking)                                     | complete (2026-06-11)                                                                     |
| **4** [x]           | PRODUCTION-CHAIN-EXPANSION                                                            | complete (2026-06-12)                                                                     |
| **5** [x]           | EQUIPMENT-EXPANSION                                                                   | complete (2026-06-13); needed PROD-CHAIN [x] (Wave 4) + COMBAT [x]                        |
| **6** — next        | SEASONS_WEATHER B–D (Living World) · SOCIAL-LAYER                                     | independent / COMBAT [x]                                                                  |
| **7**               | RANGED-COMBAT · MAGIC-SKILLS · RESEARCH-ENHANCEMENT · ENTITIES C–E (deferred content) | after Living World; RANGED needs Living World LoS; MAGIC needs COMBAT [x] + EQUIPMENT [x] |
| **8** — Phase 4     | TAURI-DISTRIBUTION                                                                    | Wave 7 complete                                                                           |

### Other Phase 3 work (no dedicated spec)

| Item                                                                                                          | Status              | Notes                                                                             |
| ------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| Building-work integration (bonus stacking)                                                                    | [ ]                 | Analysis in `game/ARCHITECTURE.md`                                                |
| AI event generation expansion                                                                                 | [ ]                 | —                                                                                 |
| **Sim perf scaling** (500+ entities, 1000×1000 maps)                                                          | [ ] Phase 2 of spec | archived: `SIMULATION-PERF-2026-05-30.md` — Phase 1+1.5 [x] (60/60 TPS, 100+ FPS) |
| **Unified work model** (single stats.jsonc speed/yield/quality; ModifierSystem work-eff removed)              | [x] 2026-06-13      | ADR-015 in `game/DECISIONS.md`; no separate spec                                  |
| **Work-driven pawn hunting** (mark-to-hunt → chase → resolve as combat → carcass → butchery; prey fight-back) | [x] 2026-06-13      | reuses COMBAT + ENTITIES circuits; no separate spec                               |

---

## Phase 4 — Distribution

| Item                                                    | Status         | Spec                                                   |
| ------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| Tauri viability spike (WASM + saves in desktop WebView) | [ ] **do now** | [TAURI-DISTRIBUTION.md](TAURI-DISTRIBUTION.md) Phase A |
| Adapter-static migration + AI endpoint decision         | [ ]            | [TAURI-DISTRIBUTION.md](TAURI-DISTRIBUTION.md) Phase B |
| Linux / Windows / macOS release bundles + CI matrix     | [ ]            | [TAURI-DISTRIBUTION.md](TAURI-DISTRIBUTION.md) Phase C |

---

## Completed Items (Archive)

See `.tasks/archive/` for full specs.

| Item                                                                          | Completed  | Archive file                            |
| ----------------------------------------------------------------------------- | ---------- | --------------------------------------- |
| GameEngine refactoring Phase 1                                                | 2026-05-25 | `GAMEENGINE-REFACTORING-2026-05-25.md`  |
| PawnScreen refactoring                                                        | 2026-05-25 | `PAWN-SCREEN-REFACTORING-2026-05-25.md` |
| DF-like migration design                                                      | 2026-05-28 | `DF-MIGRATION-2026-05-28.md`            |
| Production chains design                                                      | 2026-05-28 | `PRODUCTION-CHAINS-2026-05-28.md`       |
| Fog of War (deferred to Living World)                                         | 2026-05-28 | `FOG-OF-WAR-DEFERRED-2026-05-28.md`     |
| Sim perf Phase 1+1.5 (60 TPS stable, 100+ FPS, rAF-accumulator, campfire fix) | 2026-05-30 | `SIMULATION-PERF-2026-05-30.md`         |
| Screen refactoring (WorkScreen split into sub-components)                     | 2026-06-03 | `SCREEN-REFACTORING-2026-06-03.md`      |
| Survival consequences (starvation, collapse, injuries, health)                | 2026-05-30 | `SURVIVAL-HEALTH-2026-05-30.md`         |
| Production & early-survival expansion (§A–§G, §1–§6; durability, recipes)      | 2026-06-12 | `PRODUCTION-CHAIN-EXPANSION-2026-06-12.md` |
| Equipment, inventory & combat loadout (layered slots, weight/volume, material-bonus crafting, paper-doll UI) | 2026-06-13 | `EQUIPMENT-EXPANSION.md` |
