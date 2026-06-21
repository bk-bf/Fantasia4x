<!-- LOC cap: 400 (created: 2026-06-21) -->

# ENGINE-PERFORMANCE-II — the 750² + high-entity load

> **Related:** [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (Pass I — worker cutover, snapshot slimming, chunked terrain, render-on-demand) · [ROADMAP](ROADMAP.md) · [DISTRIBUTION](DISTRIBUTION.md) · [[immutable-pattern-is-the-sim-perf-tax]] · [[cross-check-engine-perf-spec]]

## Why this exists

Pass I tuned the **38k-tile / few-hundred-mob** slice to 200+ TPS @4× and flat 60 TPS. The user then
loaded a **750×750 map (562,500 tiles) + up to 1650 mobs** to expose the next ceiling. It did:

- **TPS collapses with mob count** (`perf.log`, 2026-06-21): `mobs=1650 → tps=2–4`; `mobs=958 → 13–26`;
  `mobs=0 → 60`. **Pawns are irrelevant (5); MOBS drive it.**
- **FPS sub-10 even PAUSED while panning** — the renderer rebuilds terrain chunks at the pan margin and
  re-bakes lighting every rebuild.

**Goal:** 120 FPS / 60 TPS @1× under this load (or as close as the algorithms allow; 60 TPS at 1650
mobs may need entity-LOD, see S5).

## Method (Pass-I trace methodology, reused)

Electron Performance trace `Trace-20260621T203947.json.gz` (paused-pan, then unpaused). Parsed the V8
CPU profiler chunks for **per-thread per-function self-time** (`/tmp/parsetrace.mjs`). Headline self-time:

| Thread | Function | self | note |
| ------ | -------- | ---- | ---- |
| **Renderer** | `generateBatchVertexData` | **19.7%** | terrain vertex rebuild |
| Renderer | `samplePointStatic` | **15.3%** | per-tile-corner light bake, **loops ALL emitters** |
| Renderer | `buildRows` + `rebuildNow`+`rgb` (discoveredResources) | **~7%** | whole-map EXPLORE-ledger scan |
| Renderer | `updateWorldEffectOverlays` | **4.6%** | per-frame O(mobs) alloc chains |
| Renderer | `getTilesInRegion`+`setTile` | **~2.3%** | `buildGameGrid` is still O(map) (§E follow-up) |
| **Sim** | `stepHostile`+`stepAnimal` | top | per-mob AI |
| Sim | `nearestPredatorThreat` + `dist` | high | **O(prey × predators)** per tick |
| Sim | `processResourceRegrowth` | 886ms | **full 562k-tile pre-scan EVERY tick** |
| Sim | wasm spatial + `buildPathfindingGridsSoftBlocked` | high | per-mob A* + soft-block grid rebuild |
| Sim | `slimEntity`/`syncEntities` | mod | snapshot scales with mob count |

---

## Renderer (FPS) — prioritised

- [ ] **R1 — Static light bake is O(tiles × all-emitters), re-run every chunk rebuild (≈35% combined).**
  `LightingService.samplePointStatic` loops **every** emitter per tile-corner; `collectResourceEmitters`
  scans all 562k tiles → potentially thousands of grove-glow emitters; both re-run on each terrain
  rebuild (and chunks rebuild constantly while panning). The point light is **flicker-free / static**, so
  it should be computed **once per emitter-set change**, not per rebuild.
  - **(a) Cache the per-tile static light** in a `Float32Array(w*h*3)` keyed by `lightVersion`; chunk
    rebuilds read it (O(1)/tile) instead of re-sampling.
  - **(b) Spatially bucket emitters** (coarse grid); the bake samples only emitters in a tile's bucket +
    ring → O(tiles × nearby) when (a) is recomputed.
  - **(c) Cull grove glows at scale** — cap count / merge nearby / skip when zoomed past a threshold;
    thousands of sub-pixel glows aren't visible.
- [ ] **R2 — `buildGameGrid` is whole-map O(562k)** (`getTilesInRegion`+`setTile`, the §E follow-up):
  `redrawOverlayNow` floods all tiles into a fresh `GameGrid` on each terrain-change event. Make it
  **per-chunk dirty** — the worker already ships `worldMapDelta`s; invalidate only changed chunks, build
  grid tiles lazily per visible chunk. Removes the O(map) flood + the per-tile `setTile` churn.
- [ ] **R3 — `discoveredResources.buildRows` scans all 562k tiles on the RENDER thread** per turn-bucket
  (7%). Options: move to the worker; make it incremental (resource deltas); or only rebuild while the
  EXPLORE tab is open. It feeds a tab most ticks don't show.
- [ ] **R4 — `updateWorldEffectOverlays` is per-frame O(1650 mobs)** with `.map/.filter` allocation chains
  (4.6%). Viewport-cull to on-screen mobs first; reuse buffers; throttle. (Also gate on the render-on-
  demand freeze where possible.)

## Sim (TPS) — prioritised

- [ ] **S1 — Entity AI nearest-X queries are O(N²) (the TPS killer).** `nearestPredatorThreat` (and the
  prey/threat scans) loop the whole predator/prey subset **per mob**, every tick → ~10⁵–10⁶ `dist` calls
  at 1650 mobs. **Put nearest-entity behind a spatial index** — a uniform grid, or the existing WASM
  spatial-core nearest-entity query (**ADR-008**: spatial queries belong in the spatial service). Turns
  O(prey × allPredators) into O(prey × nearbyBucket). Single biggest TPS lever.
- [ ] **S2 — `processResourceRegrowth` full-map pre-scan every tick (886ms).** It scans all 562k tiles
  every tick just to detect an expired cooldown. Replace with a **min-heap / sorted queue of next-
  regrowth times** (or a dirty-set of tiles-on-cooldown); the per-tick check becomes O(1)–O(#expiring).
- [ ] **S3 — Pathfinding at scale.** `buildPathfindingGridsSoftBlocked` overlays entity occupancy on the
  (cached) base grid per pathfind, and A* runs for many mobs. Levers: **incremental occupancy** (don't
  rebuild the blocked overlay from scratch), **throttle/stagger** path recomputes (not every mob every
  tick), **cap A* calls/tick**, and reuse paths until invalidated.
- [ ] **S4 — Snapshot scales with mob count** (`slimEntity`/`syncEntities`). Already slimmed in Pass I §D8/
  §F; at 1650 mobs revisit per-id `EntitySync` deltas + a hard floor on per-mob bytes. Lower priority
  than S1/S2.
- [ ] **S5 — Entity LOD (design lever, likely required for 60 TPS @1650).** Simulate **distant / off-
  screen / inactive** mobs at a reduced cadence (every N ticks) or with a cheaper FSM; full rate only
  near the colony / in active chunks. Also re-examine the lair spawn model — is 1650 concurrent mobs
  intended, or runaway spawning? Caps + LOD make the headline number achievable where pure micro-opt
  can't.

---

## Suggested order (ROI × unblocking)

1. **S2** (regrowth queue) — isolated, pure win, kills an 886ms/tick full-map scan. Easy.
2. **R1** (cache static light) — biggest single renderer win (~35%), unblocks smooth panning.
3. **S1** (spatial nearest-entity) — biggest TPS win; needs the spatial-service seam (ADR-008).
4. **R2** (per-chunk grid build) + **R3/R4** (move/cull EXPLORE ledger + cull overlays).
5. **S3** (pathfinding throttle/incremental), **S4** (snapshot), then **S5** (entity LOD) if 60 TPS @1650
   still isn't met by S1–S3.

**Pre-flight every change against [ENGINE-PERFORMANCE.md](ENGINE-PERFORMANCE.md)** (no per-tick alloc on
the peace path; don't churn array refs; keep the snapshot slim) and re-check `perf.log` + a fresh trace
after — the recurring trap is fixing one cost while reopening another.

## Status

Spec written from the 2026-06-21 trace. No implementation started — awaiting go-ahead on order.
