<!-- LOC cap: 300 (created: 2026-05-25) -->

# ROADMAP

> **Related:** [game/DESIGN](../game/DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) · [LIVING-WORLD](LIVING-WORLD.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [EQUIPMENT-EXPANSION](EQUIPMENT-EXPANSION.md) · [PRODUCTION-CHAIN-EXPANSION](PRODUCTION-CHAIN-EXPANSION.md) · [SOCIAL-LAYER](SOCIAL-LAYER.md) · [TAURI-DISTRIBUTION](TAURI-DISTRIBUTION.md) · archived: [SCREEN-REFACTORING](../archive/SCREEN-REFACTORING-2026-06-03.md) · [SURVIVAL-HEALTH](../archive/SURVIVAL-HEALTH-2026-05-30.md) · [SIMULATION-PERF](../archive/SIMULATION-PERF-2026-05-30.md)

## Status Key

`✅ done` · `🔄 in progress` · `❌ not started` · `⚠️ blocked`

---

## Phase 1 — Foundation (COMPLETE ✅)

All critical architectural debt resolved. Core survival loop is functional.

| Item                   | Status | Notes                                                     |
| ---------------------- | ------ | --------------------------------------------------------- |
| GameEngine refactoring | ✅      | Reduced from 900+ lines to coordination-only; see archive |
| PawnScreen refactoring | ✅      | Split into 6 sub-components; see archive                  |
| Hunger / rest system   | ✅      | Automatic eat/sleep with multi-turn sessions              |

**Missing from Phase 1**: adverse consequences for unmet needs (starvation death, fatigue collapse) — deferred to Phase 2.

---

## Phase 2 — Core Loop Completion (CURRENT)

| Item                                                                     | Status | Spec                                                                      |
| ------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------- |
| Screen refactoring (WorkScreen only)                                     | ✅      | archived: `SCREEN-REFACTORING-2026-06-03.md`                              |
| **Survival consequences** (starvation death, collapse, injuries, health) | ✅      | archived: `SURVIVAL-HEALTH-2026-05-30.md`                                 |
| Production chains (primitives through Maker's Bench)                     | ✅      | archived: `PRODUCTION-CHAINS-2026-05-28.md`; expansion → Phase 3          |
| Healthcare and cooking jobs                                              | ❌      | tracked in [PRODUCTION-CHAIN-EXPANSION.md](PRODUCTION-CHAIN-EXPANSION.md) |

---

## Phase 3 — Depth Features (highest impact first)

Ordered by player-visible impact at the time of implementation. Magic & Skills
is the governing skill framework — Combat is built on top of it.

| #   | Item                                                                          | Status | Spec                                                           |
| --- | ----------------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| 1   | **Entity Spawning** (mobs, animals, hunting, butchering, taming)              | ❌      | [ENTITIES_SPAWNING.md](ENTITIES_SPAWNING.md)                   |
| 2   | **Magic & Skills** (unified skill framework; governs combat + spells)         | ❌      | [MAGIC-SKILLS.md](MAGIC-SKILLS.md)                             |
| 3   | **Combat System** (RimWorld real-time × Stoneshard skills; governed by magic) | ❌      | [COMBAT-SYSTEM.md](COMBAT-SYSTEM.md)                           |
| 4   | **Production Chain Expansion** (smelting, forges, mining, cooking, healing)   | ❌      | [PRODUCTION-CHAIN-EXPANSION.md](PRODUCTION-CHAIN-EXPANSION.md) |
| 5   | **Equipment Expansion** (Tiers 0–2, durability, skill grants)                 | ❌      | [EQUIPMENT-EXPANSION.md](EQUIPMENT-EXPANSION.md)               |
| 6   | **Living World B–D** (seasons, temperature, weather, fog of war)              | ❌ B–D  | [LIVING-WORLD.md](LIVING-WORLD.md)                             |
| 7   | **Social Layer** (relationships, mood depth, pawn traits)                     | ❌      | [SOCIAL-LAYER.md](SOCIAL-LAYER.md)                             |
| 8   | **Research Enhancement** (three-tier, lore-item driven; after item DB)        | ❌      | [RESEARCH-ENHANCEMENT.md](RESEARCH-ENHANCEMENT.md)             |

### Spec Dependency Matrix

| Spec                        | Hard Blockers                            | Also Benefits From                                 | Enables                                                          |
| --------------------------- | ---------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| SCREEN-REFACTORING ✅        | —                                        | —                                                  | healthcare / cooking jobs                                        |
| SURVIVAL-HEALTH ✅           | —                                        | —                                                  | ENTITIES_SPAWNING Phase B (food stakes); COMBAT (injury context) |
| RESEARCH-ENHANCEMENT        | EQUIPMENT-EXPANSION (lore items)         | —                                                  | MAGIC-SKILLS (nodes 3 + 5)                                       |
| LIVING-WORLD B–D            | —                                        | —                                                  | ENTITIES_SPAWNING (night multiplier; seasonal biome weights)     |
| PRODUCTION-CHAIN-EXPANSION  | —                                        | —                                                  | EQUIPMENT-EXPANSION Tier 1 + 2                                   |
| ENTITIES_SPAWNING Phase A–B | —                                        | LIVING-WORLD; SURVIVAL-HEALTH                      | COMBAT-SYSTEM                                                    |
| COMBAT-SYSTEM               | ENTITIES_SPAWNING Phase A + MAGIC-SKILLS | SURVIVAL-HEALTH                                    | EQUIPMENT; SOCIAL; ENTITIES Phase E                              |
| EQUIPMENT-EXPANSION         | COMBAT + PRODUCTION-CHAIN                | —                                                  | MAGIC-SKILLS (staff items)                                       |
| MAGIC-SKILLS                | —                                        | RESEARCH (nodes 3+5 only); EQUIPMENT (staff items) | COMBAT-SYSTEM (skill framework)                                  |
| SOCIAL-LAYER                | COMBAT                                   | —                                                  | —                                                                |
| ENTITIES_SPAWNING Phase C–E | COMBAT (Phase E); Phase A                | —                                                  | —                                                                |
| TAURI-DISTRIBUTION          | Phase 3 complete                         | —                                                  | —                                                                |

### Implementation Waves

| Wave                  | Parallel tracks                                         | Prerequisite                                              |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| **1** — Phase 2 ✅     | SCREEN-REFACTORING ✅ · SURVIVAL-HEALTH ✅                | complete                                                  |
| **2** — Phase 3 early | ENTITIES_SPAWNING Phase A–B · MAGIC-SKILLS Phase 1      | none (parallel — both independent foundational work)      |
| **3**                 | COMBAT-SYSTEM                                           | Wave 2 (needs ENTITIES Phase A + MAGIC-SKILLS)            |
| **4**                 | PRODUCTION-CHAIN-EXPANSION · LIVING-WORLD B–D           | none (parallel, both independent)                         |
| **5**                 | EQUIPMENT-EXPANSION · SOCIAL-LAYER · ENTITIES Phase C–E | Wave 3 (COMBAT); EQUIPMENT also needs PROD-CHAIN (Wave 4) |
| **6**                 | RESEARCH-ENHANCEMENT · MAGIC nodes 3+5                  | Wave 5 EQUIPMENT (lore item types defined)                |
| **7** — Phase 4       | TAURI-DISTRIBUTION                                      | Wave 6 complete                                           |

### Other Phase 3 work (no dedicated spec)

| Item                                                 | Status            | Notes                                                                           |
| ---------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| Building-work integration (bonus stacking)           | ❌                 | Analysis in `game/ARCHITECTURE.md`                                              |
| AI event generation expansion                        | ❌                 | —                                                                               |
| **Sim perf scaling** (500+ entities, 1000×1000 maps) | ❌ Phase 2 of spec | archived: `SIMULATION-PERF-2026-05-30.md` — Phase 1+1.5 ✅ (60/60 TPS, 100+ FPS) |

---

## Phase 4 — Distribution

| Item                                                    | Status       | Spec                                                   |
| ------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| Tauri viability spike (WASM + saves in desktop WebView) | ❌ **do now** | [TAURI-DISTRIBUTION.md](TAURI-DISTRIBUTION.md) Phase A |
| Adapter-static migration + AI endpoint decision         | ❌            | [TAURI-DISTRIBUTION.md](TAURI-DISTRIBUTION.md) Phase B |
| Linux / Windows / macOS release bundles + CI matrix     | ❌            | [TAURI-DISTRIBUTION.md](TAURI-DISTRIBUTION.md) Phase C |

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
