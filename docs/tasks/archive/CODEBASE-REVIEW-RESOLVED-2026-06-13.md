<!-- Archived 2026-06-13 from CODEBASE-REVIEW-2026-06-10.md + HOTSPOT-PawnStateMachine-2026-06-13.md.
     Resolution summaries only; pre-fix problem essays live in git history. -->

# Resolved — Codebase Review + PawnStateMachine Decomposition (2026-06-13)

> **Related:** [open review](../../CODEBASE-REVIEW-2026-06-10.md) · [game/DECISIONS](../../game/DECISIONS.md)

The completed half of the 2026-06-13 review pass and the PawnStateMachine hotspot decomposition,
**plus the 2026-06-14/16 second wave** (P-2/P-2b/P-3/P-4b, the done P-4 god-file splits, INV-1/LIGHT-1/
FLEE-1/MOVE-1, P-5 and the tick-cost items resolved by the ENGINE-PERFORMANCE arc) — moved here
2026-06-16. The Tier 0 combat/death/hauling slice (NT-1..4 + PT-1 + NT-U1..4) is in the open tracker's
own "DONE" sections. Gate at the 06-16 archival: `check` 0 · `test` 246 · `lint` 0 · `build` ok.

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

## 2026-06-14/16 pass — resolved (moved from the open tracker 2026-06-16)

The second wave of the review, shipped alongside the ENGINE-PERFORMANCE arc. Gate at archival:
`check` 0 · `test` 246 · `lint` 0 · `build` ok.

### Structural debt (P-2 / P-2b / P-3 / P-4b)

- **P-2 · Engine↔store dual source of truth.** Resolved. `processGameTurn`'s `this.gameState = {...get(gameState)}`
  read-back + `JSON.parse(JSON.stringify())` deep-clone per tick is gone; the engine is the sole writer and user
  actions are commands (`applyCommand`). This unblocked the worker cutover (ENGINE-PERFORMANCE §4) — the deep-clone
  removal (old D9.6) fell out of it.
- **P-3 · Services importing Svelte stores.** Done 2026-06-14. New `core/logSink.ts` (`SimLogSink` interface +
  live-binding `simLog` singleton, no-op default); `stores/simLogBridge.ts` registers an impl delegating to
  `Log`/`combatFeedback`, wired via side-effect import from `gameState.ts`. `Combat`, `EntityService`, and the pawn
  state machine emit through `simLog.*`. `CombatTextKind` moved to `core/logSink`. Headless sims/tests get the no-op
  sink. Graph layer-violation warnings 24→20.
- **P-2b · `GameEngineImpl` god-module → UI-coordination facade.** Done 2026-06-14. Engine 43→23 methods. Most of
  the coordination cluster was **dead** (zero callers) and deleted from class + interface; the three used methods
  (`getItemById`/`getBuildingById`/`craftItem`) moved to a new `systems/GameCoordinator.ts` singleton (writes route
  through `applyCommand`). Call sites repointed to `gameCoordinator`. _Codegraph follow-up:_ the dead methods were
  not flagged by the `orphan` rule (it skips class methods to avoid polymorphism false-positives); only `god-module`
  pointed here. A future rule could flag methods whose sole reference is the interface declaration.
- **P-4b · PawnStateMachine Step 5 — push selection into services.** Done 2026-06-14. **Job selection** →
  `JobService.selectJobForPawn(pawn, gs, { isReachable, queueSize })` (the unreachable-job memory is *injected* so
  JobService stays free of FSM state). **Need selection** → new `systems/pawn/needSelection.ts` (`selectIdleNeed`,
  `selectInterruptNeed`, `applyNeed`, `checkNeedInterrupts`). `handleIdle` now only *applies* decisions.
  Behaviour-identical. Need-selection lives in the pawn system (not PawnService) to avoid a services→systems back-edge.

### P-4 god-file splits (the done rows)

- **`core/types.ts` 1,478 → 16.** Split into `core/types/` domain modules (`world`/`race`/`health`/`items`/
  `buildings`/`jobs`/`entities`/`research`/`gamestate`); `types.ts` is a `export *` barrel — zero call-site churn.
- **`systems/Combat.ts` 1,499 → 932.** `BODY_PART_DEFS` table + helpers moved to `core/BodyParts.ts` (569 LOC);
  Combat re-exports `PART_DEF_MAP`/`createDefaultBodyParts`. (Optional `combatMath.ts` lift deferred.)
- **`services/EntityService.ts` 2,022 → 56.** Decomposed into an `entity/` dir of free-function modules
  (`entityConstants`/`entityHelpers`/`entitySpawning`/`entityAI`/`entityLifecycle`), mirroring `pawn/*`.
  EntityService is now a 56-line facade.
- **`services/JobService.ts` (fuel rules).** Refuel rules extracted to `services/fuelRules.ts` (free functions;
  went there rather than BuildingService, already at the 40-fn god-module limit). _Open remainder:_ the per-job-type
  handler split into `services/jobs/<type>.ts` (ADR-017 registry) — still in the open tracker under P-4.

### Latent defects (INV-1 / LIGHT-1 / FLEE-1 / MOVE-1)

- **INV-1 · `inventory.items` overloaded: haul-carry vs equip pool.** Done 2026-06-14. The equip screen
  (`PawnEquipment.svelte`) now derives its Available Items pool reactively from `$gameState.stockpile` minus
  `equippedItemCounts($gameState.pawns)` — never written into `inventory.items`. The two `sync*` functions +
  `getAllEquippedItemIds` deleted. `inventory.items` is now strictly the pawn's carried haul goods, so the carry
  readout/clamp are correct after the equip screen is opened.
- **LIGHT-1 · §G light→work-speed inert (`tile.lightLevel` never written).** Done 2026-06-14. `pawn/handlers/work.ts`
  computes the working pawn's tile light on the spot via `computeTileLightLevel(turn, buildings, x, y)` (no map scan)
  → `lightWorkMultiplier`. Per-job opt-out `JobDef.lightAffected` (default true; false for carry jobs). Dead
  `WorldTile.lightLevel` field removed. Tests `lightWorkWiring.test.ts`.
- **FLEE-1 · Cornered-flee ping-pong / stuck-in-corner.** Done 2026-06-14. New `entityHelpers.fleeToSafety` flees to
  a **distant A\*** destination (~half map away in the MIN-distance-maximising direction), **locked** on
  `mob.fleeDest` so it doesn't yoyo between two near-tied headings; `SAFE_RESET_TICKS` give-up fires only when
  cornered. Both `Fleeing` cases call it. Tests `entity/fleeFromThreats.test.ts`; `game/BUGS.md` [FIXED].
- **MOVE-1 · Duplicated per-tick move pass → shared `stepBody`.** Done 2026-06-14. `MovementSystem.ts` now owns
  `stepBody`/`seedMidCrossClaims`/the single `MAX_BLOCKED_TICKS`; both `PawnService.processMovement` and the mob pass
  are thin wrappers. Pawns *gained* the mid-cross convergence guard for free; both preserve `nextCellCostLeft` (the
  hunt-yoyo regression class). Test `systems/movementPass.test.ts`.

### P-5 + carried-forward tick-cost items — resolved by the ENGINE-PERFORMANCE arc

- **P-5 · Per-tick allocation churn.** Resolved/superseded by [ENGINE-PERFORMANCE](../open/ENGINE-PERFORMANCE.md).
  The profiling (instrumented 2026-06-14) showed the named suspects (`findCombatThreat`/`blockedTiles`/
  `findNearestRestBuilding`) were *not* the hot spots — `entityStep`, `resourceRegrowth`, and the worker→main
  snapshot were. All addressed there: de-immutabling the hot phases (M1–M5), the worker decouple + slim snapshot
  (W2/W2b), pawn-id index Map, `_syncHarvestJobs` Set dedup, `nearestPawn` iterator removal. **Result: the heavy
  stress case 30 → 200+ TPS @4×.** The one remaining sliver — a heavy spatial index for `nearestPawn` — is
  deliberately deferred to the fog-of-war/LoS work that will build that index anyway (ENGINE-PERFORMANCE §C).
- **D9.1 / D9.6 · index-once tick + deep-clone removal.** Resolved. `core/pawnIndex.ts` memoises a `Map<id,Pawn>` on
  the pawns-array ref (O(n) build serves hundreds of O(1) gets); the per-tick `JSON.parse(JSON.stringify())`
  deep-clone is gone with P-2 + the worker snapshot protocol.
- **D-perf · cooldown index for regrowth.** Resolved (ENGINE-PERFORMANCE §C). `processResourceRegrowth` mutates
  expired tiles in place + ships a `worldMapDelta` (`core/tileDeltas.ts`) instead of rebuilding/re-sending the whole
  38k-tile worldMap every tick — the fix for the active-harvest TPS collapse. (_Open remainder:_ tick strides /
  incremental job board stay in the open tracker.)

### Tier 0 — broken-loop bugs (NT-1..4 / PT-1) + UI polish (NT-U1..4), shipped 2026-06-14

Sourced from playtest + `game/NOTES.md`; made the existing combat/survival/production slice visibly broken.

- **NT-1 · Trait cards leaked `Efficiency: [object Object]`.** `PawnTraits`/`RaceScreen` now handle any
  object-valued effect generically via a shared `workAxisLabel(key)`; `formatEffectValue` formats objects as a `%`
  list. (Root cause: only the literal `workSpeed/workYield/workQuality` keys were special-cased; legacy
  `workEfficiency` maps fell through.)
- **NT-2 · Death not finalised — pawn lingered in UI.** New `reapDeadPawns(state)` end-of-turn reaper (in
  `processGameTurn` after combat) finalises any un-flagged dead pawn (`corpseDropped`) and **removes dead pawns from
  `pawns[]`** so they leave every UI list. `PawnScreen` falls back to the first living pawn. Tests `deathDrops.test.ts`.
- **NT-3 · Combat + infection too fast.** `BASE_ATTACK_INTERVAL_TICKS` 30→60 (floor 18→36) halves attack speed;
  `infectionRiskPerWound` 0.0012→0.0004 + a new `infectionRiskMaxPerTick` 0.0008 cap so stacked wounds can't go
  near-instantly lethal. _(Follow-up hit-accuracy rebalance is in the open tracker's NT backlog.)_
- **NT-4 · Drafted pawn auto-engages adjacent hostile.** Decision: auto-attack. A drafted pawn with no explicit
  `attack` order swings at the nearest adjacent hostile. Test `combatSim.test.ts`.
- **PT-1 · Hauling deposited short ("hang").** `findNearestDepositPoint` returns the nearest **standable** tile
  (walkable + unoccupied) instead of nearest-by-distance; falls back to deposit-in-place only when nothing in the
  tier is standable. Tests `pawn/depositPoint.test.ts`.
- **NT-U1..U4 · Info-panel polish.** Toggleable health panel (damaged limbs/wounds only); info-panel buttons moved
  adjacent + outside the panel; fixed-width panel skeleton so long descriptions wrap (unified width across object
  types); draft target line draws while paused.

## 2026-06-16 pass — playtest N-items + carried-forward + physical-production follow-ups (moved here 2026-06-16)

Shipped after the ENGINE-PERFORMANCE arc. Gate at archival: `check` 0 · `test` 264. **N-1 (can't place
buildings under `--profiler`) stays open** in the tracker — the rest of the playtest + deferred backlog closed.

### Playtest findings (N-2 / N-3 / N-4 / N-5)

- **N-2 · Stamina regen too fast.** Resolved. Regen now runs through `perTick(stamina_recovery_rate)` so the
  per-second rate is divided across the 60 ticks/s — stamina is a real pressure again instead of effectively infinite.
- **N-3 · Exhaustion decoupled from stamina (all entities).** Resolved. Exhaustion is now a pure function of the
  stamina value in one shared place (`Combat.tickStaminaAndWinded`), reusing the shared **`winded`** status for pawns
  *and* mobs — chickens no longer sit "exhausted" at full stamina.
- **N-4 · Haul one-item-per-trip.** Resolved via **source-tile top-up**: a hauling pawn fills its weight/volume budget
  from the source tile before walking to the stockpile, instead of grabbing a single item per round trip.
  (`clampPickupQuantity` already capped by budget; the gap was the multi-item pickup loop.)
- **N-5 · Idle↔MovingToResource jank after drag-placing blueprints.** Resolved 2026-06-16 — a latent
  **duplicate-drop-id** bug, not a perf regression. `reserveForOrder` keyed reserved stacks on
  `${d.id}-resv-${orderId.slice(-6)}`, and `slice(-6)` is the placement-timestamp tail shared by every building in one
  drag batch → all their reserved stacks collided on one id; `_syncFetchJobs`'s `find(d => d.id === …)` matched a
  sibling's stack, culled the valid fetch job, re-minted it with a fresh id, dangled the pawn's claim → Idle → re-claim
  → repeat. Fix: (1) reservation ids use the full `orderId`; (2) fetch filter + dedup match on **id AND
  `reservedFor`/owner** (self-heals collided saves); (3) **deterministic job ids** (`fetch-${drop.id}-${ownerId}`,
  dropped the `-${Date.now()}` from construct/craft/deconstruct/refuel). Verified live via CDP state dump.

### Carried-forward deferred (D9.7 / ADR-009 step 2 / R11)

- **D9.7 · Event-driven job generation → throttled reconcile (ADR-022).** Resolved. A true event-driven rewrite isn't
  worth it: the per-tick `generateJobs` is already emission-derived and self-healing (rebuilds the board from current
  sources each pass — a gone source just stops producing a job). **Resolution: throttle the rebuild to every 6 ticks**
  (`JOB_GENERATION_INTERVAL_TICKS`); claim/advance/complete still run every tick. Board-appearance latency ≤6 ticks
  (~0.1 in-game-sec), scan cost ~1/6. See [ADR-022](../../game/DECISIONS.md).
- **ADR-009 step 2 · per-pawn tool gating.** Resolved. A pawn must physically **hold** a qualifying tool (equipped
  `belt` slot) to work a tool-gated job; the colony-stock check is gone as the work gate. **Auto-grab:** a toolless
  pawn claiming a gated job detours to the nearest stored tool, equips it, then proceeds (`activeJob.toolFetch` →
  `acquireToolAndProceed`) — no soft-lock, no micro. **minTier** enforced per-pawn; **per-pawn wear** breaks the tool →
  auto-unequip → grab a replacement. New `jobService.{requiredToolForJob,pawnHasToolFor,colonyHasToolFor,findStockToolDropFor}`.
- **R11 · random-events system wired (was dead code).** Resolved. `EventSystem` + `EVENT_DATABASE` (25 events) run in a
  new **`events` turn phase** (after `reapDead`); events surface in the chronicle via the same
  `simLog.logActivity({type:'event'})` path combat/death use (not the old `eventStore` modal). Consequence application
  reconciled to the current model (building effects hit physical `PlacedBuilding.condition`) and made immutable (events
  aren't a hot phase). _Known follow-ups:_ `deathChance` is a no-op (real death needs a systems-layer `killPawn`);
  building "destroy" sets `condition:0` in place; `seasonSpecific` triggers ungated (seasons unwired); the singleton's
  cooldown/history isn't in `GameState` so it resets on reload.

  _Removed as stale 2026-06-16:_ **D-perf remainder (tick strides)** (both concrete items shipped; perf at a clean stop)
  and **D-bills (`productionTargets`)** (dead field gone; a repeat-craft "bills" feature would be a fresh DESIGN item).

### Physical-production follow-ups (ADR-016)

- **Tool-gating step 2 (craft side, data-driven).** Resolved. Craft gating mirrors the harvest gate: a per-station
  **`toolRequirement: {workType, minTier}`** on the building def (`buildings.jsonc`), with a per-recipe
  `Recipe.toolRequirement` override. `recipeService.toolRequirementForRecipe` resolves override→station;
  `jobService.requiredToolForJob` is craft-aware (`craftQueueId → order → recipe → station tool`), so the per-pawn
  gate + auto-grab + wear light up for craft jobs for free (new `craftTool` claim-gate). Gated stations:
  **butcher_spot→butchery, tanning_rack→leatherworking, anvil + stone_forge→metalworking**, all `minTier 0`.
  Bootstrap-safe: butchery/leatherworking take `flint_knife`; metalworking gets a tool-free **`wooden_tongs`**
  (Green-Wood Tongs, `craft_spot`) ahead of the new `iron_tongs`/`steel_tongs` items — so the forge/anvil gate can't
  soft-lock. Forge *smelting* is passive (no pawn job) so only active shaping gates. _Known limitation:_ one `belt`
  tool slot → a pawn holds one tool at a time (swaps via auto-grab); multi-tool belt is a future refinement.
- **Butchery multi-yield.** Resolved (pure data). Each carcass's butcher recipe yields **meat + hide/pelt + bones** in
  one run (`make_venison`: `deer_carcass → {venison, deer_hide, medium_bones}`); the redundant per-product recipes
  (each consumed a whole carcass) were removed.
- **Passive-furnace flag for forge/hearth.** Resolved (data-driven). Passive is a per-recipe `"passive": true` flag in
  `recipes.jsonc` (16 recipes: all bloomery/kiln/charcoal-pit + `stone_forge` smelting + `hearth` ash/animal-fat); the
  dispatch honours `isPassive(recipe) || isPassiveStation(stationType)`, so forge/hearth smelt passively while their
  shaping recipes stay pawn-worked. `PASSIVE_STATIONS` remains only as a fallback for orders with no resolvable recipe.

## What's improved since 2026-06-10 (keep doing this)

- **Tests 32 → 153** — headless sim-invariant tests (starvation timing, combat sim, need thresholds) + the physical-production and job-registry seams.
- **Physical production (ADR-016)** — consumption is physical (no `gs.item` pocket); reserve → fetch → consume; passive furnaces; carry budgets + tool gating real.
- **Per-tile storage (Stage 2)** — stored drops as single source of truth, `aggregateFromDrops`, trigger-based absorption, deterministic ids.
- **ADR-014 occupancy** — one collision authority; pathfinding + movement defer to it.
- **ADR-015 single work model** — efficiency-scalar fork gone; speed/yield/quality flow from `stats.jsonc`.
- **Claim hygiene** — `killPawn`, drafted-skip, collapse entry all release claims (D2 leak class closed + tested).
- **Determinism** — zero `Math.random` outside `core/rng.ts`; seed persisted; world/sim streams split.
