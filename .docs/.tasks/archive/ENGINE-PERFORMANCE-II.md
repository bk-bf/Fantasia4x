<!-- LOC cap: 400 (created: 2026-06-21; VICTORY 2026-06-22) -->

# ENGINE-PERFORMANCE-II — the 750² + high-entity load

> **Related:** [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (Pass I — worker cutover, snapshot slimming, chunked terrain, render-on-demand) · [DECISIONS §ADR-026](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [DISTRIBUTION](DISTRIBUTION.md) · [[immutable-pattern-is-the-sim-perf-tax]] · [[cross-check-engine-perf-spec]]

## 🏆 VICTORY (2026-06-22, validated in-game)

**A 500×500 map (~250,000 tiles) now runs at 120 FPS / 60 TPS @1×, and 4× climbs to ~120 TPS smoothly.**
The two architectural breakthroughs below — an **entity complexity bubble** (TPS) and **incremental-only
terrain** (FPS) — broke the ceiling that pure micro-opt (R1–R5/S1–S4) could only chip at. Pass-I's
per-function trace methodology confirmed it: `generateBatchVertexData` **19.7% → 0.4%**, `samplePointStatic`
**15.3% → gone**, `buildRows` **5% → gone** (`.debug/Trace-20260622T181035.json.gz`).

This also makes **1000² viable** with one more turn of the LOD crank (see "Path to 1000²").

## Why this exists

Pass I tuned the **38k-tile / few-hundred-mob** slice to 200+ TPS @4×. The user then loaded **750×750 +
up to 1650 mobs** to expose the next ceiling:

- **TPS collapsed with mob count** (`perf.log`, 2026-06-21): `mobs=1650 → tps=2–4`; `958 → 13–26`; `0 → 60`.
  **Pawns are irrelevant (5); MOBS drove it.**
- **FPS sub-10 even PAUSED while panning** — the renderer rebuilt terrain chunks + re-baked lighting and
  re-flooded the whole `GameGrid` on every terrain change.

---

## BREAKTHROUGH 1 — Entity complexity bubble (the TPS lever) — SHIPPED

The headline TPS fix (supersedes S5b "entity LOD"). **THINKING is gated, not drawing** — every mob is
still rendered and still *moves + fights* every tick; only the expensive *decisions* are throttled by
distance. `services/entity/entityAI.ts` + `entityHelpers.ts` + `entityLifecycle.ts` + `entityConstants.ts`.

- [x] **Complexity bubble + staggered rare-tick AI.** A mob within `LIVE_RADIUS` (Chebyshev) of a live
  pawn runs the full per-tick FSM (forage/hunt/A*). OUTSIDE, it runs the full FSM only on its **staggered
  think-tick** (~once / `AI_THROTTLE_TICKS` ≈ 1 s, phase-offset by an id hash so they don't all fire on
  the same tick) **or** if a predator is within `THREAT_INTERRUPT_RANGE` (a cheap per-tick interrupt, so
  fleeing isn't delayed). Between thinks it holds state and just follows its path. THE scaling lever:
  `stepOne`/`stepHunger` run for the handful near the colony + ~`mobs/N` elsewhere, not all ~900–1650.
- [x] **Elapsed-tick scaling (`_thinkDtTicks`/`tickScale`).** Every time-based accumulator — eat progress,
  flee stamina, hunger/fatigue, blood loss/regen, wound heal, clot, weather, **malnutrition**
  (`driveNeedConditions` gained a `tickScale` param) — scales its per-think delta by the ACTUAL ticks
  elapsed since the mob last thought, so an off-bubble animal drains/recovers at the **same real rate** as
  in-bubble, just in coarser steps. The gap is `turn - lastThinkTick` (NOT a fixed `N`), so a
  threat-interrupt that makes a mob think every tick doesn't drain stamina 60× too fast.
- [x] **Cheap per-tick off-bubble wander.** Off-bubble benign-state mobs (`Wander`/`Grazing`) still call
  `wanderStep` every tick in the throttle gate (an 8-neighbour scan, near-free — it early-outs mid-step),
  so they don't look frozen between thinks. Only the *decisions* are coarse; roaming matches in-bubble.
  (Trace: `findNearbyWalkable` 1.6% — the wander cost, confirmed cheap.)
- **Behaviour fixes that rode along** (correctness, not perf): soft territory leash with **overstretch**
  (a hunter can chase/eat past `lairRange` then is pulled home — fixes the Hunting↔Wandering boundary
  oscillation), sleep-or-return-home safety net, and the `Exhausted`-state flee-oscillation fix.

---

## BREAKTHROUGH 2 — Incremental-only terrain (the FPS lever) — SHIPPED (ADR-026)

The headline FPS fix (supersedes **R2**). **No full-map rebuild on a per-tick delta** — repaint only the
changed cells + their dependents; a full O(map) pass is legal ONLY on a new-map load. Codified as
**[ADR-026](../../game/DECISIONS.md)** and enforced by a codegraph `restricted-callee` rule. See ADR-026
for the full design; the wins:

- [x] **Changed-tile channel.** `mainTileDeltas` (main-thread mirror of the worker's `tileDeltas`) records
  each `worldMapDelta` coord `simWorkerClient` merges; `redrawOverlayNow` DRAINS them and repaints just
  those cells via `applyTileToGrid` — killing the O(562k) ref-scan AND the `buildGameGrid` flood.
  (`generateBatchVertexData` **19.7% → 0.4%**, `getTilesInRegion`+`setTile` off the top.)
- [x] **Buildings/blueprint diffed** (single-cell `applyBuildingToGrid`); **hidden mask updated locally**
  (`updateHiddenMaskAt` — early-outs unless a SOLID tile flips, then re-floods only the affected pocket,
  bounded by pocket size); **grove glows incremental** (per-tile emitter `Map`, `emitterForTile`).
- [x] **Per-chunk GPU invalidation.** `setGrid(grid, dirtyTiles)` stamps only the §E chunks holding a
  changed cell (`markTerrainChunksDirty`) instead of bumping the global `gridVersion` (which re-vertexed
  every visible chunk for one changed tile).
- [~] **Frozen-view bitmap cache — TRIED, REVERTED (2026-06-22).** Idea: snapshot the frozen GL frame into
  a 2D `<canvas>` overlay so the zoomed-out static view costs zero GL. It **regressed FPS** instead: the
  capture `drawImage(glCanvas)` forces a GPU→CPU pipeline sync each terrain-delta frame (the **GameCanvas
  rAF 102 ms** violation), and the overlay stacked a redundant full-screen composited layer on the still-
  present GL canvas. Reverted to the simple render-on-demand freeze (the GL canvas already retains its last
  frame when frozen — that IS the cache, at zero extra cost). The original zoom-out "hitch" is minor; if
  revisited, do it WITHOUT a per-frame GL→2D readback (e.g. a longer `FROZEN_SAFETY_MS`, or render the
  static map to a low-res GL texture once). Render-side native (GPU raster/composite) — `(root) native`
  ~50% in the zoom-out trace — is dominated by the **WeatherCanvas** 2D particle raster (up to 2400
  particles full-screen, the 631 ms violation), not terrain; gate weather harder at extreme zoom-out if it
  needs more headroom.

---

## Pass-II micro-opt items (R/S) — all landed + now trace-validated

The fresh 2026-06-22 trace **confirms** the 06-21 items that were "pending validation":

| Item | What | Status |
| ---- | ---- | ------ |
| **R1** | static light bake → per-corner splat cache (`samplePointStatic`) | ✅ validated — gone from top (was 15.3%) |
| **R2** | per-chunk incremental terrain | ✅ **superseded by ADR-026** (Breakthrough 2) |
| **R3** | gate EXPLORE ledger (`discoveredResources.buildRows`) on tab-open | ✅ validated — gone from top (was 5%) |
| **R5** | weather at reduced resolution + zoom-scaled, fillrate-bounded | ✅ validated — `WeatherCanvas.frame` ~2% (was 14.4%) |
| **R4** | `updateWorldEffectOverlays` per-frame O(mobs) | ✅ down to ~1% (viewport-bounded by the trace); revisit only if it resurfaces |
| **S1** | WASM `nearest_each` → per-tick `nearestPredatorMap` (ADR-008) | ✅ validated — `nearestPredatorMap` ~1.1% (was the O(prey×pred) loop) |
| **S2** | regrowth min-heap (`regrowthQueue`) | ✅ validated — `processResourceRegrowth` off the worker top (was 886 ms/tick) |
| **S4** | snapshot: demote 10 mob scalars to `MOB_COLD` | ✅ `syncEntities` ~2.6% worker (ships only hot scalars) |
| **S5a** | stagger the hunger/hunt wave (spawn-hunger spread + concurrent-hunt cap + jittered backoff) | ✅ landed |
| **S5b** | entity LOD | ✅ **delivered as Breakthrough 1** (complexity bubble) |
| **S3** | pathfinding at scale | ◑ **in progress** — the fleeing-prey unreachable-A* cliff fixed (2026-06-29); see below |

## What's left (the new worker ceiling)

The renderer is no longer terrain-bound; the **worker** is the constraint at the highest counts. 06-22
worker self-time: WASM spatial `wasm-fn[27]` 16.3% + `[4]` 14.0% (~30%), `advanceMobMovement` 3.7% +
`advanceAlongPath` 3.2%, `buildSharedSoftBlockedGrid` 3.9%, `blockedTiles` 2.9%.

### S3 — pathfinding at scale

- [x] **The fleeing-prey unreachable-A* cliff (2026-06-29).** On a 500² map opened up by the terrain rework
  (mountain interior → walkable `cave`; **walkable 52%**, ~129k tiles, riddled with pockets), `fleeToSafety`
  targeted a point `max(w,h)/2` (**250 tiles**) away — usually **unreachable**, and the WASM A* cap was
  `(w*h).min(100_000)`, so each fail **swept the whole 130k-tile component** (~6.7 ms). ~4–5 such flee paths/
  tick = **~28 ms = the entire tick budget → sustained 35 TPS**. Located by per-phase timing → profiler
  subtree (`stepEntities` 84% WASM A*) → `A*-STATS` (`calls=4.3 fail%=78`) → `PATHFAIL` from→to (all `flee2`,
  d=250–500). Full post-mortem in [BUGS.md](../../game/BUGS.md). Fix, four parts:
  - **Short flee burst** — `FLEE_BURST_TILES` (22) committed heading, not a map-crossing → short + reachable.
  - **Per-call A* node cap** — `spatial-core find_path` gained `max_iter` (0 = pawn default); mob `pathTo`
    passes `MOB_PATH_MAX_ITER` (8000) so a residual unreachable mob search bails <1 ms at any map size.
  - **Walkable-connectivity flood-fill** (`services/entity/connectivity.ts`) — cheap periodic component
    labelling (8-connected + corner-cut, matches A* exactly), rebuilt on a slow cadence + on map ref change.
    Target selection (forage/hunt/flee) rejects cross-component goals in **O(1)** before any A* — the
    "select reachable" model instead of "pick nearest → A* → fail → bail". Worker-side TS singleton like the
    thermal field / wild-growth set (a labelling pass, not a per-query spatial service; ADR-008-adjacent).
  - **LOS-gate on prey** — `findNearestPrey` targets only reachable **and** visible prey.
  - Instrumentation (`PHASE-MS` / `A*-STATS` / `PATHFAIL`) kept in-tree, gated behind the Debug-mode toggle.
- [ ] **Still open: `buildSharedSoftBlockedGrid` + in-bubble A* volume.** The soft-blocked overlay is rebuilt
  per request; A* still runs for many in-bubble + threat-interrupt mobs. Levers: incremental occupancy
  (don't rebuild the blocked overlay from scratch), throttle/stagger path recomputes, reuse paths until
  invalidated. Off-bubble mobs already think rarely.

## Path to 1000² (1,000,000 tiles, ~1650 mobs)

The architecture extends directly — the user measured 1000²@1650 mobs at sub-10 TPS, which the LOD crank
closes without new micro-opt:

- [ ] **Extend off-bubble tick interval.** Raise `AI_THROTTLE_TICKS` for the outermost mobs (a 1 s think is
  generous; 2–4 s off-screen is imperceptible). The elapsed-tick scaling already keeps bars correct at any
  interval, so this is a constant bump, not a rewrite.
- [ ] **Layered bubbles (tiered LOD).** Instead of one `LIVE_RADIUS` cliff, add concentric tiers with
  progressively slower think cadence (e.g. live → 1 s → 4 s → "frozen, movement-only"), each tier a wider
  ring around the live pawns. Mobs in the outer tiers cost almost nothing.
- Terrain is already O(changed) regardless of map size (ADR-026), and render is O(visible) (§E chunks), so
  **map area barely affects FPS** — 1000² terrain/render is essentially free; only the mob sim scales.

---

## Pass III — the per-mob vision/light tax + the snow-onset freeze (2026-07-16)

A 500² winter save fell to ~40 TPS, **flat across 1×/2×/4×** (⇒ compute-bound: one ~25 ms tick per batch).
Two independent, both **worker-side** causes, each located by measurement (headless CPU profiler + the
in-tree `PHASE-MS` / `A*-STATS`), not by guessing — the recurring session lesson was *prove, don't assume*
(stealth and the snow chunk were each suspected and **disproved** by an A/B before the real cause was found).

### The vision/light tax (the TPS cap) — SHIPPED

`es:step` (mob AI) was the whole tick. Self-time profiling of `stepEntities` put ~45% of the mob step in
**vision/lighting recomputed per in-bubble mob per tick, uncached**:

- [x] **`livingPartNightVision` regression (from `d555950d`, 2026-07-09).** "Scarring mechanics" turned mob
  `getNightVision` from an O(1) `def.nightVision` read into a **full-anatomy walk every call** (~15% of the
  step) that summed to 0 for every non-arachnid. Gated behind a per-`creatureId` cache of "does this body
  plan have any NV-granting part" → O(1) for the common creature (`core/vision.ts`).
- [x] **`getNightVision` computed twice/mob/tick** in `stepOne` (once for `mel`, once inside
  `effectiveVisionRange`) → computed once and threaded in.
- [x] **`buildingLight` def-lookup per building per mob.** `computeTileLightLevel` re-resolved every
  building's light (`getBuildingById`) every call → lit emitters resolved **once per `buildings`-array ref**
  (`litBuildingSources`).
- [x] **`getAmbientLight` per mob → per turn** (keyframe interp is identical for all mobs in a tick;
  memoised by `turn`).
- [x] **Grove-glow O(all glows) per mob → spatial grid.** The glow loop scanned **every glow on the map**
  per mob — cost ∝ map area, so a 500² map paid ~2.7× a small map's per-call cost (THE live-vs-bench gap).
  A uniform-cell bucket index (`groveGrid`, rebuilt only on worldMap-ref change) makes it O(nearby).
  **Proven map-size-independent: 358 ns/call @ 240² vs 361 ns/call @ 500².**
- Net: `es:step` 10.5 → 1.8 ms at a sparse-mob moment; the grove grid removes the 500²-map inflator that
  had pushed a winter colony's `es:step` back to ~12 ms (the cap).

### The snow-onset freeze (the 4× hang) — SHIPPED

Hitting snow at 4× froze the game (the long-known snow hiccup, escalated to a full freeze at speed).

- [x] **`accumulateSnow` was an O(map) scan run as ONE atomic tick** (all ~562k tiles every
  `snowInterval`=750 ticks). The batch budget is checked only *between* ticks, so a single O(map) tick can't
  be time-sliced — and at 4× it recurred 4× more often in real time. Now **chunked**: a rolling band of rows
  each tick (`GameEngineImpl._snowScanRow` cursor) covers the map every `snowInterval` ticks, with `hours`
  scaled to the sweep so accrual/melt rate is exactly preserved. Spreads the onset delta wave across the
  sweep instead of one spike.
- [x] **`drainTileDeltasBudgeted` re-walked a saturated queue O(n)/flush.** When snow marking outran the
  3000/flush drain, the loop iterated every held-back entry (~map size) each flush. Split `dirty` into
  separate terrain/snow maps so the snow drain stops at the budget → O(budget)/flush (`core/tileDeltas.ts`).
- Confirmed post-fix: `env:snowIce` = 0.07 ms/tick.

### What's still open after Pass III

- [ ] **Full 4× under heavy winter mob load** still needs the **complexity-bubble tuning** from "Path to
  1000²" (extend off-bubble interval / layered bubbles) — `stepOne`'s core (FSM + `nearestPawn` + LOS) is
  ~35% of the step, so per-mob micro-opt alone won't quadruple TPS when many mobs are in-bubble.

---

## Method (Pass-I trace methodology, reused)

Electron Performance trace → `/tmp/parsetrace.mjs` parses the V8 CPU-profiler chunks for **per-thread
per-function self-time**. Newest: `.debug/Trace-20260622T181035.json.gz`. **Pre-flight every hot-path /
snapshot-boundary change against [ENGINE-PERFORMANCE.md](ENGINE-PERFORMANCE.md)** (no per-tick alloc on the
peace path; don't churn array refs; keep the snapshot slim) and re-check `perf.log` + a fresh trace after —
the recurring trap is fixing one cost while reopening another.

**Headless CPU profiler (Pass III, no Electron needed).** A throwaway vitest drives the REAL pipeline —
`buildProfilerScenario({pawns, mobs})` → warm → `entityService.stepEntities(state)` in a loop — inside a
`node:inspector` `Session` (`Profiler.start`/`stop`, 50 µs sampling), aggregating each node's `hitCount`
into per-function self-time. It reproduced the live `es:step` faithfully and located `computeTileLightLevel`
in minutes. Pair it with an **A/B toggle** (a `globalThis` flag the hot function early-outs on) to *prove*
a suspected cost before optimising — this pass disproved "it's stealth" and "it's the snow chunk" that way.
Delete the probe test + toggle when done. `A*-STATS`/`PATHFAIL` (Debug-gated) confirm pathfinding is/ isn't
the driver without any new code.

## Status

**SHIPPED + validated in-game 2026-06-22.** 750² @ 120 FPS / 60 TPS @1×, ~120 TPS @4×.
**Pass III (2026-07-16) SHIPPED + confirmed in-game:** fixed the per-mob vision/light tax (a 500² winter
save's ~40 TPS cap) and the snow-onset freeze at 4×. Remaining open work: **S3** (pathfinding at scale), the
**1000² LOD crank**, and **complexity-bubble tuning** to unlock full 4× under heavy winter mob load — all
incremental, none blocking.
