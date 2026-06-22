<!-- LOC cap: 400 (created: 2026-06-21; VICTORY 2026-06-22) -->

# ENGINE-PERFORMANCE-II — the 750² + high-entity load

> **Related:** [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (Pass I — worker cutover, snapshot slimming, chunked terrain, render-on-demand) · [DECISIONS §ADR-026](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [DISTRIBUTION](DISTRIBUTION.md) · [[immutable-pattern-is-the-sim-perf-tax]] · [[cross-check-engine-perf-spec]]

## 🏆 VICTORY (2026-06-22, validated in-game)

**A 750×750 map (562,500 tiles) now runs at 120 FPS / 60 TPS @1×, and 4× climbs to ~120 TPS smoothly.**
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

## 🧠 BREAKTHROUGH 1 — Entity complexity bubble (the TPS lever) — SHIPPED

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

## 🗺️ BREAKTHROUGH 2 — Incremental-only terrain (the FPS lever) — SHIPPED (ADR-026)

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
| **S3** | pathfinding at scale | ◻ **now the dominant worker cost** — see below |

## What's left (the new worker ceiling)

The renderer is no longer terrain-bound; the **worker** is the constraint at the highest counts. 06-22
worker self-time: WASM spatial `wasm-fn[27]` 16.3% + `[4]` 14.0% (~30%), `advanceMobMovement` 3.7% +
`advanceAlongPath` 3.2%, `buildSharedSoftBlockedGrid` 3.9%, `blockedTiles` 2.9%.

- [ ] **S3 — pathfinding at scale.** Biggest remaining lever. `buildSharedSoftBlockedGrid` rebuilds the
  soft-blocked overlay; A* runs for many mobs. Levers: incremental occupancy (don't rebuild the blocked
  overlay from scratch), throttle/stagger path recomputes, cap A*/tick, reuse paths until invalidated.
  Off-bubble mobs already think rarely — so most A* is in-bubble + threat-interrupt fleeing.

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

## Method (Pass-I trace methodology, reused)

Electron Performance trace → `/tmp/parsetrace.mjs` parses the V8 CPU-profiler chunks for **per-thread
per-function self-time**. Newest: `.debug/Trace-20260622T181035.json.gz`. **Pre-flight every hot-path /
snapshot-boundary change against [ENGINE-PERFORMANCE.md](ENGINE-PERFORMANCE.md)** (no per-tick alloc on the
peace path; don't churn array refs; keep the snapshot slim) and re-check `perf.log` + a fresh trace after —
the recurring trap is fixing one cost while reopening another.

## Status

**SHIPPED + validated in-game 2026-06-22.** 750² @ 120 FPS / 60 TPS @1×, ~120 TPS @4×. Remaining open
work: **S3** (pathfinding at scale) and the **1000² LOD crank** (extend off-bubble interval + layered
bubbles) — both incremental, neither blocking.
