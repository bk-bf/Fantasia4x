# Hotspot Report — `systems/PawnStateMachine`

> Generated 2026-06-13 via the codebase graph (`tools/codegraph`, `/api`); the
> most interconnected/largest node in the codebase.
> **Updated 2026-06-13** against the now tri-language graph (TS + Svelte + Rust,
> 922 fns / 106 modules / 119 files). Findings below re-verified; the pathfinding
> trace now reaches into Rust, and Svelte coverage confirms the UI layering.

## How it was found

Querying the graph API ranked modules by size and connectivity:

```
/api/modules   → PawnStateMachine: 70 functions (largest), depends on 14 modules
/api/hubs      → its internal predicates (isAdjacent in9) are local hubs
```

`PawnStateMachine` is the **single largest module — 70 functions, ~110 KB in one
file** (`src/lib/game/systems/PawnStateMachine.ts`) — and one of the three most
connected (16 distinct module links). It is the integration point where the
whole simulation converges. The graph now covers Svelte and Rust too, so this is
the largest node across the *entire* project, not just the TS engine.

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
| Used by | 2 (`GameEngineImpl.processPawns`, `stores/gameState`) — **now confirmed**: with Svelte components in the graph, *no UI component calls it*, so it's purely engine-internal (correct layering) |
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
   straddles the boundary ADR-008 requires it to respect. With Rust now in the
   graph this is fully traceable end to end:
   ```
   tryAssignPath  →  WasmPathfinderServiceImpl.findPath  →  find_path  →  reconstruct
   [PawnStateMachine]   [WasmPathfinderService, TS]      [spatial-core, Rust] ──┘
   ```
   `/api/path?from=tryAssignPath&to=reconstruct` (3 hops) shows the pawn AI
   reaching across the WASM boundary into Rust — the exact path that should be
   funnelled through the interface.
5. **Pure helpers trapped in the file.** Several high-fan-in functions are
   stateless predicates/selectors — `isAdjacent` (in 9), `hasAvailableFood`
   (in 6), `findAdjacentApproach`, `selectFoodForMeal` — that don't need to live
   in the AI file and overlap with the existing `utils/pawnUtils`.

## Progress (2026-06-13)

The decomposition has started, in the report's recommended order:

- **✅ Step 1 (boundary fix) DONE.** `PathfinderService` gained `isReady()` and an interface-typed
  `pathfinderService` singleton; `tryAssignPath`/`tryAssignSleepPath`/`handleIdle` route through it
  and the direct `WasmPathfinderService` import is gone. `pnpm graph:check` confirms PawnStateMachine
  is off the ADR-008 list.
- **✅ Step 4 (extract stateless helpers) DONE.** `isAdjacent`, `findAdjacentApproach`,
  `hasAvailableFood`, `selectFoodForMeal`, `consumeMeal` (+ `ITEM_DEF_BY_ID`, `SAFE_HUNGER`) moved to
  **`src/lib/game/systems/pawn/pawnQueries.ts`** (the layer-correct home; `src/lib/utils/pawnUtils.ts`
  is UI-only, so a new engine-side queries module was used instead).
- **✅ Step 6 (handler behaviour-lock tests) DONE.** `systems/pawnHandlers.test.ts` — 8 tests driving
  the public `tick()` pin the deterministic Idle/Working/Hungry branches (149 tests total). Written
  BEFORE the file split so any behaviour drift during the move is caught.
- **✅ Step 3 (dispatch table) DONE.** `tickPawn`'s 15-case switch is now a `Record<PawnState,Handler>`
  lookup (fan-out 16 → ~1; `tickPawn` is 8 LOC). Verified in-place: 0 type errors, 149 tests pass.
- **✅ Step 2 (the file split) DONE.** The 2818-line god-file is decomposed (via a reviewed brace-span
  codemod — exact text relocation, verified against the 149 tests) into:

  | Module | LOC | Contents |
  | ------ | --- | -------- |
  | `systems/PawnStateMachine.ts` | **988** (was 2818) | health/lifecycle (kill/conditions/tend/heal/collapse) + the per-pawn dispatcher + class |
  | `pawn/pawnHelpers.ts` | 1031 | shared orchestration helpers + tuning constants |
  | `pawn/handlers/work.ts` | 383 | Idle · MovingToResource · Working · Hauling · MovingToDeposit |
  | `pawn/handlers/needs.ts` | 377 | Hungry · Tired · Eating · Sleeping · Drinking · Washing · MovingToNeed |
  | `pawn/handlers/combat.ts` | 135 | Fighting · Fleeing · Hunting |
  | `pawn/pawnQueries.ts` | 128 | stateless predicates/selectors (step 4) |
  | `pawn/pawnStates.ts` | 28 | `PAWN_STATE` / `PawnStateName` |

  Acyclic by construction (`pawnStates/pawnQueries ← pawnHelpers ← handlers ← dispatcher`);
  `graph:check` confirms no new cycle. **0 type errors · 149 tests pass · lint clean · build ok.**
- **▶ Follow-ups:** (a) `pawnHelpers.ts` (1031 LOC) is still large — it could split further into
  pathfinding / need-distance / hauling-stage / combat-selection groups. (b) Step 5 (push the
  selection decisions in `handleIdle`/`checkNeedInterrupts` down into `JobService`/`PawnService`)
  remains the deepest, deferred change.

## Improvement suggestions (prioritised)

**1 — Fix the pathfinding boundary (small, correctness, ADR-008). ✅ DONE.**
Route `findPath`/`isReady` through `PathfinderService`; delete the direct
`WasmPathfinderService` import. This is a 5-call-site change isolated to
`tryAssignPath` / `tryAssignSleepPath` / `handleIdle` and removes a flagged
architecture violation with no behaviour change.

**2 — Split the 15 handlers into grouped files (largest structural win). ✅ DONE.**
The handlers cluster cleanly into three domains:
- `pawn/handlers/work.ts` — Idle, MovingToResource, Working, Hauling, MovingToDeposit
- `pawn/handlers/needs.ts` — Hungry, Tired, Eating, Sleeping, Drinking, Washing, MovingToNeed
- `pawn/handlers/combat.ts` — Fighting, Fleeing, Hunting

This turned one 110 KB file into a thin dispatcher (988 LOC, health/lifecycle +
class) plus the focused handler/helper units above. They are plain functions
taking `(pawn, gameState)`, so the layered architecture is unchanged.

**3 — Replace the `tickPawn` switch with a handler table. ✅ DONE.**
A `Record<PawnState, Handler>` lookup drops `tickPawn`'s fan-out from 16 to ~1
and makes adding a state a one-line registration instead of editing a giant
switch. Pairs naturally with #2.

**4 — Extract stateless helpers into `pawnQueries`. ✅ DONE.**
Moved pure predicates/selectors (`isAdjacent`, `hasAvailableFood`,
`findAdjacentApproach`, `selectFoodForMeal`, `consumeMeal`) into a new
`systems/pawn/pawnQueries.ts`. (`src/lib/utils/pawnUtils.ts` was the report's
suggested home but is UI-layer only, so an engine-side module was the correct
landing spot.) They are reused, side-effect-free, and trivially unit-testable
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

~~`#1` (boundary fix, safe)~~ ✅ → ~~`#4` (extract helpers, mechanical)~~ ✅ →
`#6` (handler tests first, to lock behaviour) → `#2` + `#3` (split handlers + table,
the real decomposition) → `#5` (push decisions into services, deepest change).

Re-run `pnpm graph` after each step: success looks like `tickPawn` fan-out
dropping toward 1, the file splitting into <300-line units, and the
`WasmPathfinderService` edge disappearing from this module's `dependsOn`.

## Port-to-Rust? No.

Now that Rust is in the graph it's worth asking. This module is **branchy game
logic** — a state switch fanning into 15 handlers that each call back into TS
services (jobs, stats, needs, combat). It has no hot numeric inner loop; its cost
is *coupling*, not computation. The Rust-shaped work already lives in Rust
(`spatial-core::find_path`, the A* loop). The right move here is **decomposition
in TypeScript**, not a port. Use the graph the other way for porting candidates:
look for TS modules that are leaf-ish (low fan-out into services) and numerically
heavy — e.g. world-gen noise, line-of-sight/visibility, large per-tile passes.
