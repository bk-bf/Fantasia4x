<!-- LOC cap: 400 (created: 2026-06-14, rewritten 2026-06-14 post-profiling) -->

# ENGINE PERFORMANCE & SCALING

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-008, ADR-014, ADR-018/019/020/021) · [game/BUGS](../../game/BUGS.md) · [RANGED-COMBAT](RANGED-COMBAT.md) (consumes LoS) · [SEASONS_WEATHER](SEASONS_WEATHER.md) (fog of war) · [DISTRIBUTION](DISTRIBUTION.md) · archived: [SIMULATION-PERF](../archive/SIMULATION-PERF-2026-05-30.md)

Profiling-driven performance work, measured on the heavy `--profiler` sandbox (150 pawns +
~140 mobs, 240×160 map, 4× speed; `.debug/perf.log`).

> **This spec was rewritten after the work.** Its original premise — *"O(n²) perception is the
> #1 cost, fix it with target persistence + LoS"* — was **FALSIFIED by the profiler**. Perception
> was never the bottleneck. The real costs, in the order they were found, were: a lying FPS
> counter, a pathfinding **body-block flood**, the **16-ticks-per-frame** sim multiplier, and
> **per-frame terrain re-upload/rebuild**. This document now records what actually happened, what
> landed, the tradeoffs taken, and the decouple endgame. Perception persistence + LoS survive as
> **deferred AI-correctness features (§5)**, not performance fixes.

---

## 0 · Status

- **FPS 2 → 8–10** (identical at 1× and 4×) via render/sim bug-fixes + a sim↔render decouple cap.
- Two tradeoffs are currently in place (`MAX_STEPS` cap, terrain throttle — §3); the **Web Worker
  (§4) is the next work and removes them**.
- Bugs filed in [game/BUGS.md](../../game/BUGS.md); decisions in ADR-021 (+ corrected ADR-018/020).

---

## 1 · Post-mortem — how the premise was wrong

- [x] **Perception O(n²) premise FALSIFIED.** It dominated exactly **one** capture — an *idle* moment (pawns 7 ms). Under realistic movement load the `pawns` phase was 94 ms and **pathfinding dwarfed perception ~13×**. The lesson: the first profiler run was unrepresentative; instrument under load before concluding.
- [x] **The FPS counter was lying** — `updateFPS()` discarded any frame slower than 250 ms, so below 4 fps it froze at the last healthy value. This is why the regression was invisible for so long. (Fixed; threshold → 2 s, commit `02c4dfd`.)
- [x] **"CPU asleep" was the single-thread illusion** — one core of 22 at ~90% busy ≈ 4% aggregate. Confirmed CPU-bound (not GPU: `gpuWait ~4 ms`) via the `gl.finish` probe. The sim and render share **one thread**.

---

## 2 · What actually landed (measured, free wins = real bugs)

- [x] **Profiler tooling** — honest FPS counter + per-frame `[RENDER-PROF]` (sim/overlay/renderCPU/gpuWait split, paused-vs-running tagged, bg-throttle flagged), `[SYS]` host caps, all persisted to `.debug/perf.log` via the `PERF` tag. Plus per-phase `[PROF]` + `profCount` instrumentation (`#pathReq.*`, `#pathFail.*`, `#tMiss.*`, `#terrainCacheHit`). Commits `02c4dfd`, `250b55f`, `4482dba`, `cf94bed`, `0c02800`.
- [x] **Soft-body pathfinding** (`b9726e1`) — **the big one.** Under load, 145 A*/tick with **96 % failing as `bodyBlocked`**: ADR-014 hard occupancy made every pawn/mob an impassable wall, so A* to a body-walled goal **flooded the whole reachable region** before returning empty, retried every tick. `buildPathfindingGridsSoftBlocked` makes bodies **high-cost, not walls** → A* never fails on bodies; no-stacking still enforced at the movement layer (`stepBody`). **Result: `pawns` 94 → 4 ms; `#pathReq` 145 → 0.5; `#pathFail.bodyBlocked` → 0.** (Amends ADR-014 — see ADR-021.)
- [x] **Dedicated terrain VBO** (`d2738d2`) — terrain + entity-overlay shared one VBO, so the overlay clobbered it every frame and the 38k-tile (~21 MB) terrain buffer re-uploaded every frame. Terrain now has its own VBO, uploaded only on change.
- [x] **Coalesced terrain rebuilds** (`1c4227c`) — `setGrid` bumped `gridVersion` every frame (designation/worldMap refs churn per tick), invalidating the vertex cache → 90 ms rebuild/frame (`#terrainCacheHit` was **0**). All sim-driven terrain rebuilds now coalesce to ~2/sec → cache hits. **Result: terrain pass 90 → ~10 ms on most frames; `#terrainCacheHit` > miss.**
- [x] **`MAX_STEPS_PER_FRAME` 16 → 4** (`4e6e3fc`) — the decouple cap (see §3). **Result: sim/frame 330 → ~85 ms; FPS 2 → 4–5**, then → 8 with the terrain fixes.
- [x] **Pawn `mobSubsets()` pre-filter** (`fd1163e`) — hostiles/hunt-targets filtered once/tick instead of per-pawn. Constant-factor; modest.
- [~] **Mob `mobThreatSubsets()` pre-filter** (`1b43701`) — same idea for mob predator/prey scans. **No measurable effect** (`entityStep` ~5.7 ms unchanged — the scan wasn't the cost; `entityStep` is per-mob FSM + hunt/flee A*). Kept (behaviour-preserving, better asymptotics), but **not a win.**

---

## 3 · Tradeoffs currently in place (NOT free — the Worker removes them)

- [x] **`MAX_STEPS_PER_FRAME` cap → traded TPS.** A slow frame ran 16 heavy ticks (self-perpetuating; bound identically at 1× and 4×, which is why changing speed did nothing). Capping to 4 makes render smooth but the sim runs **slower than realtime at high game-speed** (drops backlog). The Worker lets us raise this back up.
- [x] **Terrain rebuild throttle → traded latency + smoothness.** Terrain visuals lag ≤500 ms and a ~90 ms rebuild still **hitches ~2/sec** (the `terrain 30–40 ms` *average* and the `overlay ~12 ms` `buildGameGrid` scan on flush frames). Cost moved off most frames, not removed. A proper fix (designations off the static terrain layer / incremental upload) is deferred (§5).

---

## 4 · Decouple endgame — sim → Web Worker (THE NEXT WORK)

**Why:** the sim and render share one thread (the rAF loop runs `stepSimulation` then renders). That coupling is the root: any heavy sim starves render, and the `MAX_STEPS` cap is the band-aid. Moving the sim to a Worker makes render run at the display rate **regardless** of sim cost, and lets the sim run full speed off-thread → restores TPS **and** smooth FPS at once. Wrapper-agnostic (works in browser, Tauri, Electron).

**Plan (gated; each step shippable):**

- [ ] **W0 — message protocol + worker scaffold.** A `sim.worker.ts` that owns `GameEngineImpl` + services + `GameStateManager`. Define the message contract: main→worker `{cmd}` (start/stop/setSpeed/pause/player-commands), worker→main per-tick snapshot.
- [ ] **W1 — WASM in the worker.** `WasmPathfinderService` must init inside the worker (it's `browser`-gated, not window-gated; verify it loads in a Worker context). Spatial core moves with the sim.
- [ ] **W2 — state snapshot to the render thread.** Publish the minimal render set each tick (pawn/mob positions + glyphs + the bits the overlay/HUD read), not the whole `GameState`. Start with structured-clone of a slim snapshot; move hot position data to a `Float32Array` (transferable/SAB) if clone cost shows up.
- [ ] **W3 — player commands main→worker.** Designations, builds, draft orders, work settings, speed/pause routed as messages; the worker is the single owner of `GameState`.
- [ ] **W4 — save/load through the worker** (it owns state now); reconcile with `saveManager`/localStorage.
- [ ] **W5 — raise `MAX_STEPS` back up / run sim on its own clock** in the worker; render interpolates from snapshots (the renderer already interpolates sub-tile positions — half-built for this).

**Acceptance:**

- [ ] Render holds ~display-rate FPS while the sim runs heavy (no main-thread sim time in `[RENDER-PROF]`).
- [ ] TPS recovers toward target at 1× (no longer capped by `MAX_STEPS`).
- [ ] Save/load, player commands, and combat/needs behaviour unchanged (218+ tests green).

---

## 5 · Deferred (real features / bigger bets — NOT the perf fix)

- [ ] **Perception target-persistence + push alerting** (old §3 / ADR-018) — a legit **AI-correctness/feel** feature (predators commit; prey react only to perceived; attacked animals fight back), but **not** a measured perf need. Build when AI behaviour wants it, not for FPS.
- [ ] **Line of sight** (`blocksSight` + WASM raycast, ADR-019) — still wanted for gameplay (no chasing through walls) and **blocks RANGED-COMBAT** + feeds SEASONS fog. Independent of the perf work now.
- [ ] **Designations/zones off the static terrain layer** (or incremental terrain upload) — removes the §3 terrain-throttle tradeoff at the source. Render polish, do after the Worker.
- [ ] **Rust sim core** — fastest per-tick + off-thread, but a major ECS/SoA rewrite + WASM state boundary. Only if the Worker (JS sim off-thread) is still too slow at target scale.
- [ ] **SAB multicore / wrapper decision** — deferred to the DISTRIBUTION milestone (ADR-020). The wrapper is **not** a perf lever (see §6).

---

## 6 · Evaluated & rejected

| Option | Verdict | Why |
| ------ | ------- | --- |
| "O(n²) perception is #1" | **Falsified** | One idle capture; pathfinding dwarfed it 13× under load. |
| Oversized-canvas / GPU bound | **Rejected** | 0.8 MP canvas, `gpuWait ~4 ms`; it's CPU/single-thread. |
| Battery / power-saving throttle | **Rejected** | User on AC; reproduced at full clock. |
| Connectivity pre-check for unreachable A* | **Rejected** | Profiler showed 100 % of fails were `bodyBlocked` (terrain *was* reachable) — connectivity would've done nothing. Soft-bodies was the fix. |
| Per-pair-per-tick LoS | **Rejected** | O(n²×ray-len); only viable gated by persistence, which is itself deferred. |
| Switch wrapper (Electron/Tauri) **for perf** | **Rejected** | Single-thread JS either way; V8 ≈1.5–2× constant factor, not structural. Decide wrapper on distribution grounds later. |
| Fork Electron / embed SpiderMonkey | **Rejected** | Team-years / two-engine maintenance for ~zero gain. |

---

## 7 · ADRs & status

- [x] ADR-021 — Sim/render decouple: soft-body pathfinding (amends ADR-014), terrain VBO/cache, `MAX_STEPS` cap, sim→Worker. **The accepted perf direction.**
- [x] ADR-018 — **corrected**: its "perception is the #1 perf cost" premise was falsified; persistence/push retained as a deferred AI-correctness feature (§5), not a perf measure.
- [x] ADR-019 (LoS) / ADR-020 (scaling ladder) — updated to point at the real findings + the Worker.
- [ ] Re-measure on the shipped engine (WebKitGTK / V8) at the DISTRIBUTION milestone — Firefox numbers don't transfer.
