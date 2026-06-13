<!-- Archived 2026-06-13 from CODEBASE-REVIEW-2026-06-10.md + HOTSPOT-PawnStateMachine-2026-06-13.md.
     Resolution summaries only; pre-fix problem essays live in git history. -->

# Resolved — Codebase Review + PawnStateMachine Decomposition (2026-06-13)

> **Related:** [open review](../../CODEBASE-REVIEW-2026-06-10.md) · [game/DECISIONS](../../game/DECISIONS.md)

The completed half of the 2026-06-13 review pass and the PawnStateMachine hotspot decomposition.
Gate at archival: `check` 0 errors · `test` 153 passing · `lint` 0 · `build` ok.

## Scorecard (snapshot)

| Area | 06-10 | Resolved-to | Notes |
| --- | --- | --- | --- |
| Architecture & layering | B− | A− | `gs.item` seam gone (ADR-016); PawnStateMachine→WASM ADR-008 bypass fixed (P-7). Remaining: 6 other ADR-008 bypasses (EntityService/GameEngineImpl/UI `init`), engine↔store / services↔stores inversions (P-2/P-3) |
| Engine correctness | C− | B+ | All R1–R12 fixed + regression-tested; physical production (reserve-and-fetch, building hauling, passive furnaces) shipped |
| Simulation testing | D | B+ | 32 → 153 tests; cross-system seams (craft→build, draft→health, tool gating, death drops, job registry) covered |
| Tick-loop structure | C+ | C+ | Deferred O(P²) churn (D9.1); passive-production phase added; scale still fine |
| Data-driven design | A− | A | Recipes/wounds/stats/creatures/**jobs (ADR-017)**/condition-drivers all JSONC; tool gating wired |
| Documentation | A | A | ADR discipline; turn order + service table + comments synced (R11) |
| Tooling & CI | C | A− | check/lint/test/build green; ESLint guards determinism + logging in sim core |

## Part I — Defects (R1–R12, all resolved)

- **R1 · CRITICAL — crafted outputs landed in the dead `gs.item` pool.** Resolved (ADR-016): `gs.item` removed; craft output spawns as physical stockpile drops on the station tile; intermediate chains (ceramics/firewood) work. Regression-tested.
- **R2 · HIGH — drafted pawns were exempt from the health sim.** Resolved: `tick()` runs the full health block (tend → conditions → heal → collapse → status durations) for drafted pawns; only the behavioural FSM is skipped. They bleed/heal/collapse/die. Regression-tested.
- **R3 · HIGH — butchery consumed the whole carcass stack for one carcass's yield.** Resolved (ADR-016): butchery is ordinary `butcher_spot` recipes (one carcass/run); dead `processButchery` removed.
- **R4 · MED-HIGH — ADR-009 tool gating enforced nowhere.** Resolved (step 1): `getAvailableJobs` gates harvest on `interaction.toolRequirement` vs colony stock (`_colonyHasHarvestTool`). Bootstrap unblocked (tool-free `stone_outcrop`, station tiers, Crude Workbench, `stone_pick`/`stone_hoe`). Deferred: per-pawn inventory + `minTier` (ADR-009 step 2).
- **R5 · MED — carry budget computed but never enforced.** Resolved: `clampPickupQuantity` caps haul/fetch pickup by weight/volume budget (belt/back bonus matters); floors at 1 so a heavy single item is still hand-carryable.
- **R6 · MED — dead `constructBuilding`/`processBuildingQueue`/`queueBuilding` triad ate materials.** Resolved: placement is physical reserve-and-fetch; the triad + `buildingQueue`/`BuildingInProgress` deleted (ancient-save migration kept).
- **R7 · MED — `isWorking` driven by a dead priority system, 2×/tick.** Resolved: `isWorking` derived from FSM state, `currentWork` from the active job's work category; dead `getAvailableWorkForPawn`/`canPawnDoWorkByType` + the duplicate per-tick call removed.
- **R8 · MED — craft quality stamped only on the first stack.** Resolved (moot): `gs.item` stacking gone; per-stack quality re-attachment to instances deferred until equipment quality matters.
- **R9 · LOW-MED — hunting interrupts bypassed the ADR-010 proximity formula.** Resolved: `handleHunting` runs `checkNeedInterrupts` with `jobDist` = distance to quarry; clears `huntTargetId` on interrupt.
- **R10 · LOW — `killPawn` dropped nothing.** Resolved: drops carried items + tracked instances + equipped gear + a `dynamicName` `<Name>'s Corpse` on the death tile; clears gear off the dead pawn. Regression-tested.
- **R11 · LOW — doc/code mismatches.** Resolved: ARCHITECTURE turn order rewritten to match `processGameTurn`; service table updated; stale drink/wash "deferred" comments corrected. _(Open remainder: the Events phase is still unwired — tracked in the open review.)_
- **R12 · LOW — assorted dead code.** Resolved: deleted light/fuel job helpers, `FATIGUE_PER_SLEEPING_TURN`, the PawnService force-sleep cluster, `calculateCraftingTime`; fixed `findAdjacentApproach` doc drift.

## Part II — Structural debt (resolved subset)

- **P-1 · the `gs.item` legacy pool.** Resolved (ADR-016): `GameState.item` + `currentItem` store gone; all readers migrated to physical stock.
- **P-6 · logging.** Resolved: scoped `no-console` ESLint rule over `src/lib/game/**` (allows `warn`/`error`, exempts `core/log.ts`) enforcing the `gatedConsole` shim.
- **P-7 · ADR-008 boundary — PawnStateMachine reached across the WASM boundary.** Resolved: `PathfinderService` gained `isReady()` + an interface-typed `pathfinderService` singleton; the pawn AI routes through it and the direct `WasmPathfinderService` import is gone. `graph:check` confirms PawnStateMachine is off the ADR-008 list (6 other bypasses remain — tracked in the open review).

## Part IV — Playtest findings (resolved subset)

- **PT-2 · inventory weight showed 0.0.** Resolved: `PawnInventory.svelte` derives load/budget via `itemService.getCurrentCarryLoad`/`getCarryBudget` instead of the dead `weightKg` cache.
- **PT-3 · info-panel bars not reused.** Resolved: the dropped-item hover panel renders through the shared `SelectedEntityCard` (title on top, FRESH/COND below), and its bars use the one reusable `StatBar` (`EntityBar` gained `color`/`valueText`); the private `blockBar` is gone.
- **PT-4 · crafting cards didn't show the workstation.** Resolved: `BuildCard` gained a `station` prop; `CraftingScreen` resolves `recipe.station` → building name via `buildingService.getBuildingById`.

## PawnStateMachine decomposition (the #1 hotspot — done)

The graph ranked `systems/PawnStateMachine.ts` the largest + most-connected node (70 fns, ~110 KB,
`tickPawn` fan-out 16, 15 state handlers). It was a god-module mixing turn dispatch, 15 behaviour
handlers, pathfinding glue, needs/interrupt logic, combat triggers, wound tending, deposit, and food
selection. Decomposed 2026-06-13 in the report's order (boundary fix → extract helpers → behaviour-lock
tests → dispatch table → file split), verified against the test suite at each step:

| Module | LOC | Contents |
| --- | --- | --- |
| `systems/PawnStateMachine.ts` | 988 (was 2818) | health/lifecycle (kill/conditions/tend/heal/collapse) + per-pawn dispatcher + class |
| `pawn/pawnHelpers.ts` | 788 | shared orchestration helpers + tuning constants (movement/finders/needs/hunt) |
| `pawn/pawnHauling.ts` | 258 | ADR-016 reserve-and-fetch deposit pipeline |
| `pawn/handlers/work.ts` | 383 | Idle · MovingToResource · Working · Hauling · MovingToDeposit |
| `pawn/handlers/needs.ts` | 377 | Hungry · Tired · Eating · Sleeping · Drinking · Washing · MovingToNeed |
| `pawn/handlers/combat.ts` | 135 | Fighting · Fleeing · Hunting |
| `pawn/pawnQueries.ts` | 128 | stateless predicates/selectors |
| `pawn/pawnStates.ts` | 28 | `PAWN_STATE` / `PawnStateName` |

- `tickPawn`'s 15-case switch → a `Record<PawnState,Handler>` table (fan-out 16 → ~1; `tickPawn` 8 LOC).
- Acyclic by construction (`pawnStates/pawnQueries ← pawnHelpers ← handlers ← dispatcher`); `graph:check` confirms no new cycle.
- Behaviour locked first by `systems/pawnHandlers.test.ts` (8 tests on the public `tick()`); the move was a reviewed brace-span codemod (exact text relocation), verified against the suite.
- **Port-to-Rust? No.** Branchy game logic (a switch fanning into 15 handlers that call back into TS services), no hot numeric inner loop — its cost was *coupling*, not computation. The Rust-shaped work already lives in Rust (`spatial-core::find_path`). Porting candidates are leaf-ish, numerically-heavy TS (world-gen noise, line-of-sight, large per-tile passes).
- **Open remainder:** Step 5 (push the selection decisions in `handleIdle`/`checkNeedInterrupts` into `JobService`/`PawnService`) — tracked in the open review.

## What's improved since 2026-06-10 (keep doing this)

- **Tests 32 → 153** — headless sim-invariant tests (starvation timing, combat sim, need thresholds) + the physical-production and job-registry seams.
- **Physical production (ADR-016)** — consumption is physical (no `gs.item` pocket); reserve → fetch → consume; passive furnaces; carry budgets + tool gating real.
- **Per-tile storage (Stage 2)** — stored drops as single source of truth, `aggregateFromDrops`, trigger-based absorption, deterministic ids.
- **ADR-014 occupancy** — one collision authority; pathfinding + movement defer to it.
- **ADR-015 single work model** — efficiency-scalar fork gone; speed/yield/quality flow from `stats.jsonc`.
- **Claim hygiene** — `killPawn`, drafted-skip, collapse entry all release claims (D2 leak class closed + tested).
- **Determinism** — zero `Math.random` outside `core/rng.ts`; seed persisted; world/sim streams split.
