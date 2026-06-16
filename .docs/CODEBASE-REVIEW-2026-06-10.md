# Codebase Review — open items

> **Related:** [game/ARCHITECTURE](game/ARCHITECTURE.md) · [game/DESIGN](game/DESIGN.md) · [game/DECISIONS](game/DECISIONS.md) · [ROADMAP](.tasks/open/ROADMAP.md) · [ENGINE-PERFORMANCE](.tasks/open/ENGINE-PERFORMANCE.md) · [resolved (archive)](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md)

Living tracker of **open** architecture/defect items. The resolved half is in the
[resolved archive](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md): R1–R12, the PawnStateMachine
decomposition, and the **2026-06-14/16 second wave** — P-2/P-2b/P-3/P-4b, the done P-4 god-file splits
(`types.ts`/`Combat.ts`/`EntityService.ts`/`JobService` fuel rules + per-job-type handler split), INV-1/LIGHT-1/FLEE-1/MOVE-1, the full
Tier 0 (NT-1..4 + PT-1 + NT-U1..4), and **P-5 + the D9/D-perf tick-cost items, resolved by the long
[ENGINE-PERFORMANCE](.tasks/open/ENGINE-PERFORMANCE.md) arc** (de-immutabling, worker decouple + slim snapshot,
pawn-id index, regrowth tile-deltas → the heavy stress case 30 → **200+ TPS @4×**).

Gate at last update (2026-06-16): `check` 0 · `test` 264 · `lint` 0 · `build` ok.

---

## New from playtest (`game/NOTES.md`, 2026-06-16)

Surfaced after the ENGINE-PERFORMANCE arc. **N-1 is the top priority** (a real regression — placement broken under
`--profiler`). N-2/N-3/N-4 (survival-loop tuning) and N-5 (a latent duplicate-drop-id bug) are
[resolved](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md).

- [ ] **N-1 · Can't place buildings since the performance work.** REGRESSION — building placement broke somewhere
  in the worker / snapshot / de-immutable arc. A broken core loop → highest priority. **Key clue: it works in
  `--debug` mode but NOT in `--profiler` mode** — so the placement logic is fine; the divergence is in how the two
  modes drive the sim/worker (the profiler scenario's worker boundary or paused-warmup path), not in
  `BuildingService`. Suspect the command path crossing the worker boundary, or the in-place worldMap/footprint
  mutation (ENGINE-PERFORMANCE D6 — `applyBuildingFootprint` now mutates the tile in place + `markTileDirty`).
  Diff the `--debug` vs `--profiler` setup, then bisect against the perf commits.

## Structural debt (deferred by design — no big-bang)

- [ ] **P-4 · God files (remaining).** Done rows (`types.ts`, `Combat.ts` data table, `EntityService`, JobService
  fuel rules **and the per-job-type handler split**) are in the archive. Still open:

  | File | LOC | Decomposition status |
  | ---- | --- | -------------------- |
  | ~~`services/JobService.ts`~~ | ~~~1,261~~ | **Done 2026-06-16.** Refuel rules were already in `services/fuelRules.ts`; the per-job-type handlers are now split into `services/jobs/<type>.ts` (ADR-017 registry) — one module per type (`harvest`/`haul`/`construct`/`deconstruct`/`fetch`/`craft`/`refuel`) exporting `generate`/`complete`, plus shared `jobs/staging.ts` (reserve-and-fetch helpers) and `jobs/filters.ts` (zone/designation predicates). JobService (1,337 → 386 LOC) now owns only the registry binding, public API, dispatch, claim-gating, and the job→work-category map. Public surface unchanged; `check` 0 · `test` 251. |
  | `components/UI/GameCanvas.svelte` | ~2,720 | **Paused (user decision):** the render/input core refactor is deferred until the overlay/ambient path is feature-complete (weather + fog overlays — [SEASONS_WEATHER](.tasks/open/SEASONS_WEATHER.md) — are scoped expansions of the existing path, so refactoring the core now would be redone). Five clean leaf modules already extracted (`gameCanvas/spriteSheets.ts`, `hudSpriteIcon.ts`, `BuildingFuelPanel.svelte`, `selectionCard.ts`, `overlay.ts`). **The clean leaf extractions are exhausted** — what remains is the render/input core (the per-frame painters → a stateful `OverlayRenderer`; camera → `camera.svelte.ts`; pointer/keyboard drag state-machines), NOT a mechanical move. |

  Plus ~21 components over the 200-line cap (ActivityLogOverlay 525, CraftingScreen/BuildingMenu 484, ResearchScreen
  452, ZonePanel 447, EntityScreen 422…). Split along existing seams opportunistically. Optional: sub-split the
  ~788-LOC `pawnHelpers.ts` (movement / finders / need-distance / hunt) — no longer a god-module, low priority.

## NT backlog (deferred — not Tier 0)

- [ ] **MOOD spec** — companion death → strong negative mood; defeating a hostile → positive mood; consider a
  `mood.jsonc` to centralise mood effects. *Content/feature — defer per skateboard model.*
- [ ] (under consideration) **Hit-accuracy rebalance** — after the NT-3 attack-speed halving, cross-reference combat logs vs entity stats;
  likely buff accuracy. Do it *with* the speed change in view so they're tuned together.

_All carried-forward deferred items (D9.7/ADR-022, ADR-009 step 2, R11) and the physical-production follow-ups
(craft tool-gating, butchery multi-yield, passive-furnace flag) shipped 2026-06-16 — see the
[resolved archive](.tasks/archive/CODEBASE-REVIEW-RESOLVED-2026-06-13.md)._
