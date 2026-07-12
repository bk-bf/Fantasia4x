<!-- LOC cap: 300 (created: 2026-05-25) -->

# ROADMAP

> **Related:** [game/DESIGN](../game/DESIGN.md) · [game/ARCHITECTURE](../game/ARCHITECTURE.md) · [TRAITS (archived)](../archive/TRAITS-2026-07-10.md) · [CREATURE-COMBAT-OVERHAUL](../archive/CREATURE-COMBAT-OVERHAUL-2026-07-12.md) · [KINGDOMS-TRADE](KINGDOMS-TRADE.md) · [RACE-SYSTEM](RACE-SYSTEM.md) · [SOCIAL-LAYER](SOCIAL-LAYER.md) · [STEALTH](STEALTH.md) · [DRAFTED-JOB-ORDERS](DRAFTED-JOB-ORDERS.md) · [ANIMAL-HUSBANDRY](ANIMAL-HUSBANDRY.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md)

Everything in one table: **remaining work in priority order first** (owner sequence, set 2026-07-10),
then the **completed record** below it. Full specs for shipped work live in `.tasks/archive/`.
Status: `[ ]` not started · `[-]` in progress · `[~]` deferred · `[x]` done.

| # | Item | Status | Spec / archive |
|---|------|--------|----------------|
| **1** | **Creature Combat Overhaul** | `[x]` | [CREATURE-COMBAT-OVERHAUL (archived)](../archive/CREATURE-COMBAT-OVERHAUL-2026-07-12.md) — Ph1–3 + Ph4b famed boss-gear done 2026-07-12 (6 ladders/71 variants, monster gear+pools, tiered butchery, lair escalation + attraction, §2h magical drops). Remaining open items are playtest-only; **§4a traps/turrets deferred** (out of scope — blocks on a mobs-attack-buildings system that doesn't exist) |
| **1b** | **Rare materials & magical economy** | `[x]` | [PRODUCTION-CHAIN-IIII (archived)](../archive/PRODUCTION-CHAIN-IIII-2026-07-12.md) — Phases A–D + weapon-coating done 2026-07-12 (crops/fungi/crystals/treasure + items, 4 flora potions, crystal enchant gear, mana→gem-dust refine, treasure-beside-lairs, §G draught scaling, §I famed craft-stamp/display, venom-coating subsystem). **Blocked carry-forward:** arcane turret (mobs-attack-buildings), Shadeform Philtre + Wraithbone Blade (need a wraith T5 boss) |
| **2** | **Kingdoms & Trade** | `[ ]` | [KINGDOMS-TRADE](KINGDOMS-TRADE.md) — = RACE Phase 2; code `faction`→`kingdom` rename part of this |
| **3** | **Finish Race → Culture System** | `[ ]` | [RACE-SYSTEM](RACE-SYSTEM.md) — Ph0 done; rename `Race`→`Culture`; Ph1 wiring waits on #4 |
| **4** | **Social Layer** | `[ ]` | [SOCIAL-LAYER](SOCIAL-LAYER.md) — relationships/family/conversation/mood; unblocks RACE Ph1 + prestige/trade |
| **5** | **Rest from Production Chain III** | `[x]` | [PRODUCTION-CHAIN-IIII § Phase D (archived)](../archive/PRODUCTION-CHAIN-IIII-2026-07-12.md) — done 2026-07-12: §G drink-use action + `alchemy_quality` scaling; §I famed craft-roll stamp + item-card display + equip-enchant flow |
| **6** | **Stealth** | `[ ]` | [STEALTH](STEALTH.md) — design locked; needs an encounter balance re-pass |
| **7** | **Drafted Job/Need Orders** | `[ ]` | [DRAFTED-JOB-ORDERS](DRAFTED-JOB-ORDERS.md) — design locked; small, self-contained |
| **8** | **Rest from Entity Spawning** | `[ ]` | [ANIMAL-HUSBANDRY](ANIMAL-HUSBANDRY.md) — taming → husbandry → mounts → animal hauling |
| **9** | **Magic III** | `[~]` | _unspecced_ — magic depth-layer already met by shipped [LINEAGES](../archive/LINEAGES-2026-07-09.md) + [LINEAGES-II](../archive/LINEAGES-II-2026-07-10.md); no spec written/planned yet |
| **10** | **Research Enhancement** | `[~]` | [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) — **deferred, not for now; always last** |
| — | *loose ends, no spec:* building-work bonus stacking · AI event generation (migrant-wave `pendingEvent` seam) | `[ ]` | do opportunistically |
| — | **Traits — Phase 2 close-out** (age + `evolvesTo` evolution live; ritual gate superseded by lineage; breath-AoE / reserve hooks / formal Phase-2 kinds consciously deferred, §7) | `[x]` 2026-07-10 | [TRAITS (archived)](../archive/TRAITS-2026-07-10.md) |
| — | **Combat System** (stances, weapons/crit, wounds, pain→collapse, healing, caretaking) | `[x]` 2026-06-11 | [COMBAT-SYSTEM-2026-06-11.md](../archive/COMBAT-SYSTEM-2026-06-11.md) · ADR-012/013 |
| — | **Entity Spawning A–B** (mobs/animals, lair/territory spawn, hunger/diet, pawn hunting + butchery) | `[x]` 2026-07-10 | [ENTITIES_SPAWNING-2026-07-10.md](../archive/ENTITIES_SPAWNING-2026-07-10.md) |
| — | **Production Chain Expansion** (smelting, forges, mining, fuel/heat, leather, survival) | `[x]` 2026-06-12 | [PRODUCTION-CHAIN-EXPANSION-2026-06-12.md](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) |
| — | **Equipment Expansion** (layered armour slots, main/off-hand, weight/volume inventory, durability) | `[x]` 2026-06-13 | [EQUIPMENT-EXPANSION.md](../archive/EQUIPMENT-EXPANSION.md) |
| — | **Physical Production** (reserve-and-fetch crafting, passive furnaces, hauling, tool gating; retire `gs.item`) | `[x]` 2026-06-13 | [PHYSICAL-PRODUCTION-2026-06-13.md](../archive/PHYSICAL-PRODUCTION-2026-06-13.md) · ADR-016 |
| — | **Engine Performance & Scaling** (sim→Worker, slim snapshot → 200+ TPS @4×; renderer-hitch arc; chunked terrain) | `[x]` core+renderer done; entity baseline parked | [ENGINE-PERFORMANCE.md](../archive/ENGINE-PERFORMANCE.md) · ADR-021 |
| — | **Living World** (day/night, seasons, temperature, weather + particle overlays, wind, snow cover) | `[x]` 2026-06-17 | [SEASONS_WEATHER-2026-06-17.md](../archive/SEASONS_WEATHER-2026-06-17.md) |
| — | **Ranged Combat** (ammunition, aim cadence, distance/cover, data-driven `blocksSight` LoS, recovery) | `[x]` 2026-06-21 | [RANGED-COMBAT-2026-06-21.md](../archive/RANGED-COMBAT-2026-06-21.md) |
| — | **Production Chain II** (§Q quality, §M magic gear/staves, §L pawn-carts, §F farming + food chain) | `[x]` 2026-06-21 | [PRODUCTION-CHAIN-II-2026-06-21.md](../archive/PRODUCTION-CHAIN-II-2026-06-21.md) |
| — | **Production Chain III data** (magic ages, walls, glue, hides, armour, alchemy, defence, Famed foundation) | `[x]` 2026-07-10 | [PRODUCTION-CHAIN-III-2026-07-10.md](../archive/PRODUCTION-CHAIN-III-2026-07-10.md); tails → #6 + CREATURE-COMBAT §4 |
| — | **Distribution** (Electron wrapper, adapter-static + IndexedDB saves, electron-builder + CI release matrix) | `[x]` 2026-07-10 | [DISTRIBUTION-2026-07-10.md](../archive/DISTRIBUTION-2026-07-10.md) |
| — | **Lineages** (ancestral-blood mutation trees; born/awaken via deed meters; grow/evolve at growth events) | `[x]` 2026-07-09 | [LINEAGES-2026-07-09.md](../archive/LINEAGES-2026-07-09.md) |
| — | **Lineages II** (werewolf transform + lunar counter; blood meter → BloodHunt; vampiric feeding; heritage flatten) | `[x]` 2026-07-10 | [LINEAGES-II-2026-07-10.md](../archive/LINEAGES-II-2026-07-10.md) |
| — | **Trait system V2** (condition-backed capabilities, typed `kind` taxonomy, per-pawn draw ≤2 racial + ≤3 personal) | `[x]` 2026-07-06 | [TRAITS (archived)](../archive/TRAITS-2026-07-10.md) · ADR-028 |
| — | **Trait §0 cleanup + Culture rename** (traits are pure granters; `Race`→`Culture` throughout code+UI) | `[x]` 2026-07-09 | [TRAITS (archived)](../archive/TRAITS-2026-07-10.md) |
| — | **Race overhaul Ph0** (procedural race pool, mixed colonies, lore, `raceRelations` stub, known-races pokédex) | `[x]` 2026-06-17 | [RACE-SYSTEM](RACE-SYSTEM.md) · ADR-023 |
| — | **Work experience system** (per-pawn 1–50 exp/work-category → speed/yield/quality; learn-by-doing) | `[x]` 2026-07-10 | [WORK-EXPERIENCE-2026-07-10.md](../archive/WORK-EXPERIENCE-2026-07-10.md) |
| — | **Migrant wave + world-event foundation** (season-boundary hopefuls; the `pendingEvent` seam) | `[x]` 2026-07-06 | `core/Events.ts`; `systems/migration.ts` |
| — | **Per-stack craft quality** (R8: `crafting_quality` → `rollCraftQuality` tier stamped per-instance) | `[x]` 2026-06-18 | `core/itemQuality.ts` (PROD-CHAIN-II §Q) |
| — | **Combat-anatomy depth pass** (data-driven body plans, part-bound natural weapons, fractures, blood/collapse) | `[x]` 2026-06-20 | ADR-024; `bodyPlans`/`fractures` tests |
| — | **Unified work model** (single `stats.jsonc` speed/yield/quality; ModifierSystem work-eff removed) | `[x]` 2026-06-13 | ADR-015 |
| — | **Data-driven colony jobs** (`jobs.jsonc` + `JobService` handler registry; no hardcoded switches) | `[x]` 2026-06-13 | ADR-017 |
| — | **Data-driven condition drivers** (malnutrition/dehydration onset/rate/recovery in `conditions.jsonc`) | `[x]` 2026-06-13 | — |
| — | **Work-driven pawn hunting** (mark-to-hunt → chase → combat → carcass → butchery) | `[x]` 2026-06-13 | reuses COMBAT + ENTITIES |
| — | **PawnStateMachine decomposition** (2818→988 LOC; dispatch table + `pawn/*` helpers) | `[x]` 2026-06-13 | `CODEBASE-REVIEW-RESOLVED-2026-06-13.md` |
| — | **Cooking as a dedicated job** (food crafts route to the `cooking` labor category) | `[x]` 2026-06-20 | `jobs.jsonc` / `JobService` |
| — | **Survival consequences** (starvation death, collapse, injuries, health) | `[x]` 2026-05-30 | [SURVIVAL-HEALTH-2026-05-30.md](../archive/SURVIVAL-HEALTH-2026-05-30.md) |
| — | **Screen refactoring** (WorkScreen split into sub-components) | `[x]` 2026-06-03 | [SCREEN-REFACTORING-2026-06-03.md](../archive/SCREEN-REFACTORING-2026-06-03.md) |
| — | **Phase 1 foundation** (GameEngine + PawnScreen refactoring, hunger/rest system) | `[x]` 2026-05-25 | `GAMEENGINE-REFACTORING-2026-05-25.md` · `PAWN-SCREEN-REFACTORING-2026-05-25.md` |
