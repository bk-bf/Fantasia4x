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

Surfaced after the ENGINE-PERFORMANCE arc. **N-1 is the top priority** (a real regression — placement broken under
`--profiler`). **N-5 is fixed** (turned out to be a latent duplicate-drop-id bug, not a perf regression). N-2/N-3/N-4
are pre-existing survival-loop tuning.

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
- [x] **N-5 · Pawns jank back-and-forth (Idle↔MovingToResource) after queuing building blueprints.** Done
  2026-06-16. **Not a perf regression** — a latent **duplicate-drop-id** bug, triggered by drag-placing many walls
  at once. Root cause (confirmed via live CDP state dump of the running Electron app): `reserveForOrder` built the
  reserved stack's id as `${d.id}-resv-${orderId.slice(-6)}` ([GameState.ts](game/../../src/lib/game/core/GameState.ts)),
  and `slice(-6)` is the **placement-timestamp tail** — every building placed in the same drag batch shares one
  `Date.now()`, so all their reserved cordage stacks at the shared stockpile tile collided on ONE id (≈15 drops
  with id `…-resv-548129`, distinct `reservedFor`). `_syncFetchJobs`'s filter did `find(d => d.id === droppedItemId)`
  → matched a **sibling wall's** stack → `reservedFor !== owner` → culled the valid fetch job → re-minted it with a
  fresh `Date.now()` id → the pawn's claimed `jobId` dangled → `!jobInPool` → Idle → re-claim the new id → repeat.
  **Fix (three parts):** (1) reservation ids use the **full `orderId`** (unique per building), not `slice(-6)`;
  (2) the fetch filter + dedup match on **`id` AND `reservedFor`/owner** (self-heals existing collided saves);
  (3) **deterministic job ids** (`fetch-${drop.id}-${ownerId}`, and dropped the redundant `-${Date.now()}` from
  construct/craft/deconstruct/refuel) so a transient filter miss can't dangle a claim. Verified live: `Date.now()`
  job ids → 0, pawns return to `Working`, walls build. `check` 0 · `test` 246.

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

- [x] **D9.7 · Event-driven job generation → throttled reconcile (ADR-022).** Done 2026-06-16. Investigation
  concluded a true event-driven rewrite isn't worth it: the per-tick `generateJobs` is **already** emission-derived
  and self-healing (it rebuilds the board from current sources each pass — a gone source simply stops producing a
  job, no delete signal needed), and the Set-dedup + pawn-id `Map` already took it off the hot list. A full
  push/event model would trade that self-healing for fragile per-mutation-site signalling for a now-modest win.
  **Resolution:** keep the reconcile as-is but **throttle it to every 6 ticks** (`JOB_GENERATION_INTERVAL_TICKS`
  in GameEngineImpl) — board-appearance latency ≤6 ticks (~0.1 in-game-sec, imperceptible → no event kicks needed),
  scan cost ~1/6. Claim/advance/complete still run every tick, so claimed/in-progress jobs are untouched between
  rebuilds. See [DECISIONS ADR-022](game/DECISIONS.md). The two-clocks insight (board-refresh cadence ≠ per-pawn
  job-selection cadence) is captured in the ADR.
- [x] **ADR-009 step 2 — per-pawn tool gating.** Done 2026-06-16. A pawn now must physically **hold** a qualifying
  tool (equipped, e.g. the `belt` tool slot) to *work* a tool-gated harvest; the colony-stock check is gone as the
  work gate. **Auto-grab:** a toolless pawn claiming a gated job (still claimable while a tool exists in stock)
  detours to the nearest stored tool, equips it (`activeJob.toolFetch` first leg → `acquireToolAndProceed`), then
  proceeds — no soft-lock, no player micro; if no tool exists anywhere the job stays open (bootstrap-safe).
  **minTier enforced** per-pawn (tool `tier` ≥ `toolRequirement.minTier`). **Per-pawn wear:** the working pawn's
  equipped tool loses durability and breaks → auto-unequipped → the gate sends the pawn to grab a replacement
  (the full loop). New `jobService.{requiredToolForJob,pawnHasToolFor,colonyHasToolFor,findStockToolDropFor}`;
  gate in `getAvailableJobs`; FSM detour in `handlers/work`; wear in `jobs/harvest`. Tests in
  `followupFeatures.test.ts`. `check` 0 · `test` 255.
- [ ] **R11 — random-events system: wire or cut.** _(Reworded — the old "Events.ts fully unwired" is stale.)_
  `core/Events.ts`'s log/chronicle **types** (`ActivityLogEntry`/`LogCategory`/`CombatTurnEntry`) **are** used (logging
  + chronicle UI). But the **gameplay** half — `EventSystem` + `EVENT_DATABASE` + `events.jsonc` (fire, building
  destruction…) + `triggerEvent` — is **defined and never invoked** (zero callers; nothing rolls events per turn).
  Decide: wire random events into the turn loop (a feature) or delete the dead `EventSystem`/`EVENT_DATABASE`/
  `events.jsonc`.

  _Removed as stale 2026-06-16:_ **D-perf remainder (tick strides)** — moot: both concrete D-perf items shipped
  (regrowth cooldown index; job board = ADR-022), the stride technique is already applied where it paid, and perf is
  at a clean stopping point. **D-bills (`productionTargets`)** — the dead field is gone (0 references repo-wide); a
  RimWorld-style repeat-craft "bills" feature would be a fresh DESIGN item, not this leftover.

## Physical-production follow-ups (ADR-016)

Spec archived at [PHYSICAL-PRODUCTION](.tasks/archive/PHYSICAL-PRODUCTION-2026-06-13.md).

- [ ] Tool-gating step 2 (per-pawn inventory + `minTier` + craft-tool gating) — same as ADR-009 step 2 above.
- [ ] Per-stack craft quality on instances (R8) — deferred until equipment quality matters.
- [ ] Butchery multi-yield (content).
- [ ] Passive-furnace flagging for forge/hearth.
