<!-- LOC cap: 300 (created: 2026-05-25) -->

# ROADMAP

> **Related:** [game/DESIGN](../game/DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · [SCREEN-REFACTORING](SCREEN-REFACTORING.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) · [SURVIVAL-HEALTH](SURVIVAL-HEALTH.md) · [LIVING-WORLD](LIVING-WORLD.md) · [TAURI-DISTRIBUTION](TAURI-DISTRIBUTION.md) · archived: [SIMULATION-PERF](../archive/SIMULATION-PERF-2026-05-30.md)

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

| Item                                                                     | Status                           | Spec                                               |
| ------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------- |
| Screen refactoring (WorkScreen only)                                     | ❌                                | [SCREEN-REFACTORING.md](SCREEN-REFACTORING.md)     |
| **Survival consequences** (starvation death, collapse, injuries, health) | ❌ **NEXT**                       | [SURVIVAL-HEALTH.md](SURVIVAL-HEALTH.md)           |
| Production chains + pawn autonomy                                        | ❌                                | archived: `PRODUCTION-CHAINS-2026-05-28.md`        |
| Research enhancement (three-tier system)                                 | ❌                                | [RESEARCH-ENHANCEMENT.md](RESEARCH-ENHANCEMENT.md) |
| Healthcare and cooking jobs                                              | ⚠️ blocked on WorkScreen refactor | —                                                  |

---

## Phase 3 — Depth Features

| Item                                                                           | Status                     | Notes                                                                           |
| ------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------- |
| **Living World** (day/night, seasons, temperature, weather, WebGL shaders)     | 🔄 Phase A+A2 ✅ / B–D ❌     | [LIVING-WORLD.md](LIVING-WORLD.md)                                              |
| **Combat system** (mobs, enemies, animals, tactical combat, skills, abilities) | ❌                          | spec pending — see `game/DESIGN.md` combat section                              |
| Fog of War & Visibility (night-based vision, eventual WASM shadowcast)         | ❌                          | Phase D of LIVING-WORLD; archived: `FOG-OF-WAR-DEFERRED-2026-05-28.md`          |
| Building-work integration (bonus stacking)                                     | ❌                          | Analysis in `game/ARCHITECTURE.md`                                              |
| Equipment-driven combat abilities                                              | ⚠️ blocked on combat system | —                                                                               |
| AI event generation expansion                                                  | ❌                          | —                                                                               |
| **Sim perf scaling** (500+ entities, 1000×1000 maps)                           | ❌ Phase 2 of spec          | archived: `SIMULATION-PERF-2026-05-30.md` — Phase 1+1.5 ✅ (60/60 TPS, 100+ FPS) |

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
