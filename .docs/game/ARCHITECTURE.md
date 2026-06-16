<!-- LOC cap: 300 (created: 2026-05-25) -->

# ARCHITECTURE [GAME]

> **Related:** [DESIGN](DESIGN.md) · [DECISIONS](DECISIONS.md) · [PHILOSOPHY](PHILOSOPHY.md) · [ui/ARCHITECTURE](../ui/ARCHITECTURE.md) · [ROADMAP](../.tasks/open/ROADMAP.md) · [SIMULATION-PERF](../.tasks/open/SIMULATION-PERF.md)

## Layer Map

Strict top-down dependency — lower layers never import from higher ones:

```
src/routes/ + src/lib/components/     ← Svelte UI (presentation only)
         ↓
src/lib/stores/                       ← Svelte writable stores, auto-persist to localStorage
         ↓
src/lib/game/systems/GameEngineImpl   ← Turn coordinator (calls services, no logic)
         ↓
src/lib/game/services/                ← Business logic singletons
         ↓
src/lib/game/core/                    ← Types, static databases, GameStateManager
```

## Services

Each service implements an interface and exports a singleton. Import the singleton, never instantiate the class.

| Singleton         | File                           | Responsibility                                    |
| ----------------- | ------------------------------ | ------------------------------------------------- |
| `pawnService`     | `services/PawnService.ts`      | Automatic needs, pawn state, ability calculations |
| `workService`     | `services/WorkService.ts`      | Work assignment + state sync (no efficiency — ADR-015) |
| `pawnStatService` | `services/PawnStatService.ts`  | **Sole** work model: `getWorkModifiers` (speed/yield/quality from `stats.jsonc`) + body capacities (ADR-015) |
| `buildingService` | `services/BuildingService.ts`  | Construction checks, building bonuses             |
| `itemService`     | `services/ItemService.ts`      | Crafting availability, item ops, carry budget, dynamic names |
| `jobService`      | `services/JobService.ts`       | Central job pool: generate/claim/advance jobs; reserve-and-fetch crafting + building hauling (ADR-016); tool gating (ADR-009) |
| `recipeService`   | `services/RecipeService.ts`    | Recipe registry ("how X is made"); station tiers; `passive` furnace flag |
| `resourceObjectService` | `services/ResourceObjectService.ts` | World resource defs: harvest interactions, yields, `toolRequirement` |
| `researchService` | `services/ResearchService.ts`  | Research progression, unlock checks               |
| `locationService` | `services/LocationServices.ts` | Exploration missions, location data               |
| `entityService`   | `services/EntityService.ts`    | Mob spawning, AI, movement, hunger, hunting, corpses |
| `occupancyService`| `services/OccupancyService.ts` | Single source of "which tiles hold a body" — pathfinding + movement collision (ADR-014) |

Two singletons live under `systems/` (they coordinate state-machine/combat logic rather than being
pure services): **`pawnStateMachineService`** (`systems/PawnStateMachine.ts` — the pawn FSM:
needs / work / combat / health) and **`combatService`** (`systems/Combat.ts` — the wound model,
swings, capacity-driven downing; ADR-012). `gameEngine` (`systems/GameEngineImpl.ts`) is the turn
coordinator above the services.

**Movement & collision flow.** Pawns and mobs share one pathfinder (WASM A\*, behind the `PathfinderService` interface per ADR-008) and one movement integrator (`MovementSystem.advanceAlongPath`). Both consult `occupancyService` for solid-body collision: A\* grids are built with occupied tiles masked out (`buildPathfindingGridsWithBlocked`) so routes plan around bodies, and the per-tick advance passes hold rather than enter an occupied tile. One body per tile — see ADR-014.

## State Management

All game state lives in one `GameState` object. Mutation goes exclusively through `GameStateManager`:

```typescript
// ✅ only way to mutate state
gameStateManager.addResource('wood', 10);
gameStateManager.updatePawn(pawnId, { health: 80 });
gameStateManager.updateState({ turn: state.turn + 1 });
```

Persistence: `localStorage['fantasia4x-save']` — serialised by `src/lib/stores/gameState.ts`.

## Turn Order

`GameEngineImpl.processGameTurn()` runs these phases each tick — do not reorder, since later
phases read state the earlier ones produce:

1. **Needs** — per-tick hunger/fatigue/thirst/hygiene accrual + auto drink/wash (`pawnService.processNeedsTick` / `processAutoDrink` / `processAutoWash`).
2. **Item upkeep** — spoilage, weather deterioration, wood drying (`itemService.stepItemDecay` / `stepItemDeterioration` / `stepWoodDrying`).
3. **Research** — accumulate research progress (`researchService.processResearchTick`).
4. **Jobs** — regenerate the job pool from world state (`jobService.generateJobs`): harvest / haul / **fetch** / construct / deconstruct / craft / refuel.
5. **Buildings** — deconstruction, campfire/furnace fuel, structural condition, traps (`processBuildings`).
6. **Passive production** — loaded furnaces transform staged inputs over time (`processPassiveProduction`, ADR-016).
7. **Pawns** — draft orders → movement → state machine (`pawnStateMachineService.tick`: needs/work/combat/**health**) → work-state sync → mood/morale.
8. **Resource regrowth** — restore tiles whose regrowth cooldown expired.
9. **Entities** — mob spawn / step / movement / hunger / removal (`entityService.*`).
10. **Combat** — `combatService.tickCombat` + fresh-corpse handling.
11. **Reap dead** — `reapDeadPawns`: finalise any combat death that bypassed `killPawn` (corpse/gear drop, record) and remove dead pawns from `pawns[]` (NT-2).
12. **Events** — `eventSystem.generateEvent` rolls a random world event on its own cadence; consequences are applied (`processEventConsequences`) and the event is logged to the chronicle via `simLog.logActivity({type:'event'})` (R11, ADR-006 content). Events fire rarely (cadence in `core/Events.ts`); most ticks this is a cheap early-return.
13. **Commit + UI push** — `GameStateManager.updateState` then a throttled store notify (~15 Hz).

## Modifier System

`ModifierSystem` aggregates **building, item, and trait** effects for display and stat bonuses. Every result exposes `sources[]`:

```typescript
const result = modifierSystem.calculateEquipmentBonuses(pawn);
// result[effect].totalValue — final value
// result[effect].sources     — [{ description: 'Iron Sword: +2 accuracy', value: 2 }, ...]
```

Never compute flat bonus sums manually when a modifier system method exists.

**Work is NOT here (ADR-015).** Work speed/yield/quality is a separate, single model in `pawnStatService.getWorkModifiers` (formulas in `database/stats.jsonc` × body capacities × explicit trait `workSpeed`/`workYield`/`workQuality`). The old `ModifierSystem.calculateWorkEfficiency` path was deleted — do not reintroduce a second work-calc path.

## Static Data Files

| File                | Contents                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| `core/types.ts`     | All interfaces: `GameState`, `Pawn`, `Building`, `Item`, `WorkCategory`… |
| `core/GameState.ts` | `GameStateManager` — the only mutation surface                           |
| `core/Items.ts`     | Item definitions (resources, equipment, consumables)                     |
| `core/Buildings.ts` | Building definitions and unlock conditions                               |
| `core/Research.ts`  | Research tree and unlock costs                                           |
| `core/Work.ts`      | Work category definitions                                                |
| `core/Race.ts`      | Race generation ranges and racial traits                                 |
| `core/Locations.ts` | Exploration zone definitions                                             |
| `core/Events.ts`    | Event type definitions                                                   |

## AI Generation (Server-Only)

Gemini API calls live exclusively in `src/routes/api/`. Client code calls the route; it never imports `@google/generative-ai` directly.

## Performance & Observability

`processGameTurn()` is one tick. The sim runs in a **Web Worker** (`sim/sim.worker.ts`, ADR-021) at `TICKS_PER_SECOND = 60`; the worker owns the canonical `GameState` and the main thread is a **read-only projection** fed by per-flush snapshots. Player/dev actions are serializable **commands** posted to the worker (`sim/commands.ts`). Full detail: [ENGINE-PERFORMANCE](../.tasks/open/ENGINE-PERFORMANCE.md).

- **Worker→main snapshot (the perf-critical path, ADR-021 W2/W2b — ENGINE-PERFORMANCE §B).** Cloning the whole `GameState` every flush was ~32% of worker time. Now: a **sectional diff** (only top-level fields whose ref changed) + **per-entity slim/resync** for pawns/mobs (slim hot-field projection every flush; heavy cold fields full-resynced ~every 8th flush), reassembled on a per-id mirror in `simWorkerClient`. Took the heavy stress case to **80–100 TPS @4×**. Protocol in `sim/simProtocol.ts` (`EntitySync`).
- **Profiling is browser-native** (the custom in-game profiler was retired — it scaled with entity count and couldn't see the worker boundary). Capture with the **Firefox Profiler** on the `--profiler` sandbox, read headless via `scripts/profile-self.mjs` (JS self-time per worker function) or `pq`. See ENGINE-PERFORMANCE §10.
- **Gated logging** (`core/log.ts`) — hot-path modules do `import { gatedConsole as console } from '../core/log'` to silence per-tick `log`/`debug`/`info`/`warn` (errors stay live). Hot-path logging was ~75% of per-tick cost before this. New per-tick code must use the shim, not the global `console`.

## Known Architectural Debt

- `Items.ts` and `Buildings.ts` historically mixed data with business logic; extraction to services is ongoing. New code must not add logic to data files.
- `WorkScreen.svelte`, `ExplorationScreen.svelte`, `CraftingScreen.svelte` remain oversized — see `.tasks/open/SCREEN-REFACTORING.md`.
