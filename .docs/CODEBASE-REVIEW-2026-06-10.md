# Codebase Review — open items

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [ROADMAP](.tasks/open/ROADMAP.md) · [ENGINE-PERFORMANCE](.tasks/open/ENGINE-PERFORMANCE.md) · [resolved (archive)](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md)

Living tracker of **open** architecture/defect items. The resolved half is in the
[resolved archive](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md): R1–R12, the PawnStateMachine
decomposition, and the **2026-06-14/16 second wave** — P-2/P-2b/P-3/P-4b, the done P-4 god-file splits
(`types.ts`/`Combat.ts`/`EntityService.ts`/`JobService` fuel rules), INV-1/LIGHT-1/FLEE-1/MOVE-1, the full
Tier 0 (NT-1..4 + PT-1 + NT-U1..4), and **P-5 + the D9/D-perf tick-cost items, resolved by the long
[ENGINE-PERFORMANCE](.tasks/open/ENGINE-PERFORMANCE.md) arc** (de-immutabling, worker decouple + slim snapshot,
pawn-id index, regrowth tile-deltas → the heavy stress case 30 → **200+ TPS @4×**).

Gate at last update (2026-06-16): `check` 0 · `test` 246 · `lint` 0 · `build` ok.

---

## New from playtest (`game/NOTES.md`, 2026-06-16)

Surfaced after the ENGINE-PERFORMANCE arc. **N-1 and N-5 are regressions and the top priority** — the perf work
broke the building/blueprint loop. N-2/N-3/N-4 are pre-existing survival-loop tuning.

- [ ] **N-1 · Can't place buildings since the performance work.** REGRESSION — building placement broke somewhere
  in the worker / snapshot / de-immutable arc. A broken core loop → highest priority. **Key clue: it works in
  `--debug` mode but NOT in `--profiler` mode** — so the placement logic is fine; the divergence is in how the two
  modes drive the sim/worker (the profiler scenario's worker boundary or paused-warmup path), not in
  `BuildingService`. Suspect the command path crossing the worker boundary, or the in-place worldMap/footprint
  mutation (ENGINE-PERFORMANCE D6 — `applyBuildingFootprint` now mutates the tile in place + `markTileDirty`).
  Diff the `--debug` vs `--profiler` setup, then bisect against the perf commits.
- [ ] **N-2 · Stamina regen too fast — effectively infinite.** Pawns (especially) regen stamina so quickly it
  rarely constrains them. Tune the regen rate down so stamina is a real pressure.
- [ ] **N-3 · Exhaustion state not tied to stamina (all entities).** Chickens sit "exhausted" at max stamina — the
  exhaustion flag is decoupled from the stamina value. Make exhaustion a pure function of the stamina value for
  every pawn **and** mob, in one place. (Supersedes/merges the NT-backlog "entity stamina/breaks" item — the
  mechanic exists, it's just mis-wired.)
- [ ] **N-4 · Haul picks up a single item per trip.** A hauling pawn grabs 1 item, walks to the stockpile, and
  repeats. It should fill its volume/weight budget per trip, opportunistically picking up compatible items between
  the source and the stockpile. (`clampPickupQuantity` already caps pickup by budget — the gap is the
  multi-item/opportunistic pickup loop, not the cap.)
- [ ] **N-5 · Pawns jank back-and-forth after queuing building blueprints.** Once blueprints are queued, pawns
  oscillate (a movement/target ping-pong). Likely a fetch/deposit or approach-tile flip-flop in the build-job path
  (cf. the FLEE-1 / hunt-yoyo class — a per-tick target recompute that alternates between two near-tied tiles).
  Repro by queuing a blueprint and watching the assigned builders; check the build-job's approach-tile selection
  and `nextCellCostLeft` preservation across re-paths (MOVE-1 invariant). //actually the state rapidly oscilates between moving to resource and idle

## Structural debt (deferred by design — no big-bang)

- [ ] **P-4 · God files (remaining).** Done rows (`types.ts`, `Combat.ts` data table, `EntityService`, JobService
  fuel rules) are in the archive. Still open:

  | File | LOC | Decomposition status |
  | ---- | --- | -------------------- |
  | `services/JobService.ts` | ~1,261 | **Partial.** Refuel rules extracted (`services/fuelRules.ts`). **Remaining:** the per-job-type handler split into `services/jobs/<type>.ts` (ADR-017 registry) — the bigger structural piece, still open. |
  | `components/UI/GameCanvas.svelte` | ~2,720 | **Paused (user decision):** the render/input core refactor is deferred until the overlay/ambient path is feature-complete (weather + fog overlays — [SEASONS_WEATHER](.tasks/open/SEASONS_WEATHER.md) — are scoped expansions of the existing path, so refactoring the core now would be redone). Five clean leaf modules already extracted (`gameCanvas/spriteSheets.ts`, `hudSpriteIcon.ts`, `BuildingFuelPanel.svelte`, `selectionCard.ts`, `overlay.ts`). **The clean leaf extractions are exhausted** — what remains is the render/input core (the per-frame painters → a stateful `OverlayRenderer`; camera → `camera.svelte.ts`; pointer/keyboard drag state-machines), NOT a mechanical move. |

  Plus ~21 components over the 200-line cap (ActivityLogOverlay 525, CraftingScreen/BuildingMenu 484, ResearchScreen
  452, ZonePanel 447, EntityScreen 422…). Split along existing seams opportunistically. Optional: sub-split the
  ~788-LOC `pawnHelpers.ts` (movement / finders / need-distance / hunt) — no longer a god-module, low priority.

## NT backlog (deferred — not Tier 0)

- [ ] **MOOD spec** — companion death → strong negative mood; defeating a hostile → positive mood; consider a
  `mood.jsonc` to centralise mood effects. *Content/feature — defer per skateboard model.*
- [ ] **Hit-accuracy rebalance** — after the NT-3 attack-speed halving, cross-reference combat logs vs entity stats;
  likely buff accuracy. Do it *with* the speed change in view so they're tuned together.

## Carried-forward deferred

- [ ] **D9.7 · Event-driven job generation.** Partially mitigated (`_syncHarvestJobs` O(designations×jobs) → O(1)
  `Set` dedup, ENGINE-PERFORMANCE §C) but still not event-driven — the job board is rebuilt per tick. Profiling-gated.
- [ ] **D-perf remainder** — tick strides + incremental job board. (The regrowth cooldown index landed — see archive.)
- [ ] **D-bills** — `productionTargets` exists in state with nothing driving it.
- [ ] **ADR-009 step 2** — per-pawn claimed-inventory tool gating (`minTier` + craft-tool gating; R4 was step 1).
- [ ] **R11 remainder — Events phase.** ARCHITECTURE's turn order no longer lists it, but `core/Events.ts`
  (~hundreds of lines, ADR-006) is still fully unwired — either wire it or cut it.

## Physical-production follow-ups (ADR-016)

Spec archived at [PHYSICAL-PRODUCTION](.tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md).

- [ ] Tool-gating step 2 (per-pawn inventory + `minTier` + craft-tool gating) — same as ADR-009 step 2 above.
- [ ] Per-stack craft quality on instances (R8) — deferred until equipment quality matters.
- [ ] Butchery multi-yield (content).
- [ ] Passive-furnace flagging for forge/hearth.

## Sequencing

1. **Now — fix the building regressions:** N-1 (can't place buildings; `--debug` works, `--profiler` doesn't) and
   N-5 (blueprint-queue jank) — both broke a core loop in the perf arc; likely related (the blueprint path). Bisect
   the perf commits.
2. **Cheap survival-loop tuning:** N-2 / N-3 (stamina + exhaustion) together; N-4 (multi-item haul).
3. **Tier 2 — next feature:** Living World B–D (seasons / weather / fog) — ROADMAP Wave 6; folds the heavy
   `nearestPawn` spatial index in with fog-of-war/LoS (ENGINE-PERFORMANCE §C defers it there).
4. **Opportunistic (no big-bang):** P-4 god-file splits (JobService handler registry; GameCanvas render/input core
   once the overlay path is feature-complete).
5. **Profiling-gated:** D9.7 / D-perf remainder — only when a profiler pass says so.
