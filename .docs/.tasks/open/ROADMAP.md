<!-- LOC cap: 300 (created: 2026-05-25) -->

# ROADMAP

> **Related:** [game/DESIGN](../game/DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · [SCREEN-REFACTORING](SCREEN-REFACTORING.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md)

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

| Item                                               | Status                           | Spec                                               |
| -------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| Screen refactoring (Work / Exploration / Crafting) | ❌                                | [SCREEN-REFACTORING.md](SCREEN-REFACTORING.md)     |
| Adverse need consequences (starvation, collapse)   | ❌                                | —                                                  |
| Production chains                                  | ❌                                | —                                                  |
| Research enhancement (three-tier system)           | ❌                                | [RESEARCH-ENHANCEMENT.md](RESEARCH-ENHANCEMENT.md) |
| Healthcare and cooking jobs                        | ⚠️ blocked on WorkScreen refactor | —                                                  |

---

## Phase 3 — Depth Features

| Item                                       | Status                     | Notes                                                        |
| ------------------------------------------ | -------------------------- | ------------------------------------------------------------ |
| Combat system                              | ❌                          | See `game/DESIGN.md` — Battle Brothers-style tactical combat |
| Building-work integration (bonus stacking) | ❌                          | Analysis in `game/ARCHITECTURE.md`                           |
| Equipment-driven combat abilities          | ⚠️ blocked on combat system | —                                                            |
| AI event generation expansion              | ❌                          | —                                                            |

---

## Completed Items (Archive)

See `.tasks/archive/` for full specs.

| Item                           | Completed  | Archive file                            |
| ------------------------------ | ---------- | --------------------------------------- |
| GameEngine refactoring Phase 1 | 2026-05-25 | `GAMEENGINE-REFACTORING-2026-05-25.md`  |
| PawnScreen refactoring         | 2026-05-25 | `PAWN-SCREEN-REFACTORING-2026-05-25.md` |
