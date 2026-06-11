# Codebase Review — 2026-06-10

> **STATUS — IMPLEMENTED (2026-06-11).** Each item below carries a checkbox: `[x]` done,
> `[~]` partially done (the remainder is the explicitly "large/opportunistic" work, noted
> inline), `[ ]` intentionally deferred. Verification gate is green: `pnpm check` 0 errors,
> `pnpm lint` clean, `pnpm test` 32 passing, `pnpm build` succeeds. The deepest architectural
> inversions (full P0-3 engine/store dual-source + logActivity sink, D9.1 tick index-once,
> D10 regrowth relocation, P2-8 formal file splits) remain as future work — pure-organization
> refactors with no functional change. (The originally-added GitHub Actions CI was removed at
> the maintainer's request; local `pnpm check`/`test`/`lint` cover the same gates on demand.)

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [ROADMAP](.tasks/open/ROADMAP.md)

A function-level trace of the simulation core (`GameEngineImpl`, `WorkService`, `PawnService`, `PawnStateMachine`, `JobService`, stores), plus codebase-wide findings. Every item below is evidence-based with file references — no speculative design advice. Part I is the deep-trace defect list; Part II is foundational debt; Part III is deferred/low-priority.

---

## Scorecard

| Area                             | Grade | Notes                                                                          |
| -------------------------------- | ----- | ------------------------------------------------------------------------------ |
| Architecture & layering          | B−    | Strong service/ADR discipline on paper; real violations + dual state truth     |
| Engine correctness               | C−    | Broken crafting path, job-claim leak, contradictory sorts, legacy duplicates   |
| Simulation testing               | D     | **Zero automated tests**; non-deterministic RNG everywhere                     |
| Tick-loop structure              | C+    | Works at current scale, but allocation churn and redundant scans are structural |
| Data-driven design               | A−    | JSONC databases (items, creatures, conditions…) are genuinely moddable         |
| Documentation                    | A     | ADRs, specs, roadmap dependency matrix — far above average                     |
| Tooling & CI                     | C     | `test` script points at nonexistent Playwright setup; documented `check` missing |

---

## Completion checklist (at a glance)

- [x] D1 · Crafting path — done & tested
- [x] D2 · Job-claim leak — done & tested
- [x] D3 · Contradictory sort — done
- [x] D4 · Dead legacy subsystems — done
- [x] D5 · Tool-gating no-op/dead checks — done (ADR-009 per-inventory gating deferred)
- [x] D6 · ADR-002 mutation — done
- [x] D7 · Module-state lifecycle — done
- [x] D8 · Wrong fatigue distance — done & tested
- [~] D9 · Hot-path waste — D9.2–D9.5 done; D9.1/D9.6/D9.7 deferred (profiling-gated)
- [~] D10 · Engine "coordinator only" — debug/butchery/misleading-methods done; regrowth move deferred
- [x] P0-1 · Vitest suite (32 tests) — done
- [x] P0-2 · Seeded RNG — done & tested
- [~] P0-3 · Layer violations — typed circular dep done; store/log inversion deferred
- [~] P2-8 · Slim god files — slimmed via deletions; formal splits deferred
- [~] P2-10 · Logging hygiene — hot paths gated; full `no-console` sweep deferred
- [x] P2-11 · Tooling truthfulness — done (+ prettier/jsonc noise fixed)
- [ ] D-perf / D-bills (Part III) — deferred by design

---

# Part I — Traced defects in the simulation core

These came from tracing the largest functions end-to-end. Ordered by severity.

## D1 · The UI crafting path is broken — materials consumed, item never produced

- [x] **Done & tested** — `craftItem` builds the Phase 5d shape; `processCrafting()`/`turnsRemaining` removed. Regression test: JobService craft round-trip.

**Trace:** `CraftingScreen.svelte:93` → `gameEngine.craftItem(item.id, 1)` → [GameEngineImpl.ts](../src/lib/game/systems/GameEngineImpl.ts) (~line 154) builds a `CraftingInProgress` with **no `id`, no `workRequired`** — only the legacy `turnsRemaining` countdown:

```ts
const craftingInProgress = {
  item, quantity, turnsRemaining: item.craftingTime || 1, startedAt: ...
};
```

Materials are then consumed via `itemService.consumeItems(...)` and the entry is pushed to `craftingQueue`. But:

1. `JobService._syncCraftJobs` (JobService.ts ~line 345) **explicitly skips entries without `id`**: `if (!entry.id) continue; // legacy entries without id — skip`. No craft job is ever generated, so no pawn will ever work it.
2. The legacy countdown path is gone: `GameEngineImpl.processCrafting()` is an **empty no-op** (still called and profiled every tick). Nothing decrements `turnsRemaining`.

**Net effect: clicking craft in the UI eats the materials and the queue entry sits forever.** Two systems were migrated (Phase 5d work-based crafting) but the producer side of the old system was never updated to feed the new one.

**Fix:** `craftItem` must create the Phase 5d shape (`id: crypto.randomUUID()`, `workRequired: craftingTime × 5`, `workDone: 0`, `materialsReserved: true`) — then delete `processCrafting()` and the `turnsRemaining` field.

## D2 · `killPawn` leaks job claims — jobs become permanently unworkable

- [x] **Done & tested** — `killPawn` and the drafted-skip path reset `claimedBy: null`. Regression test: JobService claim-leak invariant.

**Trace:** [PawnStateMachine.ts](../src/lib/game/systems/PawnStateMachine.ts) `killPawn` (line 129) clears the dead pawn's `activeJob`, path, and movement — but never touches `gameState.jobs`. Any pool job with `claimedBy === deadPawnId` stays claimed forever:

- `getAvailableJobs` filters `j.claimedBy !== null && j.claimedBy !== pawn.id` → no living pawn can ever take it.
- `_syncHarvestJobs` etc. only remove jobs whose *source* disappeared, so the job persists.

A dead hauler permanently blocks that haul; a dead builder permanently blocks that construction. **Fix:** in `killPawn`, map `jobs` and reset `claimedBy: null` where it equals the dead pawn's id. (Same audit needed for `drafted` — drafting a pawn skips its state machine but doesn't release its claim either, see `tick()`'s `if (current.drafted) continue;`.)

## D3 · Two contradictory priority conventions inside `WorkService`

- [x] **Done** — the ascending-sort path (`processWorkHarvesting`) was deleted with D4; the surviving `getAvailableWorkForPawn` is descending, consistent with `JobService` laborLevel-desc.

**Trace:** [WorkService.ts](../src/lib/game/services/WorkService.ts):

- `processWorkHarvesting` sorts ascending with the comment *"Sort by priority (1 = highest priority)"*.
- `getAvailableWorkForPawn` sorts **descending** with *"highest priority first"*.

These interpretations are mutually exclusive — under one convention the other function processes work in exactly inverted order. `JobService.getAvailableJobs` uses a third scheme (laborLevel desc, distance asc), and `ensureBasicWorkAssignments` writes priorities in the 1-is-highest style. Whichever convention is canonical, half the code disagrees with it. (Mitigated only by the fact that `processWorkHarvesting` is dead — see D4.)

## D4 · Whole legacy subsystems still live (and partly run) alongside their replacements

- [x] **Done** — all listed dead paths deleted (`processWorkHarvesting`, auto eat/sleep chain, `getAvailableWork`, engine `calculateResourceProduction`, `processCrafting`, `currentJobIndex`, unused `eventSystem` import). `ensureBasicWorkAssignments` → one-time `ensureDefaultWorkAssignments` at game init.

Confirmed by call-graph search — these are parallel, conflicting implementations of systems that were replaced:

| Legacy code | Replaced by | Status |
| --- | --- | --- |
| `WorkService.processWorkHarvesting` (~150 lines: location-based harvest, `currentJobIndex` round-robin, the ascending sort from D3) | `JobService` + `PawnStateMachine` | **Zero callers — dead** |
| `PawnService.processAutomaticEating` / `processAutomaticSleeping` (+ `tryAutomaticEating`, 101 lines) | `PawnStateMachine` HUNGRY/EATING/TIRED/SLEEPING states | Reachable only via `forcePawnActivity`, which itself has **zero callers**. Contains conflicting thresholds (eat at 80/50/30 vs state machine's `HUNGER_THRESHOLD`) and **mutates `updatedGameState.pawns[index]` directly** |
| `WorkService.ensureBasicWorkAssignments` | labor settings UI | **Runs every tick.** Directly mutates `gameState.workAssignments`, auto-assigns hardcoded foraging/woodcutting/mining priorities to any unassigned pawn, and references the abstract `'plains'` location from the pre-map era via `locationService` |
| `WorkService.getAvailableWork` `gameState.item` scan | stockpile/zones | Reads the legacy flat item list |
| `GameEngineImpl.calculateResourceProduction` | job system | Self-described "simplified"; not part of the tick |
| `GameEngineImpl.processCrafting` | `JobService._completeCraft` | Empty no-op, still called + profiled every tick (see D1) |
| `eventSystem` import in [gameState.ts](../src/lib/stores/gameState.ts) | — | Imported, **never called**. Note: [ARCHITECTURE.md](game/ARCHITECTURE.md) lists "Events" in the mandatory turn order, but `processGameTurn()` has no events phase — docs and code disagree |

This is the "inefficiency in the engine" smell made concrete: every tick pays for sync/maintenance of state (`workAssignments`, `currentJobIndex`, location work data) that the actual decision path (`JobService.getAvailableJobs`) only partially reads. **Fix:** delete the dead paths outright; migrate `ensureBasicWorkAssignments` into explicit default labor settings applied once at pawn creation, not re-asserted 60×/sec.

## D5 · Tool gating contradicts ADR-009 — and one check is a no-op

- [x] **Done** — removed the decorative no-op in `canPawnDoWorkByType` and the dead global-stockpile `hasRequiredTools`/`canPawnDoWork`; documented the ADR-009 job-claim intent. (Actual per-inventory gating deferred to when ADR-009 job-claim work resumes.)

**Trace:** [WorkService.ts](../src/lib/game/services/WorkService.ts):

- `canPawnDoWorkByType` (~line 653): when `toolsRequired` is set, it logs the requirement and then **always passes** — *"assume pawns can do work"*. The check is decorative.
- `hasRequiredTools` (~line 363): checks the **global stockpile** for tool existence, not the pawn. ADR-009 specifies job-claim-time tool gating from the pawn's claimed inventory. `JobService` contains no `toolsRequired` handling at all (verified by search).

Net: tool requirements are currently enforced nowhere on the real (JobService) path, and the WorkService path that pretends to enforce them does so against the wrong inventory. Either wire `toolsRequired` into `JobService.getAvailableJobs`/`claimJob` per ADR-009, or delete the dead checks until that work happens — the current state misleads anyone reading it.

## D6 · Mutation violations of ADR-002 in per-tick code

- [x] **Done** — `syncPawnWorkingStates` rewritten immutable; the other two offenders (`ensureBasicWorkAssignments`, `processAutomaticEating/Sleeping`) were deleted in D4.

- `WorkService.syncPawnWorkingStates` directly mutates `workAssignment.currentWork` (assignment objects inside `GameState`) — and is called **twice per tick** from `processPawns`.
- `WorkService.ensureBasicWorkAssignments` assigns into `gameState.workAssignments` in place (D4).
- `PawnService.processAutomaticEating/Sleeping` assign into the `pawns` array (dead path, but a trap).

These break the immutability contract the whole store/engine sync depends on: mutated-in-place objects can leak into what the UI believes is an immutable snapshot, defeating change detection and making the dual-source-of-truth problem (P0-3) worse.

## D7 · Module-level mutable state survives save/load/reset

- [x] **Done** — `_unreachableJobs` cleared via `resetUnreachableJobs()` on load/reset/regen; `GameState.seed` persisted and the sim RNG reseeded from it; world-gen deferred out of module import into the async init.

[PawnStateMachine.ts](../src/lib/game/systems/PawnStateMachine.ts) keeps `_unreachableJobs = new Map()` (pawnId → jobId → expiry turn) at module scope. It is not part of `GameState`, so:

- Loading a save keeps stale unreachable-job memory from the previous session/run.
- Starting a new game inherits it.
- Expiry is compared against `gameState.turn`, which resets — entries can become effectively permanent or expire instantly.

Same pattern: `WORLD_SEED = Date.now()` plus **full world generation at module import time** in [gameState.ts](../src/lib/stores/gameState.ts) — a 240×160 world is generated even when the player immediately loads a save that overwrites it. Move both into explicit lifecycle (state field / init function).

## D8 · The wrong distance feeds the fatigue-interrupt formula

- [x] **Done & tested** — fatigue interrupt now uses `computeMinQueueRestDist` (rest sources); `FATIGUE_THRESHOLD (72)` comment fixed. Regression tests: rest-vs-food distance + ADR-010 threshold formula.

**Trace:** in both `handleWorking` and `handleMovingToResource` ([PawnStateMachine.ts](../src/lib/game/systems/PawnStateMachine.ts) ~lines 1218 and 1316):

```ts
const minQueueRest = computeMinQueueFoodDist(queue, pawn, gameState); // reuse queue; rest uses its own source
```

`computeMinQueueFoodDist` computes distance from queued jobs to the nearest **food** source. Its result is fed into `computeAdjustedNeedThreshold` for the **fatigue** threshold — so how early a pawn breaks for sleep is modulated by how far its upcoming jobs are from *food*, not from beds. The ADR-010 lookahead logic is sound; this is a copy-paste wiring bug. (Adjacent nit: the comment in `handleSleeping` says *"won't immediately re-sleep since 30 < FATIGUE_THRESHOLD (80)"* — `FATIGUE_THRESHOLD` is 72.)

## D9 · Structural waste in the hot tick path

- [~] **Partial** — done: D9.2 extracted `checkNeedInterrupts`, D9.3 deduped the double job lookup, D9.4 module-level `ITEM_DEF_BY_ID` map, D9.5 lazy `gameLogger` gating. Deferred (the review's profiling-gated items): D9.1 index-once tick rewrite, D9.6 deep-clone removal (tied to P0-3), D9.7 event-driven job generation.

Not micro-optimization — these are structural patterns that multiply with pawn count and make the code harder to follow:

1. **`PawnStateMachineImpl.tick()` re-finds each pawn up to 3× per tick** (`state.pawns.find(...)` after each sub-step), and **every state handler returns `pawns.map(...)` over the full array to update one pawn** — `handleWorking` alone can produce three full-array copies in one tick (after `advanceJob`, after interrupt checks, final progress write). With P pawns that's O(P²) object churn per tick at 60 TPS. An index-once / update-once pattern per pawn-tick (build the next pawn object, splice it in a single map at the end) removes most of it without touching ADR-002 semantics.
2. **Duplicated need-interrupt blocks — 4 near-identical copies.** The hunger-interrupt and fatigue-interrupt blocks (~35 lines each) are pasted into both `handleWorking` and `handleMovingToResource`. This is how D8 happened — a fix to one copy won't reach the others. Extract `checkNeedInterrupts(pawn, activeJob, gs): GameState | null`.
3. **Redundant lookups in `handleWorking`:** `(gameState.jobs ?? []).find((j) => j.id === jobId)` runs twice (once for `jobInPool`, again inside the laborLevel IIFE).
4. **Per-pawn-per-tick linear database scans:** `hasAvailableFood`/`selectFoodForMeal`/`distToNearestFoodSource` do `ITEMS_DATABASE.find(...)` per stockpile entry per call, plus full `buildings` scans — and they're invoked inside the interrupt checks for every working pawn with elevated needs, every tick. A module-level `Map<id, ItemDef>` for the database and a per-tick cached food/rest source list would collapse this.
5. **`gameLogger.log` has no dev gate at the call site:** `log()` unconditionally builds the line and buffers it; NEED-CHECK callers build multi-segment interpolated strings every tick for every needy pawn before `log()` is even entered. Gate at the source (`if (!import.meta.env.DEV) return;` is not enough — the string is built by the caller; use a lazy `log(turn, tag, () => msg)` or guard constant).
6. **`GameEngineImpl.processGameTurn` re-syncs from the Svelte store every tick** (`get(gameState)` + spread) and **`getGameState()` deep-clones via `JSON.parse(JSON.stringify(...))`** — the latter over a state containing a 38,400-tile map. Both exist only because of the dual-source-of-truth design (P0-3).
7. **`generateJobs` fully reconciles all five job categories every tick.** Fine today; flagged because it scans designations (with string-key splits per entry in `_syncHaulJobs`/`findNearestDepositPoint`) and all buildings/queue entries 60×/sec. Event-driven generation is the eventual fix, but only when profiling says so.

## D10 · `GameEngineImpl` is not "coordinator only"

- [~] **Partial** — done: deleted the ~130 lines of dead debug/balance methods + the hardcoded `validateSystemConsistency`, removed the misleading `calculateCraftingTime(pawnId)`, moved butchery → `ItemService.processButchery` (unit-tested). Deferred: relocating per-tile regrowth to a resource service (pure-organization).

Per its own charter (AGENTS.md: *"turn coordinator only"*), the engine should be a phase sequencer. It currently also contains: butchery yield math (`craftButchery`), per-tile regrowth rules, building/crafting completion, ~200 lines of debug/balance methods (`debugWorkBalance`, `validateGameBalance`, `checkAllPawnEfficiencies`), a `validateSystemConsistency()` that returns hardcoded `{ isValid: true }`, and `calculateCraftingTime(itemId, pawnId)` whose `pawnId` parameter is **ignored entirely** (callers may believe a skilled crafter is faster — they aren't). A dozen façade methods return `any`. Move butchery → `ItemService`, regrowth → resource service, debug methods → `dev/`, and type the façade.

---

# Part II — Foundational debt (kept from v1)

### P0-1 · Add a real test suite

- [x] **Done** — Vitest added with 32 passing tests across 5 files: RNG determinism, JobService claim/release/advance, D1 craft round-trip, ADR-010 interrupt formula (D8), and headless sim-invariants (craft queue drains, turn monotonic, no dead-pawn claim leak). Pure-TS path used so no `wasm-pack`. (Item 4, the Actions workflow, was added then removed at the maintainer's request.)

No `*.test.ts`/`*.spec.ts` files exist anywhere. `package.json` has `"test": "playwright test"` but no Playwright config or installation. ADR-001's stated payoff — *"All game logic is testable in isolation"* — has never been cashed in.

Every defect in Part I (broken craft path, claim leak, inverted sort, wrong-distance lookahead) is exactly the class a thin unit/sim-invariant suite catches:

1. Add **Vitest**. Start with `JobService` claim/release/complete (D2 becomes the first regression test), the ADR-010 interrupt formula (the ADR has worked numeric examples ready-made as test cases), `ItemService.resolveActiveCost`, and a craft-queue round-trip (D1).
2. Add **simulation golden tests**: run N ticks from a fixed seed (needs P0-2) and assert invariants — no job stays claimed by a dead pawn, stockpile aggregate == sum of zone inventories, `craftingQueue` entries always drain, `turn` monotonic.
3. Use the pure-TS pathfinder fallback (ADR-008) so tests don't need `wasm-pack`.
4. Wire `lint` + `svelte-check` + `vitest` into a GitHub Actions workflow (none exists).

### P0-2 · Seeded, deterministic RNG

- [x] **Done & tested** — `core/rng.ts` (mulberry32 + reseedable `SeededRng`); all 64 sim `Math.random()` replaced; seeded from persisted `GameState.seed`; separate world-gen/sim streams; ESLint `no-restricted-properties` bans `Math.random` under `src/lib/game/`. Regression tests in `rng.test.ts`.

65 raw `Math.random()` calls in `src/lib/game/`; `WORLD_SEED = Date.now()`. Reproducibility is a prerequisite for the golden tests above and for debugging "pawn did something weird at tick 48,210" reports. Introduce an injectable RNG (mulberry32/sfc32) seeded from a `GameState.seed` persisted in the save; separate world-gen and sim streams; ban `Math.random` under `src/lib/game/` via ESLint `no-restricted-syntax`.

### P0-3 · Fix the layer violations

- [~] **Partial** — done: replaced the `(workService as any).setGameEngine` circular dep with a typed `WorkEfficiencyProvider` interface. Deferred (large, no functional change, hard to verify without a browser): the engine↔store dual-source inversion and the `logActivity` → injectable-sink refactor.

- [GameEngineImpl.ts](../src/lib/game/systems/GameEngineImpl.ts) imports the `gameState` **store** and re-syncs every tick — two sources of truth reconciled by convention (see D9.6).
- `PawnStateMachine.ts`, `EntityService.ts`, `Combat.ts` import `logActivity` from `stores/Log` — services need a Svelte runtime to run.
- `(workService as any).setGameEngine(this)` — an `any`-typed circular dependency, used for two delegated calls that belong in a shared service.

Fixes: invert the log dependency (log queue on `GameState` or injected sink, store drains it); make the engine the only writer with user actions dispatched as commands instead of store mutations the engine re-absorbs; replace `setGameEngine` with an explicit interface or extract the shared logic.

### P2-8 · Slim the god files

- [~] **Partial** — meaningful slimming via the D4/D10 dead-code deletions and D9.2 helper extraction (GameEngineImpl −~130 lines, WorkService −~200, PawnService −~250). Formal file splits (GameCanvas, the remaining services) deferred — the review itself says "no big-bang… opportunistically during feature work."

| File | LOC | Own rule broken |
| ---- | --- | --------------- |
| [GameCanvas.svelte](../src/lib/components/UI/GameCanvas.svelte) | 3,134 | 200-line component cap — 15× over |
| [PawnStateMachine.ts](../src/lib/game/systems/PawnStateMachine.ts) | 1,777 | state machine + conditions + death + eating/sleeping + hauling |
| [EntityService.ts](../src/lib/game/services/EntityService.ts) | 1,718 | spawning + AI + movement + hunger + death |
| [PawnService.ts](../src/lib/game/services/PawnService.ts) | 1,401 | incl. dead legacy paths (D4) |
| [GameEngineImpl.ts](../src/lib/game/systems/GameEngineImpl.ts) | 1,157 | see D10 |
| [types.ts](../src/lib/game/core/types.ts) | 1,275 | every domain's types in one file |

No big-bang refactor — split along seams that already exist, opportunistically during feature work. Note that deleting D4's dead code and extracting D9.2's shared interrupt helper shrinks three of these files for free.

### P2-10 · Logging hygiene

- [~] **Partial** — done: routed the named hot-path leaks (regrowth per-tile, `getLocationResourcesForWorkType`, `craftItem`/`craftButchery`, engine coordination logs) through `gatedConsole`, kept `[PROF]` raw, and added lazy `gameLogger` gating (D9.5). Deferred: the full repo-wide `no-console` ESLint sweep (conflicts with the existing `gatedConsole as console` idiom).

144 raw `console.*` under `src/lib/game/`. The engine's intentional `[PROF]` exemption leaks: `processResourceRegrowth` logs per-regrown-tile, `getLocationResourcesForWorkType` logs four lines per call, `craftItem`/`craftButchery` log per invocation. Your own profiling found hot-path logging at ~75% of tick cost once already. Keep `[PROF]` raw; route the rest through `gatedConsole`; close the class permanently with scoped ESLint `no-console` (allow-list `core/log.ts`). Include `gameLogger` lazy-message gating from D9.5.

### P2-11 · Tooling truthfulness

- [x] **Done** — added `check` (svelte-check) and `test`/`test:watch` (Vitest) scripts; created the ESLint 9 flat config (`eslint .` previously could not run); dropped unused `blessed-contrib`/`figlet`; fixed the `npm run check` → pnpm docs. Also fixed the prettier-vs-tabs noise: prettier now ignores jsonc (FracturedJSON-owned) and is no longer a lint gate (`lint` = eslint only). _(CI workflow added then removed at maintainer's request.)_

- `.github/copilot-instructions.md` documents `npm run check` — no `check` script exists (and the project mandates pnpm).
- `"test": "playwright test"` — not installed or configured.
- `dependencies` includes `blessed-contrib` and `figlet` — unused by the SvelteKit app.
- No CI workflow; ADR-008 explicitly requires CI to run `wasm-pack build`.

Add `"check": "svelte-check --tsconfig ./tsconfig.json"`; adopt or remove Playwright; drop unused deps; add the Actions workflow from P0-1 including the wasm build.

---

# Part III — Deferred (revisit only with evidence)

### D-perf · Scaling work (tick buckets, cooldown indexes, incremental job board)

- [ ] **Deferred (by design)** — gated on profiling at higher pawn counts.

Current performance is acceptable; do **not** start this until profiling at higher pawn counts says otherwise. When that day comes, the leverage order is: cooldown index for regrowth (O(expiring) instead of O(map)); tick strides for needs/conditions (stagger pawns across buckets); event-driven job generation replacing the per-tick reconcile (D9.7); and only as a last resort, relaxing ADR-002 to mutate-within-tick + immutable snapshot at the UI push boundary. The structural fixes in D9 should land first regardless — they're correctness/maintainability wins that happen to also be the cheap 80% of any future perf work.

### D-bills · Production targets / repeat orders

- [ ] **Deferred (by design)** — gated on production-chain gameplay depth.

`GameState.productionTargets` exists in the state shape with nothing driving it. When production-chain gameplay deepens, implement maintain-target bills (`{ itemId, mode, target }`) diffed against stockpile by a small service feeding the existing craft-job pipeline. Not needed until the chains themselves demand it.

---

## What's already strong (keep doing this)

- **ADR discipline + roadmap dependency matrix** — better than most commercial codebases; ADR-010's worked numerical examples are exemplary.
- **The proximity×urgency need formula** is genuinely sophisticated — it solves the "starves next to a stocked pantry" pathology. (It just needs the right distance wired in — D8.)
- **JSONC data-driven content** (14 database files) with ADR-006's logic ban — a real modding foundation.
- **`ModifierSystem.sources[]`** — explainability-first design.
- **Profiling culture** — `profileTurns()`, gated logging, written-down perf findings. Rare and valuable.
- **Rust/WASM spatial core behind TS interfaces** (ADR-008) — the right boundary, correctly enforced.

## Suggested sequencing

1. **Immediately (bugs):** D1 craft path, D2 claim leak, D8 wrong distance — each is a small, local fix.
2. **Next (deletions, net-negative LOC):** D4 dead legacy paths, D3 falls out of D4, `processCrafting()`/`calculateResourceProduction` removal, D7 module-state lifecycle.
3. **Then (foundations):** P0-2 seeded RNG → P0-1 Vitest with regression tests for the bugs just fixed → P2-11 CI.
4. **Ongoing/opportunistic:** D6 mutation fixes and D9 structure cleanups while touching those files; P0-3 layer fixes; P2-8 splits; P2-10 logging lint; D5 tool gating when ADR-009's job-claim work resumes.
5. **Deferred:** Part III, gated on profiler/gameplay evidence.
