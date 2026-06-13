# Hotspot Report — `systems/PawnStateMachine`

> Generated 2026-06-13 by investigating the codebase graph (`tools/codegraph`,
> `/api`). The most interconnected/largest node in the codebase.

## How it was found

Querying the graph API ranked modules by size and connectivity:

```
/api/modules   → PawnStateMachine: 70 functions (largest), depends on 14 modules
/api/hubs      → its internal predicates (isAdjacent in9) are local hubs
```

`PawnStateMachine` is the **single largest module — 70 functions, ~110 KB in one
file** (`src/lib/game/systems/PawnStateMachine.ts`) — and one of the three most
connected (16 distinct module links). It is the integration point where the
whole simulation converges.

## What it is

The **pawn AI**. Each turn `GameEngineImpl.processPawns` calls
`PawnStateMachineImpl.tick`, which calls `tickPawn` once per pawn. `tickPawn`
(fan-out **16**) is a switch over `PAWN_STATE` that dispatches to one of **15
state handlers**:

```
Idle · MovingToResource · Working · Hauling · MovingToDeposit
Hungry · Tired · Eating · Sleeping · Drinking · Washing · MovingToNeed
Fighting · Fleeing · Hunting
```

### Shape (from the graph)

| Metric | Value |
| --- | --- |
| Functions in file | **70** |
| Used by | 2 (`GameEngineImpl.processPawns`, `stores/gameState`) |
| Depends on | **14 modules** |
| Highest fan-out fns | `tickPawn` (16), `handleIdle` (12), `checkNeedInterrupts` (11), `handleWorking` (11), `tick` (9) |
| Local hubs (fan-in) | `isAdjacent` (9), `tryAssignPath` (7), `hasAvailableFood` (6), `transitionTo` (6), `goIdle` (6) |

### Heaviest outbound dependencies (call sites)

```
services/JobService (12)   dev/gameLogger (11)   services/PawnStatService (5)
core/time (5)              core/GameState (5)    services/WasmPathfinderService (5)
services/PathfinderService (2)  services/PawnService (2)  + Combat, Wounds, ItemService, Pawns, rng, Log
```

## Why it's a hotspot

1. **God-module.** One 110 KB file mixes ~8 distinct concerns: turn dispatch,
   15 behaviour handlers, pathfinding glue, needs/interrupt logic, combat
   triggers, wound tending, inventory deposit, and food selection. There is no
   internal boundary — everything is module-private and reaches everything else.
2. **Extreme fan-out at the top.** `tickPawn` (16), `handleIdle` (12) and
   `checkNeedInterrupts` (11) each touch many subsystems in one function, so they
   are hard to reason about, hard to unit-test, and the natural place bugs hide.
3. **It is the convergence point.** 14 outbound module links — more dependencies
   than any service — means almost any change to jobs, pathfinding, stats, or
   needs can ripple into pawn behaviour here.
4. **ADR-008 boundary violation (concrete).** `tryAssignPath`,
   `tryAssignSleepPath` and `handleIdle` call `WasmPathfinderServiceImpl.findPath`
   and `.isReady` **directly** instead of through the `PathfinderService`
   interface. The module already imports the interface too (2 call sites), so it
   straddles the boundary ADR-008 requires it to respect.
5. **Pure helpers trapped in the file.** Several high-fan-in functions are
   stateless predicates/selectors — `isAdjacent` (in 9), `hasAvailableFood`
   (in 6), `findAdjacentApproach`, `selectFoodForMeal` — that don't need to live
   in the AI file and overlap with the existing `game/utils/pawnUtils`.

## Improvement suggestions (prioritised)

**1 — Fix the pathfinding boundary (small, correctness, ADR-008).**
Route `findPath`/`isReady` through `PathfinderService`; delete the direct
`WasmPathfinderService` import. This is a 5-call-site change isolated to
`tryAssignPath` / `tryAssignSleepPath` / `handleIdle` and removes a flagged
architecture violation with no behaviour change.

**2 — Split the 15 handlers into grouped files (largest structural win).**
The handlers cluster cleanly into three domains:
- `handlers/work.ts` — Idle, MovingToResource, Working, Hauling, MovingToDeposit
- `handlers/needs.ts` — Hungry, Tired, Eating, Sleeping, Drinking, Washing, MovingToNeed
- `handlers/combat.ts` — Fighting, Fleeing, Hunting

This turns one 110 KB file into a thin dispatcher plus three ~focused units,
each independently testable. Keep them as plain functions taking `(pawn,
gameState)` so the layered architecture is unchanged.

**3 — Replace the `tickPawn` switch with a handler table.**
A `Record<PawnState, Handler>` lookup drops `tickPawn`'s fan-out from 16 to ~1
and makes adding a state a one-line registration instead of editing a giant
switch. Pairs naturally with #2.

**4 — Extract stateless helpers into `pawnUtils`.**
Move pure predicates/selectors (`isAdjacent`, `hasAvailableFood`,
`findAdjacentApproach`, `selectFoodForMeal`) into `game/utils/pawnUtils` (or a new
`pawnQueries`). They are reused, side-effect-free, and trivially unit-testable
once out of the AI file.

**5 — Thin the orchestrators.**
`handleIdle` (12) and `checkNeedInterrupts` (11) make the "what should this pawn
do next" decision inline. Push selection logic down: job selection into
`JobService`, need-target selection into `PawnService`, leaving the handlers to
*apply* a decision rather than compute it.

**6 — Add per-handler tests.**
There are `jobSim`/`entitySim`/`combatSim` tests but no state-machine handler
tests. After #2 each handler is a small pure-ish function — add focused tests for
the high-risk ones (Working, Hungry, Idle) to lock behaviour before refactoring.

## Suggested sequence

`#1` (boundary fix, safe) → `#4` (extract helpers, mechanical) →
`#2` + `#3` (split handlers + table, the real decomposition) →
`#6` (tests alongside) → `#5` (push decisions into services, deepest change).

Re-run `pnpm graph` after each step: success looks like `tickPawn` fan-out
dropping toward 1, the file splitting into <300-line units, and the
`WasmPathfinderService` edge disappearing from this module's `dependsOn`.
