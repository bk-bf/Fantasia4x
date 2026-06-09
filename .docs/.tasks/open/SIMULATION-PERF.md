<!-- LOC cap: 250 (created: 2026-05-30) -->

# SIMULATION-PERF

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-011)

Performance + observability of the simulation tick (TPS) and the WebGL renderer (FPS).
Records what shipped, why, and what is still needed to scale to 500+ entities on
1000×1000 maps.

## Status: Phase 1 + 1.5 COMPLETE ✅ — Phase 2 (scaling) NOT STARTED

Phase 1 (steady 60 TPS + a reliable profiler) and Phase 1.5 (rAF-accumulator sim driver +
the lit-campfire / terrain-rebuild FPS fixes) are done: 60 TPS and 100+ FPS are both stable.
Phase 2 (algorithmic work for 500+ entities / 1M-tile maps) is scoped below but unscheduled.

---

## Definitions

- **Tick / TPS** — `GameEngineImpl.processGameTurn()` is one tick. `TICKS_PER_SECOND = 60`
  (`core/time.ts`). The sim is driven from the **rAF render loop** via a fixed-timestep
  accumulator (`gameState.stepSimulation()`), NOT a `setInterval` — see "Sim driver" below.
  FPS is render; TPS is simulation. They now share one main-thread loop, so a heavy frame
  no longer silently starves a separate sim timer; instead the accumulator catches up (up to
  `MAX_STEPS_PER_FRAME`).
- **Frame / FPS** — the rAF render loop in the WebGL renderer (`src/lib/webgl/`).
- **Map** — currently 240×160 = 38,400 tiles. Target: 1000×1000 = 1,000,000 tiles.

---

## Observability (the profiler)

On-demand, zero-cost-when-off, built into `GameEngineImpl`:

- `profileTurns()` / `profileTurns(false)` in the dev console toggles
  `globalThis.__profileTurns`. Each `processGameTurn()` phase is wrapped in a `t(label, fn)`
  timer that is a pass-through no-op unless the flag is set.
- Average phase timings print as `[PROF] {...}` once per in-game second and persist at
  `globalThis.__profOut`. A nested `[PROF-PAWN]` breakdown lives inside `processPawns()`,
  gated by the same flag.
- Phases measured: `needsTick`, `researchTick`, `workAssign`, `generateJobs`, `buildings`,
  `crafting`, `pawns`, `locationRenewal`, `resourceRegrowth`, `mgrUpdate`, `uiPush`.
- **Trust `__profOut` (wall-clock), NOT the TPS counter.** Under CDP/Playwright the
  turn-counter delta is unreliable: the rAF loop is throttled/paused in a hidden or
  backgrounded tab (so the sim pauses with it), and repeated HMR can stack loops.

---

## The logger (`src/lib/game/core/log.ts`)

See ADR-011 for the decision. Mechanics:

- Module-level `enabled` flag (default `false`). `setGameDebug(on)` / `isGameDebug()`
  toggle it; `globalThis.gameDebug = setGameDebug` exposes it to the dev console
  (`gameDebug(true)`).
- `glog` / `gdebug` / `gwarn` — gated no-ops. `gatedConsole` = `{ log, debug, info, warn }`
  (all gated) plus an **always-live `error`**.
- Hot-path modules silence all per-tick log/debug/info/warn with one line that shadows the
  global `console` for the whole file — **no call-site changes**:

  ```typescript
  import { gatedConsole as console } from '../core/log';
  ```

  Applied to: `WorkService`, `PawnService`, `JobService`, `ResearchService`,
  `LocationServices`.

- `GameEngineImpl` deliberately does **not** shadow `console` (its `[PROF]` output must
  print regardless of `gameDebug`); instead `debugLogPawns()` early-returns on
  `!isGameDebug()`.
- **Caveat:** arguments are still evaluated by the caller. Keep heavy work
  (`JSON.stringify`, per-pawn string building) out of gated-call argument lists, or guard it
  behind `isGameDebug()`.

### Rule for new code

New hot-path (per-tick / per-pawn) code adds the `gatedConsole as console` import rather
than calling the global `console`. New engine phases are wrapped in `t(...)` to stay
measurable.

---

## Sim driver — fixed-timestep accumulator in the rAF loop (Phase 1.5)

The sim used to run on its own `setInterval`. On a single main thread the rAF render loop
would starve that timer, so under load TPS sagged to ~20 even though a tick only costs
~1 ms. The sim is now stepped **inside the render frame** with a fixed-timestep accumulator:

- `gameState.ts` exposes `stepSimulation(frameDtMs)`. `GameCanvas.frame()` calls it once per
  rAF frame with the real elapsed time. State: `TICK_DURATION_MS = 1000 / TICKS_PER_SECOND`,
  `simAccumulatorMs`, `MAX_STEPS_PER_FRAME = 16`.
- Each frame: `simAccumulatorMs += min(dt, 250) × gameSpeed`, then
  `while (acc >= TICK_DURATION_MS && steps < MAX) { processGameTurn(); acc -= TICK_DURATION_MS; }`.
  Backlog beyond `MAX_STEPS_PER_FRAME` is dropped (`acc = 0`) so a stall can't spiral.
- `startAutoTurns()` / `stopAutoTurns()` just flip `simRunning` and reset the accumulator;
  `setGameSpeed()` applies live via the accumulator multiplier. `gameInterval` /
  `advanceTurn()` are gone.
- **Result:** TPS is decoupled from frame cost and holds a stable 60 at the target speed.
- **Trade-off:** a fully backgrounded/hidden tab pauses both render AND sim (standard for an
  rAF-driven game). If background progression is ever required, move the sim to a Web Worker
  (Option B) — out of scope for now.

---

## What shipped in Phase 1

- [x] On-demand per-phase profiler (`[PROF]`) + per-pawn breakdown (`[PROF-PAWN]`).
- [x] Gated logger `core/log.ts`; `gatedConsole as console` shim on the 5 hot services.
- [x] `GameEngineImpl.debugLogPawns()` gated behind `isGameDebug()`.
- [x] `processResourceRegrowth()` early-out: a cheap non-allocating pre-scan returns before
      the `worldMap.map(...)` rebuild when no tile has an expired cooldown this tick
      (previously it re-allocated all 38,400 tiles every tick regardless of pawns).

### Measured result (1 pawn, console NOT nullified — proves the shim works in real play)

| Phase            | Before   | After   |
| ---------------- | -------- | ------- |
| pawns            | 5.02 ms  | 0.48 ms |
| workAssign       | 0.30 ms  | 0.01 ms |
| generateJobs     | —        | 0.42 ms |
| resourceRegrowth | ~0.60 ms | 0.22 ms |
| **TOTAL**        | 6.70 ms  | 1.23 ms |

Header TPS: **48 → 60/60**. `svelte-check`: 0 errors.

---

## Renderer perf

The terrain vertex buffer is the expensive object (38,400 tiles → a ~5 MB `Float32Array` +
GPU `bufferData` upload). The guiding rule: **rebuild it only when the drawn terrain
actually changes; everything dynamic renders as a cheap per-frame overlay or a shader
uniform.**

- **Vertex cache** — `GridRenderer.getVertexData()` caches the static terrain
  `Float32Array`; invalidated by a `gridVersion` bump in `renderer-core.setGrid()`.
- **Static geometry + uniform pan/zoom** — terrain geometry is baked once at a fixed
  `BASE_TILE_PX = 16` in absolute world pixels. Pan and zoom are shader uniforms
  (`u_viewOffset`, `u_zoom`) set per frame, so panning/zooming never rebuilds the buffer.
- **Ambient + flicker as uniforms** — day/night ambient (`u_ambient`) and fire flicker
  (`u_lightFlicker`) are fragment uniforms. Baked vertex light is static point-light only,
  keyed on an emitter-set version (`LightingService.getEmittersVersion()`), so a flickering
  campfire animates with zero vertex rebuilds. No emitters → buffer never rebuilds for light.
- **Light cost scales with lit area, not map size** — the bake samples point light only for
  tiles inside the emitters' bounding box (`LightingService.getLitBounds()`, passed as
  `litBounds` to the grid renderer); tiles outside short-circuit to `ZERO_LIGHT`. A cheap
  per-corner AABB reject in `samplePointStatic` skips the `sqrt` for any remaining far tile.
- **Terrain change detection ignores invisible state** — `GameCanvas` rebuilds terrain only
  when a VISUAL signature of buildings changes (`buildingsVisualSig`: id, x, y, type, status,
  deconstructQueued, paused). It deliberately excludes `fuel`/`lit`. **This was the lit-fire
  FPS cliff:** `_processCampfireFuel()` returns a fresh `buildings` array every tick to
  decrement fuel, so the old array-identity check rebuilt all 38k tiles + re-uploaded ~5 MB
  _every frame_ while any fire burned (100+ FPS → sub-10). Fuel/lit are invisible on the map,
  so the signature now matches across ticks and the terrain buffer stays cached.
- **Entities are a per-frame overlay, not baked terrain** — pawns AND dropped/stored items
  render into a transparent `pawnOverlayGrid` rebuilt each rAF frame (items drawn first so
  pawns layer on top). Item pickups/drops/hauling — the most frequent per-tick change in an
  active base — therefore cause **zero** terrain rebuilds.
- **Drag previews on the 2D overlay** — zone-paint and select-similar drag previews draw on
  the lightweight 2D `designCanvas`, leaving the 38k-tile WebGL buffer untouched.
- **Camera follow** — lerped in the rAF loop toward the interpolated sub-tile pawn position
  (sub-tile smooth pan via `u_viewOffset`), not snapped at the store push.

### Measured result

With a campfire lit and at full zoom-out: terrain rebuilds drop from every-frame to none.
**FPS: sub-10 → 100+ stable; TPS: 60 stable.** No fire- or zoom-related regression; CPU and
RAM barely move at current scale, leaving ample headroom for Phase 2.

---

## Phase 2 — scaling to 500+ entities / 1000×1000 (NOT STARTED)

> **The flag:** even console-free, the tick is ~1.2 ms with a single pawn, and the per-pawn
> work still scales linearly. Hitting 500+ entities on 1000×1000 maps will need deeper
> algorithmic work — spread/incremental work scheduling, spatial indices, and a cooldown
> index so regrowth isn't O(map) — which is a separate effort beyond this logging fix. But
> 60 TPS is now solid at the current scale.

Concretely, the budget is 16.67 ms/tick. At ~1.2 ms/pawn, ~13 pawns saturate it; 500 would
need ~600 ms/tick. Required work:

- [ ] **Spread / incremental work scheduling** — don't run every pawn's full work
      assignment + job evaluation every tick. Time-slice across ticks (e.g. N pawns/tick) or
      event-drive re-evaluation instead of polling. `syncPawnWorkingStates` currently runs
      twice per tick.
- [ ] **Spatial indices** — replace linear nearest-entity / nearest-resource scans with the
      Rust/WASM `SpatialIndexService` (ADR-008). Keep callsites behind the TS interface.
- [ ] **Cooldown index for regrowth** — maintain a set of tiles-with-active-cooldowns so
      `processResourceRegrowth()` is O(active cooldowns), not O(map). The current early-out
      still does an O(map) scan (~0.22 ms at 38k tiles → ~6 ms at 1M tiles).
- [ ] **Chunked dirty-region terrain buffer** — today the terrain VBO is all-or-nothing:
      reuse the whole cache, or rebuild + re-upload the entire `Float32Array`. At 38k tiles
      (~5 MB) that's fine because the visual-signature gate makes rebuilds rare; at 1M tiles
      (~138 MB) a full rebuild on any single-tile change is infeasible. Split the map into
      fixed chunks (RimWorld uses ~17×17 sections), each owning a sub-range of a persistent
      VBO; on a tile change mark only its chunk dirty and re-upload that range via
      `gl.bufferSubData`. A lighting change marks every chunk overlapping the emitter AABB.
      `GameGrid` already tracks `dirtyTiles` + `clearDirtyFlags()` (currently unused by the
      renderer) and just needs a stable tile→chunk→byte-offset mapping. Prefer chunks over
      literal per-tile uploads: 1M tiny `bufferSubData` calls have prohibitive driver
      overhead, so batch dirty tiles per chunk per frame.
- [ ] **Re-profile at scale** — generate 100 / 250 / 500 pawns on a 1000×1000 map, capture
      `__profOut`, and confirm each phase stays sub-linear before raising the entity cap.

---

## Outcome

Phase 1 + 1.5: the sim holds a stable **60/60 TPS** and the renderer a stable **100+ FPS**
at current scale — including a lit campfire at full zoom-out, which previously dropped FPS
below 10. Tick cost is ~1.2 ms; the sim runs on a fixed-timestep accumulator in the rAF
loop (no starvation); the terrain buffer rebuilds only on real terrain changes (invisible
fuel/lit churn no longer triggers it); pawns and items render as a per-frame overlay;
lighting cost scales with lit area; logging is gated off by default; regrowth no longer
rebuilds the whole map each tick; a wall-clock profiler is one keystroke away. CPU/RAM have
ample headroom. Phase 2 (above) gates raising the entity/map caps.
