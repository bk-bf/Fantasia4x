<!-- LOC cap: 120 (created: 2026-05-25) -->

# ROADMAP

> **Related:** [DECISIONS](../game/DECISIONS.md) · [ITEM-RULES](../game/ITEM-RULES.md) · [BUGS](../game/BUGS.md)

## What is next lives on the board

**https://github.com/users/bk-bf/projects/4**

Every defect, feature and pending decision is an issue there, in one of eleven lanes —
`Backlog` · `Ready` · `In progress` · `In review` · `Needs approval` · `Approved` · `On dev` ·
`Done`, with `Blocked on you`, `Needs playtest` and `Rejected` beside them — and fields for work
type, area, priority and verify route. `gh issue list` is the same set without the lanes.

This file no longer tracks status. It records what shipped, and points at the spec that
described it. Planned work has no spec file: a feature's issue is its spec.

## Shipped

| # | Item | Shipped | Spec |
|---|------|---------|------|
| **T2** | **Core-stat single source** (dev-infra) | 2026-09-06 | issue #20 |
| **1** | **Creature Combat Overhaul** | 2026-07-12 | [CREATURE-COMBAT-OVERHAUL (archived)](archive/CREATURE-COMBAT-OVERHAUL-2026-07-12.md) |
| **1b** | **Rare materials & magical economy** | 2026-07-12 | [PRODUCTION-CHAIN-IIII (archived)](archive/PRODUCTION-CHAIN-IIII-2026-07-12.md) |
| **2** | **Kingdoms & Trade** | 2026-07-12 | [KINGDOMS-TRADE](archive/KINGDOMS-TRADE-2026-07-12.md) |
| **3** | **Finish Race → Culture System** | 2026-07-13 | [RACE-SYSTEM (archived)](archive/RACE-SYSTEM-2026-07-13.md) |
| **4** | **Social Layer** | 2026-07-13 | [SOCIAL-LAYER](archive/SOCIAL-LAYER.md) |
| **5** | **Rest from Production Chain III** | 2026-07-12 | [PRODUCTION-CHAIN-IIII § Phase D (archived)](archive/PRODUCTION-CHAIN-IIII-2026-07-12.md) |
| **6** | **Stealth** | 2026-07-14 | [STEALTH](review/STEALTH.md) |
| **8b** | **Soft-goods + discipline crafting rework** | 2026-07-26 | [SOFT-GOODS-CRAFTING](archive/SOFT-GOODS-CRAFTING-2026-07-26.md) |
| **8e** | **Containers & fluids** | 2026-08-23 | [CONTAINERS-AND-FLUIDS (archived)](archive/CONTAINERS-AND-FLUIDS-2026-08-23.md) |
| **T** | **Headless, API-driven sim** (dev-infra) | 2026-07-18 | [HEADLESS-SIM](archive/HEADLESS-SIM.md) |
| **T3** | **`core/` reorganisation + repo-wide dead code sweep** (dev-infra) | 2026-08-25 | — |
| — | **Traits — Phase 2 close-out** (age + `evolvesTo` evolution live; ritual gate superseded by lineage; breath-AoE / reserve hooks / formal Phase-2 kinds consciously deferred, §7) | 2026-07-10 | [TRAITS (archived)](archive/TRAITS-2026-07-10.md) |
| — | **Combat System** (stances, weapons/crit, wounds, pain→collapse, healing, caretaking) | 2026-06-11 | [COMBAT-SYSTEM-2026-06-11.md](archive/COMBAT-SYSTEM-2026-06-11.md) |
| — | **Entity Spawning A–B** (mobs/animals, lair/territory spawn, hunger/diet, pawn hunting + butchery) | 2026-07-10 | [ENTITIES_SPAWNING-2026-07-10.md](archive/ENTITIES_SPAWNING-2026-07-10.md) |
| — | **Production Chain Expansion** (smelting, forges, mining, fuel/heat, leather, survival) | 2026-06-12 | [PRODUCTION-CHAIN-EXPANSION-2026-06-12.md](archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) |
| — | **Equipment Expansion** (layered armour slots, main/off-hand, weight/volume inventory, durability) | — | [EQUIPMENT-EXPANSION.md](archive/EQUIPMENT-EXPANSION.md) |
| — | **Physical Production** (reserve-and-fetch crafting, passive furnaces, hauling, tool gating; retire `gs.item`) | 2026-06-13 | [PHYSICAL-PRODUCTION-2026-06-13.md](archive/PHYSICAL-PRODUCTION-2026-06-13.md) |
| — | **Engine Performance & Scaling** (sim→Worker, slim snapshot → 200+ TPS @4×; renderer-hitch arc; chunked terrain) | — | [ENGINE-PERFORMANCE.md](archive/ENGINE-PERFORMANCE.md) |
| — | **Living World** (day/night, seasons, temperature, weather + particle overlays, wind, snow cover) | 2026-06-17 | [SEASONS_WEATHER-2026-06-17.md](archive/SEASONS_WEATHER-2026-06-17.md) |
| — | **Ranged Combat** (ammunition, aim cadence, distance/cover, data-driven `blocksSight` LoS, recovery) | 2026-06-21 | [RANGED-COMBAT-2026-06-21.md](archive/RANGED-COMBAT-2026-06-21.md) |
| — | **Production Chain II** (§Q quality, §M magic gear/staves, §L pawn-carts, §F farming + food chain) | 2026-06-21 | [PRODUCTION-CHAIN-II-2026-06-21.md](archive/PRODUCTION-CHAIN-II-2026-06-21.md) |
| — | **Production Chain III data** (magic ages, walls, glue, hides, armour, alchemy, defence, Famed foundation) | 2026-07-10 | [PRODUCTION-CHAIN-III-2026-07-10.md](archive/PRODUCTION-CHAIN-III-2026-07-10.md) |
| — | **Distribution** (Electron wrapper, adapter-static + IndexedDB saves, electron-builder + CI release matrix) | 2026-07-10 | [DISTRIBUTION-2026-07-10.md](archive/DISTRIBUTION-2026-07-10.md) |
| — | **Lineages** (ancestral-blood mutation trees; born/awaken via deed meters; grow/evolve at growth events) | 2026-07-09 | [LINEAGES-2026-07-09.md](archive/LINEAGES-2026-07-09.md) |
| — | **Lineages II** (werewolf transform + lunar counter; blood meter → BloodHunt; vampiric feeding; heritage flatten) | 2026-07-10 | [LINEAGES-II-2026-07-10.md](archive/LINEAGES-II-2026-07-10.md) |
| — | **Trait system V2** (condition-backed capabilities, typed `kind` taxonomy, per-pawn draw ≤2 racial + ≤3 personal) | 2026-07-10 | [TRAITS (archived)](archive/TRAITS-2026-07-10.md) |
| — | **Trait §0 cleanup + Culture rename** (traits are pure granters; `Race`→`Culture` throughout code+UI) | 2026-07-10 | [TRAITS (archived)](archive/TRAITS-2026-07-10.md) |
| — | **Race overhaul Ph0** (procedural race pool, mixed colonies, lore, `raceRelations` stub, known-races pokédex) | 2026-07-13 | [RACE-SYSTEM (archived)](archive/RACE-SYSTEM-2026-07-13.md) |
| — | **Work experience system** (per-pawn 1–50 exp/work-category → speed/yield/quality; learn-by-doing) | 2026-07-10 | [WORK-EXPERIENCE-2026-07-10.md](archive/WORK-EXPERIENCE-2026-07-10.md) |
| — | **Migrant wave + world-event foundation** (season-boundary hopefuls; the `pendingEvent` seam) | — | — |
| — | **Per-stack craft quality** (R8: `crafting_quality` → `rollCraftQuality` tier stamped per-instance) | — | — |
| — | **Combat-anatomy depth pass** (data-driven body plans, part-bound natural weapons, fractures, blood/collapse) | — | — |
| — | **Unified work model** (single `stats.jsonc` speed/yield/quality; ModifierSystem work-eff removed) | — | — |
| — | **Data-driven colony jobs** (`jobs.jsonc` + `JobService` handler registry; no hardcoded switches) | — | — |
| — | **Data-driven condition drivers** (malnutrition/dehydration onset/rate/recovery in `conditions.jsonc`) | — | — |
| — | **Work-driven pawn hunting** (mark-to-hunt → chase → combat → carcass → butchery) | — | — |
| — | **PawnStateMachine decomposition** (2818→988 LOC; dispatch table + `pawn/*` helpers) | 2026-06-13 | — |
| — | **Cooking as a dedicated job** (food crafts route to the `cooking` labor category) | — | — |
| — | **Survival consequences** (starvation death, collapse, injuries, health) | 2026-05-30 | [SURVIVAL-HEALTH-2026-05-30.md](archive/SURVIVAL-HEALTH-2026-05-30.md) |
| — | **Screen refactoring** (WorkScreen split into sub-components) | 2026-06-03 | [SCREEN-REFACTORING-2026-06-03.md](archive/SCREEN-REFACTORING-2026-06-03.md) |
| — | **Phase 1 foundation** (GameEngine + PawnScreen refactoring, hunger/rest system) | 2026-05-25 | — |

## Not shipped, tracked on the board

| # | Item | Spec |
|---|------|------|
| **2b** | **Visitors (kingdom guests)** | [#65](https://github.com/bk-bf/Fantasia4x/issues/65) |
| **7** | **Drafted Job/Need Orders** | [DRAFTED-JOB-ORDERS](archive/DRAFTED-JOB-ORDERS.md) |
| **8** | **Rest from Entity Spawning** | [#58](https://github.com/bk-bf/Fantasia4x/issues/58) |
| **8c** | **Build-archetype coverage audit** | [BUILD-ARCHETYPES (artifact)](https://claude.ai/code/artifact/f87ef907-46e2-4015-a455-b698799eea4f) |
| **8d** | **Combat balance: the two-axis stat rebuild** | [#33](https://github.com/bk-bf/Fantasia4x/issues/33)–[#37](https://github.com/bk-bf/Fantasia4x/issues/37) |
| **8f** | **Early–mid apparel gap (t0–t2)** | [AUDIT (archived)](archive/AUDIT-2026-08-25.md) |
| **8g** | **Wound-specific tiered medicine** | [AUDIT (archived)](archive/AUDIT-2026-08-25.md) |
| **8h** | **Runic / magic-reagent tier redesign** | _unspecced_ |
| **9** | **Magic III** | [LINEAGES](archive/LINEAGES-2026-07-09.md) |
| **10** | **Research Enhancement** | [#61](https://github.com/bk-bf/Fantasia4x/issues/61) |
| — | *loose ends, no spec:* building-work bonus stacking · AI event generation (migrant-wave `pendingEvent` seam) · culture content-variety expansion (diversify archetype `statFocus`/`statDump` + comparatives, ~16 archetypes + per-archetype name banks, more quality/yield traits) | — |

