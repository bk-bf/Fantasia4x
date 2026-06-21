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

- [x] **R1 — static light bake cached (2026-06-21).** `LightingService.samplePointStatic` looped **every**
  emitter per tile-corner, re-run on every terrain chunk rebuild — O(tiles × emitters), 15.3% + inflating
  the 19.7% terrain rebuild. Now a **splat-built per-corner cache**: iterate emitters once per
  `emittersVersion`, add each to the corners within its radius (**O(emitters × r²)**) into a flat
  `Float32Array` over the emitter bounding box; the per-corner sample is an **O(1) lookup**. Flicker-free,
  so valid until the emitter set changes (campfire toggled / grove harvested). Falloff math is a direct
  translation of the old loop. `check`/`test` green (552). *(Follow-ups still open if needed: (b) was
  unnecessary — splatting already makes the build O(emitters×r²); (c) cull grove glows at scale only if
  the build hitch on emitter change shows up. The per-corner return still allocs a `[r,g,b]` as before —
  unchanged, not a regression.)* **Pending fresh-trace validation.**
- [ ] **R2 — `buildGameGrid` is whole-map O(562k)** (`getTilesInRegion`+`setTile`, the §E follow-up):
  `redrawOverlayNow` floods all tiles into a fresh `GameGrid` on each terrain-change event. Make it
  **per-chunk dirty** — the worker already ships `worldMapDelta`s; invalidate only changed chunks, build
  grid tiles lazily per visible chunk. Removes the O(map) flood + the per-tile `setTile` churn.
- [x] **R3 — gate the EXPLORE ledger on tab-open (2026-06-21).** After R1, `discoveredResources.buildRows`
  became the **#1 renderer cost (~33%)** in the trace — a 562k-tile scan every 15 turns on the render
  thread, running whether or not the EXPLORE tab was open (it's usually closed). Now `maybeScheduleRebuild`
  early-returns unless the tab is open; opening the tab rebuilds once if stale (`uiState` subscription).
  Closed ⇒ zero scans. `check`/`test` green (552). **Pending fresh-trace validation.**
- [x] **R5 — weather at reduced resolution (2026-06-21).** `WeatherCanvas.frame` was 14.4% (new #1 after
  R1+R3) — two full-screen ops + up to 1600 particles every frame, more when zoomed out. Now the canvas
  buffer is **`RENDER_SCALE = 0.6` × the CSS size** with a matching `ctx.setTransform`, so drawing stays
  in CSS coords (sizes / density / fall-speed preserved exactly) but rasterizes into a buffer with
  **~0.36× the fillrate** (CSS-upscaled — weather is soft, no visible loss). Zoom-out particle ramp
  softened (2.2× → 1.6×). `check`/`test` green (552). **Pending fresh-trace validation.**
  - **Follow-up (2026-06-21): zoom-range-driven scaling, fillrate-bounded.** The hardcoded `MIN_TILE`/
    `MAX_TILE` (6/40) didn't match the real per-map zoom span (a 750² map's zoom-out floor `fitTileSize`
    is ~1px), so weather flat-lined past 6px tiles on M/L maps. Now `WeatherCanvas` reads the live
    `cameraZoomRange` (`{min: fitTileSize, max: MAX_TILE_W}`, published by GameCanvas) and scales against
    it: `sizeMul` (~0.3×–1.3×) **shrinks** every particle as you zoom out and the ramp is now `densityMul`
    up to 2.4×. **Net cost stays bounded** because the 1600 count cap became fillrate-aware
    (`1600 / sizeMul`, clamped to 2400): more particles only when each is proportionally smaller, so
    total `count × size` ≤ the old worst case (constant for rain-streak length, lower for snow/dust area).
    `check`/`test` green (552).
- [ ] **R4 — `updateWorldEffectOverlays` is per-frame O(1650 mobs)** with `.map/.filter` allocation chains
  (4.6%). Viewport-cull to on-screen mobs first; reuse buffers; throttle. (Also gate on the render-on-
  demand freeze where possible.)

## Sim (TPS) — prioritised

- [~] **S1 — WASM spatial-core nearest-entity query (2026-06-21).** Added `nearest_each(points, queries,
  maxDist) -> Int32Array` to the Rust spatial-core (`spatial-core/src/lib.rs`) — a uniform grid (cell =
  `maxDist`, 3×3 cell scan), built + rebuilt WASM via `pnpm add:wasm`. Exposed as
  `wasmPathfinderService.nearestEach` (ADR-008). **`nearestPredatorThreat` rewired**: the prey→nearest-
  predator map is now computed **once per tick** via one batch call (`nearestPredatorMap`, keyed on the
  allMobs ref) instead of the O(prey × predators) double loop — the lookup is O(1). JS fallback keeps it
  identical until the WASM inits in the worker (exercised by `entitySim.test.ts`, 20 tests green).
  `check`/`test` green (552). **Pending fresh-trace validation.** **Same-pattern follow-up:**
  `findNearestPrey` (O(predators × prey)) and `nearestPawn` can reuse `nearestEach` + the per-tick cache.
- [x] **S2 — regrowth min-heap (2026-06-21).** Replaced the per-tick full-map cooldown scan (886ms) with
  a **min-heap of `(turn, x, y)`** (`systems/regrowthQueue.ts`): the engine peeks O(1) ("anything due?")
  and drains only the due tiles. Fed at the harvest set-site (`jobs/harvest.ts` pushes a tile's soonest
  cooldown) + rebuilt once on a worldMap REPLACE (load/regen/test, ref change). Stale entries (re-
  harvest / already done) pop and skip; processed tiles re-queue their next-soonest. `processResource-
  Regrowth` common case is now O(1). `check` green; `resourceRegrowth.test.ts` (4) + full suite (552)
  green. **Pending fresh-trace validation.**
- [ ] **S3 — Pathfinding at scale.** `buildPathfindingGridsSoftBlocked` overlays entity occupancy on the
  (cached) base grid per pathfind, and A* runs for many mobs. Levers: **incremental occupancy** (don't
  rebuild the blocked overlay from scratch), **throttle/stagger** path recomputes (not every mob every
  tick), **cap A* calls/tick**, and reuse paths until invalidated.
- [~] **S4 — snapshot at scale (2026-06-21, partial).** After S1 the worker→main snapshot is the biggest
  remaining cost (~12.5% worker + ~14% render in the 3rd trace) — all 958 mobs ship their HOT projection
  every flush. A main-thread read-audit shows the renderer reads only `x/y/id/state/isAlive/eatProgress/
  health/maxHealth/creatureId/path` per-frame off a mob; the rest is worker-AI- or selected-card-only.
  **Demoted 10 rarely-changing mob scalars to `MOB_COLD`** (`stateSince`, `targetPawnId`, `diedAt`,
  `huntTargetId`, `hunt/forageCooldownUntil`, `blockedTicks`, `pain`, `blood/maxBloodVolume`) so they
  ship **only on change** (per-field ref-diff; the card reads the mirror's last value via the
  `{...prev,...u}` merge). Idle mobs now cost only their hot scalars. `check`/`test` green (552). **Pending
  fresh-trace validation. Remaining S4 lever:** skip mobs whose HOT projection is unchanged (idle/not-
  moving) — needs a hot-field diff, more involved.
- [x] **`syncFractureConditions` gated (2026-06-21).** It scanned every mob's limbs/parts every tick
  (6.2% of the worker) even for uninjured mobs. Now skipped unless `pain > 0` or a `fractured` condition
  exists (a fracture is a painful structural wound, so a healthy mob has nothing to sync; the condition
  check still clears it the tick a bone knits). `fractures.test.ts` (8) green.
- [~] **`findNearestPrey`/`nearestPawn` (deferred).** `nearestPawn` is O(mobs × 5 pawns) — already cheap.
  `findNearestPrey` has corpse-weighting (×0.5) + **per-species conspecific exclusion**, so it doesn't map
  to a single `nearest_each`; it'd need per-species indices. Not worth it vs S3/S5.
- [~] **S5a — stagger the hunger/hunt wave (2026-06-21).** Root cause of the combat-stress collapse: every
  mob spawned at `hunger: 0` (`entitySpawning.ts`), so they all crossed `HUNGER_EAT_THRESHOLD` on the SAME
  tick → hundreds of simultaneous hunt→combat engagements (a thundering herd) that spiked the worker and
  starved even the pause message (the "pause doesn't pause under load" report). Fixes: (1) **randomise
  spawn hunger** uniform over `[0, threshold)` (+ small fatigue spread) so first-hunts smear across the
  fill window; (2) **concurrent-hunt cap** — a per-tick slot budget (`max(40, 0.15 × mobs)` − mobs already
  Hunting/Attacking) gates new OFFENSIVE live-prey hunts; corpse-scavenging + resuming an existing fight
  are never gated. (3) **jittered busy-backoff** — when the budget denies a hunt, the mob is stamped with
  a randomised `huntCooldownUntil` (`[4s, 20s]`) so it does NOT re-run the O(prey) `findNearestPrey` every
  tick (that retry was itself O(denied × prey) — back toward O(N²)), AND the denied hunters don't all
  retry on the same tick and re-form the wave. Deterministic (seeded). `entitySim.test.ts` (20) green and
  **8.9s → 1.7s**. **Pending live validation** (cap fraction + backoff are tunable). NB: the "pause
  failing" was the main thread locked by the combat-wave snapshot-apply, not a pause bug — bounding the
  wave restores responsiveness.
- [ ] **S5b — Entity LOD (still open for the highest counts).** Simulate **distant / off-
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
