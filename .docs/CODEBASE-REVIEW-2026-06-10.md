# Codebase Review — open items

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [ROADMAP](.tasks/open/ROADMAP.md) · [resolved (archive)](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md)

Living tracker of **open** architecture/defect items. Completed work — R1–R12, P-1/P-6/P-7,
PT-2/3/4, and the full PawnStateMachine decomposition — is in the
[resolved archive](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md). Gate at last update:
`check` 0 errors · `test` 203 · `lint` 0 · `build` ok.

---

## Structural debt (deferred by design — no big-bang)

- [x] **P-2 · Engine↔store dual source of truth.** `processGameTurn` begins with
  `this.gameState = { ...get(gameState) }` and ends with `pushFromEngine`; `getGameState()`
  deep-clones via `JSON.parse(JSON.stringify())` over a 240×160 map. The store-side throttled-notify
  is good; the read-back each tick is the inversion. Target: engine is the only writer, user actions
  become commands. Large, no functional change — do before the Living World layer adds per-tick state.
- [x] **P-3 · Services importing Svelte stores.** Done 2026-06-14. New `core/logSink.ts` defines a
  `SimLogSink` interface + live-binding `simLog` singleton (no-op default); `stores/simLogBridge.ts`
  registers an impl delegating to `Log`/`combatFeedback`, wired via side-effect import from
  `gameState.ts`. `Combat`, `EntityService`, and the pawn state machine now emit through `simLog.*`
  instead of importing stores. `CombatTextKind` moved to `core/logSink` (re-exported from
  `combatFeedback` for the renderer). Graph layer-violation warnings 24→20; headless sims/tests get
  the no-op sink (no UI logging side effects).
- [x] **P-2b · `GameEngineImpl` god-module → extract UI-coordination facade.** Done 2026-06-14.
  Engine 43 → 23 methods (god-module check now ✓). Most of the coordination cluster turned out to be
  **dead** (`getPawnNeeds`/`getCraftableItems`/`startResearch`/`assignPawnToWork`/`getAll*`/
  `calculateBuildingEffects`/… — zero callers) and was deleted from the class + `GameEngine`
  interface. The three genuinely-used methods (`getItemById`, `getBuildingById`, `craftItem`) moved
  to a new `systems/GameCoordinator.ts` singleton — the UI-facing command/query facade; writes route
  through `applyCommand` (P-2). Living-World UI coordination should grow there, not on the engine.
  Call sites (CraftingScreen, EquipmentDoll, PawnEquipment, +page) repointed to `gameCoordinator`.
  - **Codegraph blind spot (follow-up):** the dead methods were *not* flagged by `graph:check`'s
    `orphan` rule nor `/api/orphans` — both intentionally skip class methods (`!n.className`), since a
    method may be reached polymorphically via its interface. Only the `god-module` rule (>40 fns)
    pointed here; the deadness was found by grepping callers. Worth a future rule: flag interface/class
    methods whose sole reference is the interface declaration (guard against polymorphism false-positives).
- [ ] **P-4 · God files (remaining).** PawnStateMachine is done (see archive). Still oversized
  (LOC as of 2026-06-14 — all have **grown** since the original review, hence the bump):

  Progress 2026-06-14: types.ts, Combat data-table, JobService fuel-rules, and EntityService
  decomposition are **done** (✅ rows below); GameCanvas is **in progress** (shared sprite-sheet +
  HUD-icon modules + BuildingFuelPanel extracted, build green; remaining leaves mapped below).

  | File | LOC | Decomposition status |
  | ---- | --- | -------------------- |
  | `core/types.ts` | 1,478 → **16** ✅ | **Done.** Split into `core/types/` domain modules (`world`, `race`, `health`, `items`, `buildings`, `jobs`, `entities`, `research`, `gamestate`); `types.ts` is now a `export *` barrel — zero call-site churn. Largest module 340 LOC. |
  | `systems/Combat.ts` | 1,499 → **932** ✅ | **Done (data table).** `BODY_PART_DEFS` table + `BodyPartDef`/`PART_DEF_MAP`/`OUTER_PARTS`/`createDefaultBodyParts`/`rollBodyPart` moved to `core/BodyParts.ts` (569 LOC); Combat re-exports `PART_DEF_MAP`/`createDefaultBodyParts` for existing importers; dead `CLOT_FLOOR` export removed. Optional follow-up: lift damage/wound math into `combatMath.ts` (entangled with class tuning constants — deferred, lower value). |
  | `services/JobService.ts` | 1,337 → **1,261** ✅ (fuel) | **Partial.** Refuel **rules** (`getRefuelThresholdRatio`/`getRefuelRequirements`/`canSatisfyRefuelRequirements`/`hasRequiredFuelTypesForRefuel` + defaults + `RefuelRequirements`) extracted to a focused new `services/fuelRules.ts` (free functions; JobService calls `fuelRules.*`). _Note:_ they went to `fuelRules.ts` rather than `BuildingService` because BuildingService was already at the 40-fn god-module limit — adding them there tripped the warning, so a dedicated module is the cleaner home. **Remaining:** the per-job-type handler split into `services/jobs/<type>.ts` (ADR-017 registry) — the bigger structural piece, still open. |
  | `services/EntityService.ts` | 2,022 → **56** ✅ | **Done 2026-06-14.** Decomposed into an `entity/` dir of free-function modules (mirrors `pawn/*`): `entityConstants` (116), `entityHelpers` (430 — queries/movement/foraging lookups + `advanceMobMovement`), `entitySpawning` (238), `entityAI` (1,015 — the FSM brain + feeding sub-steps), `entityLifecycle` (211 — hunger/blood-loss/death/decay). EntityService is now a 56-line facade. The class had no instance state but `idCounter` (now a module-level counter in spawning), so every `this.X` dropped to a free-function call. `entityAI` is still 1,015 LOC — the cohesive stepping brain; optional future sub-split into hostile/passive. 188 tests green, eslint clean. |
  | `components/UI/GameCanvas.svelte` | 3,421 → **2,720** ⏸️ | **Paused 2026-06-14 (user decision):** the render/input core refactor is deferred until the overlay/ambient path is feature-complete — weather + fog overlays (see [SEASONS_WEATHER](.tasks/open/SEASONS_WEATHER.md)) are scoped expansions of the existing path, so refactoring the core now would be redone. Five clean leaf modules already extracted (below). Done 2026-06-14 (all build + tests green): (a) shared **`gameCanvas/spriteSheets.ts`** (magenta-keyed tileset cache + `getSheet`/`loadSheet`/`onSheetLoaded`) — the unblocker, since the sheet caches were shared by the HUD icons *and* the designation overlay; (b) **`gameCanvas/hudSpriteIcon.ts`** (`use:hudSpriteIconAction` action + tint); (c) **`gameCanvas/BuildingFuelPanel.svelte`** (368 LOC — per-building refuel settings UI; `building`+`pawns`+`open` props, writes `fuelSettings` via `gameState.updateWithSave`); (d) **`gameCanvas/selectionCard.ts`** (270 LOC — `buildPawnCard`/`buildMobCard` + `entityDebugLabel`/`pawnStateLabel`/`jobResourceName`/`jobProgressBar`/`toggleDraft`/`toggleHuntMark`; the reactive `cameraFollow*` ids + the `startHuntDrag` callback are threaded via a `deps` arg so the `$:` blocks still react); (e) **`gameCanvas/overlay.ts`** (50 LOC — the *pure* overlay helpers `overlayDroppedItems` + `buildingsVisualSig`; dead `pawnIdColor` deleted). **The clean leaf extractions are now exhausted — what remains is the render/input core, which is NOT a mechanical move:** (1) the per-frame painters `updatePawnOverlay`/`updateWorldEffectOverlays`/`drawDesignations` each read ~15–25 reactive vars + the render-pos interpolation Maps + the renderer ref every frame → need a **stateful `OverlayRenderer` object** (holds `pawnOverlayGrid` + render-pos Maps, `update(dt, ctx)` per frame), not free functions; (2) camera (pan/zoom/follow) → `gameCanvas/camera.svelte.ts`; (3) pointer/keyboard + drag state-machines (most coupled). **Sim-clock note:** the rAF loop calls `gameState.stepSimulation(dt)` (sim + render share one schedule); decoupling fully is a separate design change. |

  Plus 21 components over the 200-line cap (ActivityLogOverlay 525, CraftingScreen/BuildingMenu 484,
  ResearchScreen 452, ZonePanel 447, EntityScreen 422…). Split along existing seams opportunistically.
  Optional: sub-split the 788-LOC `pawnHelpers.ts` (movement / finders / need-distance / hunt) — no
  longer a god-module, low priority.

  **Suggested order:** `types.ts` (mechanical, zero churn) → `Combat.ts` (data-table extraction is a
  big cheap win) → `JobService.ts` (ADR-017-aligned) → `EntityService.ts` (pawn/* precedent) →
  `GameCanvas.svelte` (opportunistic, leaf-first). Each is independent; none needs a big-bang.
- [x] **P-4b · PawnStateMachine Step 5 — push selection into services.** Done 2026-06-14.
  **Job selection** → `JobService.selectJobForPawn(pawn, gs, { isReachable, queueSize })` (returns the
  chosen job + need-lookahead queue preview; the pawn-system's unreachable-job memory is *injected* as
  `isReachable`, so JobService stays free of FSM/movement state). **Need selection** → new
  `systems/pawn/needSelection.ts` (`selectIdleNeed` raw-threshold, `selectInterruptNeed`
  distance-weighted, `applyNeed`, + a `checkNeedInterrupts` select-apply wrapper). `handleIdle` now
  only *applies* decisions; `checkNeedInterrupts` moved out of `pawnHelpers` (782→796 LOC) into
  needSelection; work/combat handlers import it from there. Behaviour-identical (logging, routing,
  job-release order preserved) — 200 tests green. _Placement note:_ need-selection lives in the pawn
  system, **not** PawnService, because its distance/threshold helpers sit in the systems layer —
  putting it in `services` would create a services→systems back-edge (user-confirmed decision).
- [ ] **P-5 · Per-tick allocation churn.** Index-once/update-once tick rewrite undone; per-pawn-per-tick
  scans added since (`findCombatThreat` over all mobs; `occupancyService.blockedTiles` rebuilt per
  pathfind; `findNearestRestBuilding` scans pawns×buildings). Profiling-gated — don't touch until
  `__profOut` says so; but no new system should add full-array `pawns.map(...)` writes for single-pawn
  updates.
  - **Profiling instrumented 2026-06-14.** `profileTurns()` now also reports per-tick call counts for
    the suspect scans as `#<name>/tick` in the `[PROF]` line (dev-gated `profCount()` in `core/log` —
    zero cost when off). Reusable harness at `src/lib/game/profileSim.test.ts` (`PROFILE=1 npx vitest
    run …`; skipped in the normal suite).
  - **Profiled 2026-06-14 (in Headless) — the three named suspects are NOT the hot spots.** (8 pawns,
    ~40 mobs, 60 designations, 1800 ticks, 3 runs, steady-state ≈ **0.86–1.07 ms/tick total** — huge
    headroom under the 16.6 ms/60fps budget). Per-phase share:
    `entityStep ~42%` · `resourceRegrowth ~26%` · `generateJobs ~11%` · `pawns ~11%` · `needsTick ~8%`
    · **`combat ~0.6%`** · rest ≈0. Suspect scan frequency: `#findCombatThreat 8/tick` (= 1 per living
    pawn, as flagged), `#findNearestRestBuilding 4/tick`, `#blockedTiles 1/tick`. **Verdict:** the
    P-5-named items (`findCombatThreat`, `blockedTiles`, `findNearestRestBuilding`) live in the *cheap*
    `combat`/`pawns` phases (≤12% combined) — optimizing them is wasted complexity at this scale. The
    actual cost is **`entityStep` (mob AI)** and **`resourceRegrowth`** (the worldMap cooldown scan =
    the existing D-perf "cooldown index for regrowth" item) — neither named in P-5.
  - **Caveat + next:** headless has **no WASM/A\*** (`init()` early-returns when `!browser`), so the
    `pawns` phase and `#blockedTiles` are under-represented (real per-tick pathfinding cost is absent).
    Run `profileTurns()` **in-browser under real load** to confirm whether A* pushes `pawns`/`entityStep`
    up; if it does, the worthwhile target is the regrowth cooldown index (D-perf), not the named scans.

## Latent defects (found in passing — not yet scheduled)

- [x] **INV-1 · `inventory.items` overloaded: haul-carry vs equip-screen pool.** Done 2026-06-14.
  `syncPawnInventoryWithGlobal` / `syncAllPawnInventories` used to **overwrite** `pawn.inventory.items`
  with the colony stockpile (non-material, minus equipped) so the equip UI + `canEquipItem`/`useConsumable`
  could read the pool — polluting `inventory.items`, which is also the pawn's *carried* goods read by
  `getCurrentCarryLoad` (the `[load/max kg]` readout) and `clampPickupQuantity`. **Fix:** the equip
  screen (`components/pawn/PawnEquipment.svelte`) now derives its **Available Items** pool reactively
  from `$gameState.stockpile` minus `equippedItemCounts($gameState.pawns)` — never written into
  `inventory.items`. The two `sync*` functions + `getAllEquippedItemIds` were deleted (replaced by the
  small `equippedItemCounts` helper); the equip/unequip/consume handlers dropped their `syncAll…`
  calls; `canEquipItem`/`useConsumable` no longer read `inventory.items` (availability is the UI's
  concern — it lists only in-stock items, and consumables decrement the stockpile via
  `consumeFromStockpiles`). Dead `syncPawnInventoryWithGlobal`/`syncAllPawnInventories` imports removed
  from `gameState.ts`. `inventory.items` is now strictly the pawn's carried haul goods, so the carry
  readout/clamp are correct after the equip screen is opened.
- [x] **LIGHT-1 · §G light→work-speed is inert (`tile.lightLevel` never written).** Done 2026-06-14.
  The work loop read `tile.lightLevel`, which nothing wrote → always `1` → darkness never slowed work.
  **Fix (lazy, no map scan):** `pawn/handlers/work.ts` now computes the working pawn's tile light
  on the spot via `computeTileLightLevel(turn, buildings, x, y)` (day/night ambient + nearby fire
  emitters — the same function the HUD readout uses), then feeds it through `lightWorkMultiplier`.
  Only the working pawn's tile is sampled, so there's no per-turn 240×160 pass. Effect: at night away
  from a fire, work runs at the 0.4 floor; a lit fire (or daylight) restores full speed. The dead
  `WorldTile.lightLevel` field was removed (nothing reads it now). Tests: `lightWorkWiring.test.ts`
  (darkness lowers the multiplier; a lit campfire cancels the night penalty) on top of the existing
  `lightWork.test.ts` (light → sight → speed). Ambient day length is 300 turns / 18000 ticks.
- [x] **FLEE-1 · Cornered-flee ping-pong / stuck-in-corner.** Done 2026-06-14. Prey boxed between two
  threats stuck in `Fleeing` — first as a ping-pong (greedy `moveAway` backing off the single closest
  threat, which flips side to side), then (after a local-maximin first attempt) dead-ending in a corner
  and freezing. **Fix:** flee to a **distant destination via A\***, not greedy local steps. New
  `entityHelpers.fleeToSafety(mob, threats, state, turn)` projects a goal ~⅓ map away in the direction
  maximising the MIN distance to every threat. **Locks** it on `mob.fleeDest` (~half the map away) and
  runs to that exact point, re-routing around blocks toward the SAME tile until it arrives or the point
  stops being safe — then picks a new one. Locking removes the per-recompute direction choice that
  flipped between two near-tied headings (south `44` vs NE `42`) as the threat moved → the big-range
  yoyo; "half map" means the prey usually breaks flee-range and exits long before arriving. The
  `SAFE_RESET_TICKS` give-up fires only when cornered (`!fleeDest`), never mid-run. Falls back
  to local maximin `fleeFromThreats` when no distant point is reachable / pathfinder not ready. Both
  `Fleeing` cases (`stepAnimal` + `stepHostile`) gather nearest pawn + predator within `fleeRange` and
  call it; the animal case gained the `SAFE_RESET_TICKS` give-up the hostile already had. Diagnostics:
  `logFleeTrigger` → `ENTITY-FLEE` lines. Tests in `entity/fleeFromThreats.test.ts`. Write-up in
  `game/BUGS.md` ([FIXED]).
- [x] **MOVE-1 · Duplicated per-tick move pass (pawns vs mobs) → shared `stepBody`.** Done
  2026-06-14. The per-tick driver was copy-pasted between `PawnService.processMovement` and
  `entity/entityHelpers.advanceMobMovement` (~80% identical: occupancy hold, `blockedTicks`
  drop-and-reroute, claim set, advance) and had **drifted** — the pawn pass lacked the convergence
  `claimed` set, and `MAX_BLOCKED_TICKS` was defined in *three* places (PawnService, entityConstants,
  implicitly the mob pass). The hunt-yoyo regression was the same disease (the mob hunt re-path reset
  `nextCellCostLeft`, which pawn `assignPath` never did). **Fix:** `MovementSystem.ts` now owns
  `stepBody(body, occupancy, claimed, worldMap, speed)` (the hold / blocked-ticks-drop / one-body-
  per-tile-claim / advance step, returning `{body, status, done}`), `seedMidCrossClaims`, and the
  single `MAX_BLOCKED_TICKS`. Both passes are now thin: build occupancy + seed claims, loop
  `stepBody`, then map the result onto their own fields (pawns layer `isMoving`/`hasReachedDestination`;
  mobs just take the body). Pawns *gained* the mid-cross convergence guard (one body per tile) for
  free. The path-assign side stays per-type (pawn `assignPath` sets `isMoving`; mob re-path is inline)
  but both now correctly preserve `nextCellCostLeft` — the invariant `stepBody` relies on. Unit test
  `systems/movementPass.test.ts` (idle/held/dropped/moved, mid-cross preservation, claim convergence);
  `moverDeadlock` (pawn) + `entitySim` (mob) still green. 194 tests, `check` 0, lint clean.

## Carried-forward deferred (unchanged status)

- [ ] **D9.1 / D9.6 / D9.7** — index-once tick, deep-clone removal (tied to P-2), event-driven job generation. Profiling-gated.
- [ ] **D-perf** — cooldown index for regrowth, tick strides, incremental job board.
- [ ] **D-bills** — `productionTargets` exists in state with nothing driving it.
- [ ] **ADR-009 step 2** — per-pawn claimed-inventory tool gating (R4 was step 1).
- [ ] **R11 remainder — Events phase.** ARCHITECTURE's turn order no longer lists it, but
  `core/Events.ts` (~hundreds of lines, ADR-006) is still fully unwired — either wire it or cut it.

## Tier 0 — broken-loop bugs ✅ DONE 2026-06-14

Sourced from playtest + `game/NOTES.md`. Made the *existing* combat/survival/production slice
visibly broken; all small. Shipped 2026-06-14 — gates: `check` 0 · `test` 162 · `lint` 0 · `build` ok.

- [x] **NT-1 · Trait cards leak `Efficiency: [object Object]`.** Root cause: `PawnTraits`/`RaceScreen`
  only special-cased the literal keys `workSpeed/workYield/workQuality`; a work-mult map under any other
  key (legacy persisted `workEfficiency`) fell to the neutral branch and `formatEffectValue` stringified
  the object. Fix: both renderers now handle **any object-valued effect** generically via a shared
  `workAxisLabel(key)`, and `formatEffectValue` formats objects as a `%` list (never `[object Object]`).
- [x] **NT-2 · Death not finalised — pawn lingered in UI.** Combat killed pawns by setting
  `isAlive=false` directly, **bypassing `killPawn`** (no corpse/gear/`deadPawns`/mood). Added
  `reapDeadPawns(state)` — an end-of-turn reaper (in `processGameTurn` after combat) that finalises any
  un-flagged dead pawn (`corpseDropped` marker) and **removes all dead pawns from `pawns[]`** so they
  leave every UI list. `PawnScreen` falls back to the first living pawn when its selection is reaped.
  Corpse swap (`pawn_carcass`) was already in `killPawn` (R10). Tests in `deathDrops.test.ts`.
- [x] **NT-3 · Combat + infection too fast.** Attack interval `BASE_ATTACK_INTERVAL_TICKS` 30→60
  (+ floor 18→`MIN_ATTACK_INTERVAL_TICKS` 36) — halves all pawn/mob attack speed. Infection:
  `infectionRiskPerWound` 0.0012→0.0004 **and** a new `infectionRiskMaxPerTick` 0.0008 cap so many
  combat wounds can't stack into a near-instant lethal infection (the "died mid-combat" report).
  *(Follow-up: hit-accuracy rebalance now that swings are slower — NT backlog.)*
- [x] **NT-4 · Drafted pawn auto-engages adjacent hostile.** **Decision: auto-attack** (not
  click-to-target). A drafted pawn with no explicit `attack` order now swings at the nearest adjacent
  hostile (new `else if (pawn.drafted)` branch in the Combat pawn-attack loop) — walk a drafted pawn up
  to an enemy and it fights instead of standing inert. Test in `combatSim.test.ts`.
- [x] **PT-1 · Hauling deposited short ("hang").** `findNearestDepositPoint` now returns the nearest
  **standable** tile (walkable + unoccupied via `occupancyService.isBlocked`) — the zone tile itself for
  a stockpile, an adjacent free tile for a building — instead of the nearest-by-distance tile the pawn
  couldn't stand on. Falls back to deposit-in-place only when nothing in the tier is standable. Soft-queue
  preview deduped. Tests in `pawn/depositPoint.test.ts`.

## Tier 0 UI polish (from NOTES — cheap, opportunistic)

- [ ] **NT-U1 · Toggleable health panel** in the info panel showing only damaged limbs/wounds; "no damage"
  when all healthy.
- [ ] **NT-U2 · Info-panel buttons** moved adjacent (right) and outside the panel.
- [ ] **NT-U3 · Fixed-width info-panel skeleton** so long descriptions wrap instead of stretching the
  panel across the viewport; unify panel width across all object types.
- [x] **NT-U4 · Draft target line draws while paused** (currently only renders after unpausing).

## NT backlog (deferred — not Tier 0)

- [ ] **MOOD spec** — companion death → strong negative mood; defeating a hostile → positive mood;
  consider a `mood.jsonc` to centralise mood effects. *Content/feature — defer per skateboard model.*
- [ ] **Hit-accuracy rebalance** — after NT-3 speed halving, cross-reference combat logs vs entity stats;
  likely buff accuracy. Do *after* the speed change so they're tuned together.
- [ ] **Entity stamina / breaks** — give mobs stamina + forced rests like pawns. Needs investigation.

## Tier 1 / Tier 2 (after Tier 0)

- **Tier 1 — before Living World:** ✅ P-2 (engine as sole writer) + P-3 (inject log sink) done
  2026-06-14 — large, no-functional-change inversions. Still worth an in-browser smoke (activity log /
  combat floaters / UI snapshot). P-2b (facade extraction) remains open before Living World lands.
- **Tier 2 — next feature:** Living World B–D (seasons / weather / fog) — ROADMAP Wave 6.

## Suggested sequencing

1. **Tier 0 now:** NT-1 → NT-2 → NT-3 → PT-1 → NT-4 (+ UI polish NT-U* opportunistically).
2. **Tier 1 (before Living World):** ✅ P-2 + P-3 inversions done; P-2b facade extraction still open.
3. **Tier 2:** Living World B–D.
4. **Opportunistic (no big-bang):** P-4 god-file splits (GameCanvas, EntityService, Combat) along seams; P-4b Step 5 selection→services.
5. **Profiling-gated:** P-5 per-tick allocation — only when `__profOut` says so.
6. **Physical-production follow-ups** (ADR-016; spec archived at [PHYSICAL-PRODUCTION](.tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md)): tool-gating step 2 (per-pawn inventory + `minTier` + craft-tool gating), per-stack craft quality on instances (R8), butchery multi-yield (content), passive-furnace flagging for forge/hearth.
