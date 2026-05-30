<!-- LOC cap: 250 (created: 2026-05-30) -->

# SIMULATION-PERF

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-011)

Performance + observability of the simulation tick (TPS) and the WebGL renderer (FPS).
Records what shipped, why, and what is still needed to scale to 500+ entities on
1000×1000 maps.

## Status: Phase 1 COMPLETE ✅ — Phase 2 (scaling) NOT STARTED

Phase 1 (steady 60 TPS at current scale + a reliable profiler) is done. Phase 2
(algorithmic work for 500+ entities / 1M-tile maps) is scoped below but unscheduled.

---

## Definitions

- **Tick / TPS** — `GameEngineImpl.processGameTurn()` is one tick. `TICKS_PER_SECOND = 60`
  (`core/time.ts`). The sim runs on a `setInterval` in `gameState.ts startAutoTurns()` at
  `1000 / (TICKS_PER_SECOND × gameSpeed)` ms. FPS is render; TPS is simulation. They are
  independent except that a long main-thread render frame can starve the sim timer.
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
  turn-counter delta is unreliable: timer scheduling + repeated HMR can stack duplicate
  `setInterval` loops and report >60 TPS.

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

## Renderer perf (prior work, summarised here for completeness)

The FPS-side fixes that preceded this — both FPS and TPS collapse on zoom-out shared one
cause: the terrain vertex buffer was rebuilt every frame.

- **Vertex cache** — `GridRenderer.getVertexData()` caches the static terrain
  `Float32Array`; invalidated by a `gridVersion` bump in `renderer-core.setGrid()`.
- **Static geometry + uniform pan/zoom** — terrain geometry is baked once at a fixed
  `BASE_TILE_PX = 16` in absolute world pixels. Pan and zoom are shader uniforms
  (`u_viewOffset`, `u_zoom`) set per frame, so panning/zooming never rebuilds the buffer.
- **Ambient + point light as uniforms** — day/night ambient is a fragment uniform
  (`u_ambient`); baked vertex light is point-light-only and only refreshes when a campfire
  is active. No emitters → buffer never rebuilds for light.
- **Drag previews on the 2D overlay** — zone-paint and select-similar drag previews draw on
  the lightweight 2D `designCanvas`, leaving the 38k-tile WebGL buffer untouched.
- **Camera follow** — lerped in the rAF loop toward the interpolated sub-tile pawn position
  (sub-tile smooth pan via `u_viewOffset`), not snapped at the 15 Hz store push.

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
- [ ] **Re-profile at scale** — generate 100 / 250 / 500 pawns on a 1000×1000 map, capture
      `__profOut`, and confirm each phase stays sub-linear before raising the entity cap.

---

## Outcome

Phase 1: the sim holds 60/60 TPS at current scale; tick cost is down from ~6.7 ms to
~1.2 ms; logging is gated off by default with a runtime `gameDebug(true)` toggle; regrowth
no longer rebuilds the whole map each tick; a reliable wall-clock profiler is one keystroke
away. Phase 2 (above) gates raising the entity/map caps.
