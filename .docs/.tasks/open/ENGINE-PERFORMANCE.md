<!-- LOC cap: 400 (created: 2026-06-14, rewritten 2026-06-14 post-profiling; worker shipped 2026-06-14; scaling pivot → Rust-SoA core 2026-06-14) -->

# ENGINE PERFORMANCE & SCALING

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-008, ADR-014, ADR-018/019/020/021, ADR-022) · [game/BUGS](../../game/BUGS.md) · [RANGED-COMBAT](RANGED-COMBAT.md) (consumes LoS) · [SEASONS_WEATHER](SEASONS_WEATHER.md) (fog of war) · [DISTRIBUTION](DISTRIBUTION.md) · archived: [SIMULATION-PERF](../archive/SIMULATION-PERF-2026-05-30.md)

Profiling-driven performance work, measured on the heavy `--profiler` sandbox (150 pawns +
~140 mobs, 240×160 map, 4× speed; `.debug/perf.log`).

> **Target scale (the goal this must serve):** ~50 pawns, **200–500 total entities**, a
> **1000×1000 map**. The measured ceiling below proves single-thread JS cannot reach it — so the
> **active direction is now a Rust-SoA simulation core** behind the worker boundary (see ★ ACTIVE,
> below). Everything else in this doc is either the shipped JS-era work (historical record, §1–§7)
> or **parked until the core lands**.

> **This spec was rewritten after the work.** Its original premise — *"O(n²) perception is the
> #1 cost, fix it with target persistence + LoS"* — was **FALSIFIED by the profiler**. Perception
> was never the bottleneck. The real costs, in the order they were found, were: a lying FPS
> counter, a pathfinding **body-block flood**, the **16-ticks-per-frame** sim multiplier, and
> **per-frame terrain re-upload/rebuild**. This document now records what actually happened, what
> landed, the tradeoffs taken, and the decouple endgame. Perception persistence + LoS survive as
> **deferred AI-correctness features (§5)**, not performance fixes.

---

## 0 · Status

- **Render decoupled, shipped:** FPS 2 → 8–10 (main-thread fixes), then **→ 35–80** with the **sim
  moved to a Web Worker** (§4, W0–W5 shipped, flag-gated `?simworker`). `[RENDER-PROF]` shows
  **`sim 0.0`** on the render thread — render is no longer the bottleneck.
- **Sim ceiling found, and it's structural.** With the sim off-thread, the worker is **compute-bound
  on one core**: 240×160 + 290 entities = **28–38 ms/tick** (`[SIM-TPS]` `busy≈100 %`), so ~26–36 TPS
  = **0.4–0.6× realtime** under load. Cost is the *aggregate* of 290 entities running full FSM +
  needs + combat at 60 Hz (no single bug to delete; `pawns` 8–12 ms, `entityStep` 7–8 ms, `combat`
  0.45→4.75 ms as the colony activates). See §8.
- **DECISION (2026-06-14): build a Rust-SoA simulation core.** The target scale (200–500 entities,
  1000×1000 = 26× the tiles) is **10–50×** beyond this; surgical JS cuts buy only 2–3×. Single-thread
  JS is structurally insufficient → **★ ACTIVE direction below.** The worker boundary is the seam it
  plugs into; the render-side wins stay. **Per-tick surgical JS optimisation is HALTED.**
- Bugs filed in [game/BUGS.md](../../game/BUGS.md); decisions in ADR-021 + **ADR-022 (Rust-SoA core, to write)**.

---

## ★ ACTIVE — Scaling pivot: Rust-SoA simulation core

**Everything in §1–§7 is the shipped JS-era record. THIS is the work going forward. All boxes open
until the core lands; the parked items elsewhere stay parked.**

### Verdict (data-backed — see §8 for the capture)

- Measured: 240×160 + 290 entities → **28–38 ms/tick, one core at 100 %**, ~0.4–0.6× realtime.
- Target: ~50 pawns, **200–500 entities**, **1000×1000** map = ~2× entities **and 26× map area**.
- Surgical JS cuts ≈ 2–3×; need 10–50×. **Single-thread JS cannot get there.** The walls are
  *structural, not bugs*:
  - [x] **Immutable object-graph state** — every phase `{...spread}`/`.map()` allocates → GC churn smeared across all phases; worsens with entity count.
  - [x] **Full-map per-tile passes scale with area** — the regrowth pre-scan (and any fog/designation pass) walks every tile each tick: 0.3 ms at 38k tiles → ~8–13 ms at 1M.
  - [x] **`WorldTile[][]` = one object per tile** — 1M tile objects is unviable for memory *and* for the snapshot/save clone.

### Decision & rationale

Build the sim core as **Struct-of-Arrays over typed buffers, in Rust→WASM**, behind the existing
worker message boundary. The decisive lever is the **SoA data layout** (kills GC, cache-friendly,
enables `SharedArrayBuffer` multicore); the language is secondary, and the data-model work is
identical whether the target is TS or Rust — so go straight to Rust for: contiguous no-GC arrays,
`rayon` multicore (22 cores idle today), and because the **spatial core already proves the
Rust/WASM pipeline** (ADR-008). "Can't be worse than JS-over-typed-arrays, same work either way."

### Reusable — NOT wasted by this pivot

- [x] Worker boundary, `outputSink`/`commitSink` decouple, serializable **command registry**, and the
  **snapshot protocol** = the exact integration seam the core plugs into (commands in, snapshot out).
- [x] Render-side wins stay regardless of sim core: soft-body pathfinding, terrain VBO, `_terrainRev`.

### Plan (R-phases — all OPEN, gated, each shippable)

- [ ] **R0 — SoA data model.** Re-express the hot state of `core/types.ts` as parallel typed arrays
  (entity x/y/state/needs/…); **chunked worldMap** (tile fields in typed arrays, chunked for 1M tiles,
  no object-per-tile). This is the hard part — design it once, in Rust, mirrored by a TS view type.
- [ ] **R1 — spike + benchmark (GATE).** Port ONE subsystem (entity movement + needs) for 500 entities
  on a 1000×1000 SoA grid to Rust/WASM; benchmark vs the current JS tick. Confirms the speedup with
  real numbers before the full commit. Keep the `[SIM-TPS]`/`[PROF]` meters for the comparison.
- [ ] **R2 — hot-loop port.** Movement, needs decay, FSM, combat resolution, per-tick spatial queries
  → Rust over SoA. JS keeps the cold/complex logic (research, crafting recipes, building defs,
  world-gen, UI projection, save serialisation from snapshot).
- [ ] **R3 — state boundary.** Rust owns canonical SoA state in `(Shared)ArrayBuffer`; the renderer
  snapshot becomes a **view/slice** of those buffers (replaces the structured-clone snapshot — this is
  where the deferred Float32Array position channel + worldMap deltas actually get built); player
  commands = the existing registry, applied in Rust.
- [ ] **R4 — multicore.** `rayon` (or multi-worker over SAB) across entity batches / map chunks — the
  payoff SoA unlocks.
- [ ] **R5 — save/load from SoA + parity.** Serialise from the SoA buffers; regression-test behaviour
  against the JS reference (the 218 existing tests stay the oracle where logic is ported).

**Acceptance:** target scale (500 entities, 1000×1000) at playable TPS *and* display-rate FPS;
behaviour parity (tests green). `[SIM-TPS] busy` well under 100 % at 1×; high speeds actually multiply.

### Parked until the core lands

- [ ] The §4c "known gaps" (slim `Float32Array` channel, worldMap deltas) are **absorbed into R3** —
  wiring them into the JS sim now is throwaway (the SoA core rewrites the data model + snapshot).
- [ ] Request-response command channel (`createZoneInstance`, `craftItem`) — build once against the
  core, not the JS sim. (Until then the worker cutover stays flag-gated / default OFF.)
- [ ] Per-tick surgical JS cuts (auto-defend 60 Hz throttle, `needsTick` audit) — **halted**; only
  worth it for the current small scale, which is not the goal.
- [ ] §5 deferred features (perception persistence, LoS, designations-off-terrain) — still deferred.

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

## 3 · Tradeoffs that were in place (the Worker REMOVED them)

These were the main-thread band-aids. The worker cutover (§4) made both obsolete:

- [x] **`MAX_STEPS_PER_FRAME` cap → traded TPS.** A slow frame ran 16 heavy ticks (self-perpetuating; bound identically at 1× and 4×, which is why changing speed did nothing). Capping to 4 made render smooth but the sim ran **slower than realtime at high game-speed**. **Resolved:** under the worker `stepSimulation` is a no-op on the render thread — the render-thread cap no longer exists. The worker has its own wall-clock batch budget instead (W5).
- [x] **Terrain rebuild throttle → traded latency + smoothness.** Terrain visuals lagged ≤500 ms and a ~90 ms rebuild still **hitched ~2/sec**. **Resolved (worker):** the worker computes `_terrainRev` (a revision bumped only when the visible terrain set actually changes) so the renderer rebuilds the 38k-tile terrain only on a real change, not on clone-induced per-snapshot ref churn. (A further "designations off the static layer / incremental upload" polish remains in §5, but the freeze-frame storm is gone.)

---

## 4 · Decouple endgame — sim → Web Worker (SHIPPED, flag-gated)

**Why:** the sim and render shared one thread (the rAF loop ran `stepSimulation` then rendered). That coupling was the root: any heavy sim starved render, and the `MAX_STEPS` cap was the band-aid. Moving the sim to a Worker makes render run at the display rate **regardless** of sim cost, and lets the sim run off-thread → smooth FPS **and** best-effort TPS at once. Wrapper-agnostic (browser, Tauri, Electron).

**Plan (each step shipped):**

- [x] **W0 — message protocol + sink decouple.** `sim.worker.ts` owns `GameEngineImpl` + services + `GameStateManager`. Engine output decoupled via injected `outputSink`/`commitSink` (engine no longer imports the store). Protocol in `simProtocol.ts`.
- [x] **W1 — WASM in the worker.** `WasmPathfinderService` inits inside the worker. Verified with the `verifyWasmInWorker()` console check (`✅ WASM initialised IN the worker`). **Gotcha:** `$app/environment`'s `browser` can't bundle into a worker (Rollup can't resolve `__sveltekit/environment`) → replaced with worker-safe `core/runtime.ts` `isClientRuntime`. Also needed Vite `worker: { format: 'es', … }` — IIFE workers can't code-split the WASM dynamic import.
- [x] **W2 — state snapshot → store projection.** Worker posts a full-ish snapshot (worldMap omitted unless its ref changed — it's the 38k-tile big part); `simWorkerClient` caches worldMap and reattaches it, then drives the store projection. (Slim `Float32Array` position channel deferred — see "Known gaps".)
- [x] **W3 — player commands main→worker.** ~30 commands converted to a **serializable registry** (`sim/commands.ts`, named `(state,payload)=>state` — closures can't cross the worker boundary), dispatched via `gameState.command()`. Guarded by `jobRegistry.test.ts`.
- [x] **W4 — save/load through the worker + cutover.** Worker owns state; `requestSave` posts the full state back to `saveManager`. Boot handoff in `gameState.ts` (`simWorkerBridge.start()` → `init`). Flag-gated cutover (`USE_SIM_WORKER`).
- [x] **W5 — wall-clock batch budget (NOT a raised tick cap).** The sim already runs on its own clock (worker `setInterval` + accumulator) and the renderer already interpolates sub-tile positions, so the only open piece was the catch-up cap. A fixed `MAX_STEPS_PER_BATCH` turned out to be the **wrong knob off-thread** (see post-mortem below) → replaced with an **8 ms wall-clock budget per batch**: run ticks until the budget is spent, yield (snapshots keep flowing), drop backlog beyond budget (best-effort speed). Light load drains fully → true 4×; heavy load degrades to smooth-but-slower (compute-bound on one core: 4×·150-pawn ≈ 2.9 s work/s real — unachievable by **any** cap). `MAX_STEPS_PER_BATCH` kept only as a 120-tick hard safety.

**Acceptance — met:**

- [x] Render holds display-rate FPS while the sim runs heavy — `[RENDER-PROF]` shows **`sim 0.0`** on the render thread.
- [x] TPS no longer capped by a render-thread `MAX_STEPS`; sim runs best-effort off-thread (1× keeps up; high speeds are compute-bound, by physics not by the cap).
- [x] Save/load, player commands, combat/needs unchanged — **218 tests green**, build ✓.

### 4b · Worker-mode smoothness post-mortem (what worked / what didn't)

After cutover (FPS 35–63) the user reported **"waves" / freeze frames** — pawns *and overlay animations* hitching periodically. That last detail was the key tell and drove the fix order:

- [~] **Publish full snapshot EVERY tick (not just on flush)** — *tried, REVERTED (`a24685c`→`22290e8`).* Hypothesis was that 15 Hz position pushes looked chunky, so post per-tick. It **regressed FPS to 7**: structured-cloning ~290 entities **50×/s** overwhelmed the main thread's deserialize. **Wrong diagnosis** — and disproved by the user's own clue: *overlay animations* freezing means the **render thread itself blocks** (those run on the render loop's own clock, independent of sim positions), so the freeze was never about position freshness. Restored flush-only (~15 Hz) publishing.
- [x] **`_terrainRev` — worker-computed terrain revision** (`a24685c`, kept). structured-clone hands the main thread **new refs every snapshot**, defeating its ref-based "did terrain change?" check → the 90 ms terrain rebuild fired every snapshot = the freeze storm (`🎯 GameGrid initialized` log spam ~2/s). The worker computes a revision bumped only on real change; the renderer rebuilds terrain only when it bumps. **~50 % of the freezes gone.**
- [x] **`_terrainRev` must EXCLUDE fuel/lit churn** (`1d52954`, the residual fix). First cut compared the raw `buildings` ref — but a **lit campfire decrements fuel every tick → a fresh `buildings` array every tick** → `_terrainRev` bumped constantly → terrain rebuilt ~2/s for an *invisible* change. Profiler proof: `[RENDER-PROF]` `terrain` field spiking **4 ms → 15 ms** during the slow frames. Fixed by comparing a **fuel/lit-excluding visual signature** (mirrors `GameCanvas.buildingsVisualSig`; inlined in the worker since `overlay.ts` pulls webgl/DOM, not worker-safe). **Freezes resolved** (user-confirmed).
- [~] **Raise `MAX_STEPS_PER_BATCH`** (the spec's original W5 wording) — *evaluated, rejected as written.* Off-thread it doesn't help render FPS (already decoupled); a higher count just makes a catch-up batch **lock the worker longer** (30 ticks × ~12 ms = 360 ms with no snapshots). Replaced by the wall-clock budget above.

### 4c · Known gaps (before flipping the default ON)

- [ ] **Two request-response commands not wired through the worker** — `createZoneInstance` and `gameCoordinator.craftItem` return a value to the caller, so they don't fit the fire-and-forget serializable-command registry. They are **broken under `?simworker`** until a request-response channel (postMessage with a reply id) is added. This is why the cutover stays flag-gated by default.
- [ ] **Slim `Float32Array` position channel (W2 stretch)** — snapshots still structured-clone the full-ish `GameState` at 15 Hz, which is the dominant main-thread cost remaining and a GC source. Moving hot pawn/mob positions to a transferable `Float32Array` (and posting the heavy panel state less often) would cut clone/GC further. Only worth it if a profiler pass shows the 15 Hz clone is the next ceiling.
- [ ] **worldMap deltas** — when a tile changes (harvest/regrowth) the worker re-sends the whole 38k-tile `worldMap`. Currently fine (only on real change), but if active-harvesting bursts re-introduce hitching, send changed-tile deltas instead of the full array.

---

## 5 · Deferred (real features / bigger bets — NOT the perf fix)

- [ ] **Perception target-persistence + push alerting** (old §3 / ADR-018) — a legit **AI-correctness/feel** feature (predators commit; prey react only to perceived; attacked animals fight back), but **not** a measured perf need. Build when AI behaviour wants it, not for FPS.
- [ ] **Line of sight** (`blocksSight` + WASM raycast, ADR-019) — still wanted for gameplay (no chasing through walls) and **blocks RANGED-COMBAT** + feeds SEASONS fog. Independent of the perf work now.
- [ ] **Designations/zones off the static terrain layer** (or incremental terrain upload) — removes the §3 terrain-throttle tradeoff at the source. Render polish, do after the Worker.
- [x] **Rust sim core** — was the "only if the worker is still too slow at target scale" bet. The worker proved exactly that (§8): off-thread, one core, 28–38 ms/tick at a fraction of target scale. **Promoted to the ★ ACTIVE direction** (top of doc). No longer deferred.
- [ ] **SAB multicore / wrapper decision** — multicore is now **R4** of the core plan (SoA unlocks it). The Electron/Tauri wrapper decision stays deferred to the DISTRIBUTION milestone (ADR-020); the wrapper is **not** a perf lever (see §6).

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
| Publish full snapshot every tick (worker) | **Reverted** | Cloning ~290 entities 50×/s crashed FPS to 7; the freeze it targeted was render-thread blocking (terrain), not position-update rate. Flush-only (15 Hz) restored. |
| Raise `MAX_STEPS_PER_BATCH` (worker) | **Rejected** | Off-thread it only lengthens worker lock per catch-up batch (no snapshots); a wall-clock budget is the right knob (W5). |
| Keep doing surgical JS cuts to reach target scale | **Rejected** | Measured tick is the *aggregate* of 290 entities (§8); cuts buy 2–3×, target needs 10–50×. Opportunity cost too high → go to a data-oriented core. |
| JS-SoA core (typed arrays, no Rust) | **Folded in** | Would get a big chunk (no GC, SAB multicore) and is a valid stepping stone, but the data-model work is identical to Rust's. Go straight to Rust-SoA for the extra constant factor + `rayon`; the spatial core already proves the WASM pipeline. |

---

## 7 · ADRs & status

- [x] ADR-021 — Sim/render decouple: soft-body pathfinding (amends ADR-014), terrain VBO/cache, sim→Worker (W0–W5 shipped, flag-gated), `_terrainRev` change-signal, wall-clock batch budget. **The accepted perf direction.**
- [x] ADR-018 — **corrected**: its "perception is the #1 perf cost" premise was falsified; persistence/push retained as a deferred AI-correctness feature (§5), not a perf measure.
- [x] ADR-019 (LoS) / ADR-020 (scaling ladder) — updated to point at the real findings + the Worker.
- [ ] **ADR-022 — Rust-SoA simulation core (to write + onboard into `codegraph.config.json`).** The accepted scaling direction (★ ACTIVE): SoA-over-typed-buffers sim in Rust→WASM behind the worker boundary; supersedes the "Rust core deferred" note in ADR-020.
- [ ] Re-measure on the shipped engine (WebKitGTK / V8) at the DISTRIBUTION milestone — Firefox numbers don't transfer.

---

## 8 · Sim ceiling — the capture that forced the pivot (2026-06-14)

Worker-side `[SIM-TPS]` + per-phase `[PROF]` (both now emitted from inside the worker; the console
`profileTurns()` sets the flag on the *main* globalThis, which the worker can't see). 240×160 map,
150 pawns + ~140 mobs, 4×:

- `[SIM-TPS] speed=4× tps=30–38 (target 240) avgTick=27–32 ms busy≈100 %` — **compute-bound on one
  core.** avgTick 28 ms → ~36 TPS max; realtime (1×) needs 60 TPS, so the sim runs **below realtime**
  under load and 4× cannot help (the worker is already flat-out). Startup spikes 84–217 ms/tick
  (one-time: initial A* grid build, job-pool gen for 300 designations, entity spawn).
- `[PROF]` phase split, and how it **grows as the colony activates** (the "harvest tank"):

  | phase | start | active |
  | ----- | ----- | ------ |
  | pawns | 5 ms | 12 ms |
  | entityStep | 4.6 ms | 8.5 ms |
  | combat | 0.45 ms | 4.75 ms |
  | needsTick | 2.4 ms | 5.7 ms |
  | **TOTAL** | **18 ms** | **38 ms** |

- `#findCombatThreat/tick ≈ 201` — auto-defend runs a threat scan per pawn **every** tick (60 Hz).
  Already uses the pre-filtered `hostiles` subset, so not raw O(n²); the cost is the 60 Hz frequency
  × entity count, i.e. the same "everything runs full logic every tick" pattern.

**Conclusion:** no single hot spot — it's aggregate per-entity cost in an allocation-heavy object
model. That is what a Rust-SoA core fixes; surgical cuts cannot. → ★ ACTIVE.
