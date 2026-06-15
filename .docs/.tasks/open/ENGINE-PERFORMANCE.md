<!-- LOC cap: 440 (created: 2026-06-14, rewritten 2026-06-14 post-profiling; worker shipped 2026-06-14; Rust-SoA pivot 2026-06-14 then ABORTED after R1 2026-06-15 → mutable-in-place JS; M1–M3 + throttle landed 2026-06-15, de-immutabling plateaued; 2026-06-15 custom profiler RETIRED → Firefox Profiler + pq; capacity/formula caches + the WORKER→MAIN SNAPSHOT (W2/W2b) broke the plateau → 80–100 TPS @4×) -->

# ENGINE PERFORMANCE & SCALING

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-008, ADR-014, ADR-018/019/020/021) · [game/BUGS](../../game/BUGS.md) · [RANGED-COMBAT](RANGED-COMBAT.md) (consumes LoS) · [SEASONS_WEATHER](SEASONS_WEATHER.md) (fog of war) · [DISTRIBUTION](DISTRIBUTION.md) · archived: [SIMULATION-PERF](../archive/SIMULATION-PERF-2026-05-30.md)

Profiling-driven performance work, measured on the heavy `--profiler` sandbox (150 pawns +
~140 mobs, 240×160 map, 4× speed; `.debug/perf.log`).

> **Scale note.** `1000×1000` map + `200–500` entities was an aspirational **ceiling**, never a
> committed goal. The real bar is ~50 pawns + a moderate mob count, where the sim is trivially fast
> (the per-entity tick at that scale is ~4–5 ms → 200+ TPS, 4× works). The heavy `--profiler` stress
> case (150 pawns + ~140 mobs) is what these numbers track: it now runs **~70 FPS / ~44 TPS** (was
> 2 fps / ~30 TPS at the start). The benchmark that chased the ceiling (R1) told us it wasn't worth a
> rewrite (see ★ ACTIVE + §A + §9).

> **This spec has been rewritten twice as the work changed direction.** Original premise — *"O(n²)
> perception is the #1 cost"* — **FALSIFIED by the profiler** (§1). Then the sim ceiling looked like
> it needed a **Rust-SoA core** (§A) — **also wrong**: the R1 benchmark (§9) showed the real cost is
> the **immutable update pattern**, fixable in plain JS. The lesson each time: instrument, then act.

---

## 0 · Status

- **🏆 PLATEAU BROKEN (2026-06-15): the worker→main SNAPSHOT was the real ceiling, not sim compute.**
  After de-immutabling plateaued at ~44 TPS (below), function-level profiling of the *worker thread*
  (Firefox Profiler, §10) showed the dominant cost was **`post`** — the per-flush `structured-clone`
  of the whole `GameState` — at **~32%**, not the per-entity sim. Slimming that snapshot (§B, W2 +
  W2b) took it **31.6% → 6.5%** and the heavy stress case from **~44 → 80–100 TPS @4×, FPS solid
  60–80, no sub-40 dips.** This is **the** win of the perf arc. See §B + §10.
- **Render decoupled, shipped:** FPS 2 → 8–10 (main-thread fixes), then **→ 60–80** with the **sim
  moved to a Web Worker** (§4, W0–W5 shipped, `?simworker`). `sim 0.0` on the render thread — render
  was never the bottleneck after the decouple; the worker→main boundary was.
- **Two cheap caches also landed (pre-snapshot, §B):** per-pawn **capacity cache** (statCapacities
  615→50 calls) and the **`evaluateFormula` compile-cache** (`new Function` was recompiling the
  formula string ~328×/tick → cached). Both fell off the hot list entirely.
- **Custom in-game profiler RETIRED (2026-06-15).** The `[PROF]`/`profCount`/`?simprof`
  instrumentation *itself* starved the sim (~75% of per-tick cost was its console/log traffic). All
  removed; profiling is now **browser-native**: Firefox Profiler → export → `pq` /
  `scripts/profile-self.mjs` (headless JS-self-time reader). See §2 + §10.
- **De-immutabling LANDED (M1–M3) + auto-defend throttle — plateaued, then SUPERSEDED.** Mutating the
  hot per-tick phases in place cut TOTAL **28–38 → ~22 ms (calm), TPS 30 → ~44**. It plateaued there
  (remaining sim cost is distributed compute) — and the snapshot work then leapfrogged it. The
  residual **immutable pawn-patch spreads** (`CopyDataPropertiesUnfiltered`, now the #1 line at ~10%)
  are the *next* lever if 100+ TPS is wanted (§B "next lever"). See ★ ACTIVE.
- **Rust-SoA core: evaluated, spiked (R0/R1), then ABORTED (2026-06-15).** R1 (§9) measured it at
  ~1.2–1.4× over *mutable* JS — not worth a two-language rewrite. Parked (§A).
- **At 290 entities, 60 TPS no longer needs parallelism** — the snapshot fix got the stress case to
  80–100 TPS @4× single-thread. The parked multicore/SoA (§A) is a *far*-larger-scale concern now.
- Decisions in ADR-021 (decouple + snapshot protocol). No ADR for a Rust core — aborted before lock-in.

---

## ★ ACTIVE — De-immutable the hot loops (mutable in place)

**The current perf lever.** R1 (§9) proved the dominant per-tick cost is *allocation from the
immutable update style*, not language or data layout. Convert the hot per-tick phases to mutate
entity fields in place instead of rebuilding objects every tick.

### Why this, and why it's safe now

- **Evidence (R1, browser, 500 entities · 1000×1000 · 600 ticks):** `js-oop-immutable` 0.1250 vs
  `js-oop-mutable` 0.0100 ms/tick = **12.5× allocation tax**. Rust-SoA (0.0083) was only ~1.2× over
  mutable JS; SoA-in-JS (0.0117) was *slower* than mutable OOP. So the lever is mutable-vs-immutable,
  not OOP-vs-SoA and not JS-vs-Rust. Full table in §9.
- **Realistic gain (not a literal 12.5×):** only the allocation-heavy phases benefit (`needsTick`,
  `pawns`, `entityStep`); `combat`/pathfinding allocate less. *Predicted* TOTAL ~28–37 ms → ~12–18 ms.
  **Actual: ~28–38 → ~22 ms** (see Results) — less than predicted because the phases are **partly
  compute-bound** (modifier/condition math, job search, A*), which mutation doesn't touch.
- **The worker contains the blast radius.** Under `?simworker` the worker structured-**clones** state
  on the way out, so the renderer/UI only ever see copies — ref-based change detection + cross-thread
  aliasing hazards are mooted. Remaining risk is **internal to the tick**: a few before/after-diff
  spots + tests. This is the Dwarf Fortress / RimWorld model (mutate live objects at 60 Hz; consumers
  read copies).

### What we keep / what we give up

- **Keep:** all gameplay, behaviour, the worker architecture, every render win. This is a *how state
  is written* change, not a *what the sim does* change.
- **Give up (contained):** pure `(state)=>state` services in the hot paths (become impure); ref-based
  "did it change?" *within* a tick (replace with explicit version/dirty — already started:
  `_terrainRev`, `uiPushCounter`); the few before/after-diff spots (e.g. combat's `preCombatState`)
  must capture an explicit minimal copy instead of leaning on a frozen prior reference; some tests
  assert `result !== input` and need updating.

### Plan (phased — convert ONE phase, measure `[PROF]`, then next)

- [x] **M1 — `needsTick` → mutable.** `processNeedsTick` + `adjustThirst`/`adjustHygiene` mutate need
  fields in place (the per-call full-array `.map` in the adjusters was O(n²)). `needsTick` 4–5.7 → ~3 ms.
- [x] **M2 — `pawns` FSM hot path → mutable.** Shared updaters `transitionTo`/`goIdle`/`haltMovement`
  + a reusable `mutatePawn(gs,id,fn)` helper; all 12 `needs.ts` + 9 `work.ts` single-pawn splices
  converted. `pawns` 8–12 → ~6 ms. (Cold `pawnHauling` deposit splices left — they fire on deposit
  *events*, not per-tick.) Movement (`processMovement` / shared `stepBody`) left — see M3 note.
- [~] **M3 — mob phase → mutable (PARTIAL).** `stepHunger` (mob needs) mutates in place (deaths
  captured explicitly for carcass drops; array realloc keeps the mob-subset memos valid).
  **Deliberately stopped there:** `stepEntities` (mob FSM) uses *snapshot semantics* (every mob steps
  against the start-of-tick array) — mutating it makes mobs react to mid-tick moves and risks the
  hunt/flee yoyo bugs; and `advanceMobMovement` routes through `stepBody`, a primitive **shared with
  pawn movement** (ADR-014). Both are compute-bound, not alloc-bound — skipped on purpose.
- [~] **Auto-defend throttle (RimWorld-style staggered AI)** — non-combat pawns re-scan for threats
  every 6 ticks (offset by `debugId`), not 60 Hz; in-combat pawns scan every tick. `findCombatThreat`
  180 → ~80/tick. **Near-non-win on TPS** (the cached scan was cheap) — kept (harmless, right model).
- [—] **M4 — `combat` → mutable: DROPPED.** Combat-active cost is *compute* (attack resolution,
  wounds, A*), not allocation; de-immutabling buys ~1 ms for the `preCombatState`/`handleFreshCombatCorpses`
  before/after-diff rewrite risk. Not worth it. (Re-open only if a profiler pass says otherwise.)
- [x] **M5 — diagnostics gated.** Worker `[PROF]`/`[SIM-TPS]` now opt-in via `?simprof`
  (`USE_SIM_PROFILE`), default OFF (no per-tick perf.log spam). `GameStateManager` audit: no further
  hot allocators found worth converting.

### Results (2026-06-15)

- **TOTAL 28–38 → ~22 ms (calm); TPS 30 → ~44; FPS → ~70.** Per-phase calm: `pawns` 6, `entityStep`
  5.3, `uiPush` 3.3, `needsTick` 3, `combat` 2.5 — no single dominant phase remains.
- **Combat-active scenes still spike to ~34–38 ms** — every phase rises (even mutable `needsTick`
  3 → 5.4, via wound/condition modifier math). This is compute, not allocation → de-immutabling
  can't reach it.
- **Plateaued — then leapfrogged by the snapshot (§B).** The alloc-bound *sim* phases were done, but
  the "remaining lever" flagged here — the `uiPush`/snapshot clone — turned out to be the **dominant**
  cost once measured on the worker thread (not ~3.3 ms steady but **~32%** of worker time on flush
  ticks). Slimming it (§B, W2/W2b) is what actually broke the plateau (44 → 80–100 TPS). Lesson again:
  the suspected-minor lever was the real ceiling — **measure the boundary, not just the sim.**

**Acceptance (revised):** ~60 TPS at the *real* (~50-pawn) scale — met. At the 290-entity stress
case, ~44 TPS single-thread *was* the measured ceiling without parallelism — **until §B** lifted it
to 80–100 TPS @4× by attacking the worker→main boundary instead of the sim.

---

## §B · 🏆 THE BREAKTHROUGH — slimming the worker→main snapshot (W2/W2b, 2026-06-15)

**The whole plateau was a measurement gap.** De-immutabling optimised the *sim*; nobody had profiled
the **worker→main boundary**. Function-level Firefox-Profiler captures of the worker thread (§10)
showed `post` — the per-flush `structured-clone` of the whole `GameState` — was the **single biggest
cost (~32%)**, dwarfing any sim phase. The sim was never the ceiling at this scale; **shipping state
to the renderer was.**

### What landed (in order, each measured)

- [x] **Capacity cache + `evaluateFormula` compile-cache** (pre-snapshot). `computeCapacities` memoised
  per pawn (invalidated by `limbs`/`injuries` ref identity — combat replaces both by-ref, so O(1)
  exact); `evaluateFormula` caches the compiled `new Function` per formula string (was recompiling
  ~328×/tick). Both dropped off the hot list (`statCapacities` 615→50; `evaluateFormula` ~15-17% → 0.4%).
- [x] **id → `Map` indexes.** `getBuildingById`/`getItemById` were per-call `.find()` over the static
  DBs → indexed once. `getBuildingById/<` **3.6% → 1.4%**, `find` 2.9% → 1.8%. *(Not Rust — these are
  static-array lookups; a `Map` is correct, WASM would mean marshalling objects.)*
- [x] **W2 — sectional-diff snapshot.** Instead of re-cloning the whole `GameState` every flush, send
  only the **top-level fields whose ref changed** (immutable updates leave unchanged sections ref-stable
  → skipped); the bridge reassembles from a mirror. worldMap stays special-cased. **`post` 31.6 → 20.7%.**
- [x] **W2b — per-entity slim + periodic resync** (`EntitySync` in `simProtocol.ts`). pawns/mobs were
  still the bulk. Each flush now sends a **slim projection** (every field *except* the heavy/static cold
  set: `limbs/injuries/inventory/equipment/skills/conditions/stats/traits/…`), keeping
  position/needs/state/combat-scalars live; the cold fields **full-resync every 8th flush (~2 Hz)**.
  The bridge keeps a per-id mirror and merges slim onto it. **`post` 20.7 → 6.5%.** *This is the win.*
  - **Why slim-projection, not per-field ref-diff:** the mutable-in-place model (★ ACTIVE) means
    `mutatePawn`/`processNeedsTick` change fields *without* changing refs → ref-diffing silently
    misses them. The periodic full resync is the correctness backstop (≤8 flushes / ~0.5 s stale on
    cold fields, never permanently wrong); new entities are always sent full so no field is undefined.

### Result (user-confirmed)

**~44 → 80–100 TPS @4×; FPS solid 60–80; the volatile sub-40 dips are gone.** Cross-comparison of
worker-thread JS self-time across three captures (§10 has the workflow; shares are within-capture):

| function | A: pre-session | B: +sectional+maps+grid+occ | C: +W2b, grid/occ reverted |
| -------- | -------------- | --------------------------- | -------------------------- |
| `post` (snapshot clone) | **31.6%** | 20.7% | **6.5%** ✅ |
| `getBuildingById` | 3.6% | 1.4% | 2.1%¹ |
| spatial-grid overhead | — | ~8.8%² | **0%** (reverted) |
| `CopyDataPropertiesUnfiltered` | 6.9% | 7.4% | **10.3%** (now #1) |

¹ Reads higher in C only because the denominator collapsed (post got out of the way), not slower.
² `nearest/<` 3.3 + `scanCell` 1.6 + `stepEntities/pawnIndex<` 2.4 + `add` 1.5 — see "rejected" below.

### Rejected & reverted (measured worse — recorded so we don't re-litigate)

- [x] **TS uniform-grid spatial index for `nearest*`** (`nearestPawn`/`Predator`/`AdjacentHostile`).
  Theory: O(n²) scans → grid. **Reality at ~290 entities: a net LOSS** — building a Map + buckets +
  `getX/getY` closures *every tick* cost ~8.8% vs the ~5.7% the linear scans cost, and the per-tick
  allocations caused GC churn (frame instability). Grids only pay off in the thousands; the
  JIT-inlined linear scan wins here. **Reverted.** (Re-open only if entity counts explode.)
- [x] **`(pawns,mobs)`-identity memoization of `blockedTiles`.** `processMovement` rebuilds the
  `pawns` array on every patch → the cache key invalidated constantly (near-zero hit rate), and the
  extra bookkeeping cost more than the plain scan (1.0% → ~2.1%). **Reverted** to the plain per-tick scan.

### Next lever (open — not yet pursued)

- [ ] **De-immutable the residual pawn-patch spreads.** `CopyDataPropertiesUnfiltered` (~10%, now #1)
  is `tickConditions`/`updateMorale`/`updatePawnState`/`processMovement` doing `.map(p => ({...p}))`
  over all pawns each tick. It didn't get *worse* — it's just the last big thing standing now the
  snapshot is solved. This is the ADR-002 mutable-in-place direction (★ ACTIVE), the natural path to
  100+ TPS. Deferred until wanted.
- [ ] **worldMap deltas** — still re-sends the whole 38k-tile array on any tile change (§4c). Only if
  active-harvest bursts re-introduce hitching.

---

## §A · PARKED (future research) — Rust-SoA simulation core — **port ABORTED after R1**

> **ABORTED 2026-06-15.** The R1 benchmark (§9) measured Rust-SoA at only ~1.2–1.4× over *mutable*
> JS, and SoA showed no win over mutable OOP in JS at the target entity count — not worth a
> two-language rewrite, especially once 1000×1000/500 was recognised as a ceiling, not a goal.
> **Kept for future research:** a *phased / partial* Rust port of specific hot pieces (or multicore
> via SAB) may still pay off at *much* larger scale. The **R0 SoA crate (`sim-core/`) + R1 bench
> remain** as the foundation + evidence; re-open this if the scale bar ever moves.

### What got built (kept)

- [x] **R0 — SoA data model** (`sim-core/` crate + `simWorldView.ts`). Field-major entity planes
  (f32/i32/u8/i16), chunked tile grid (32², dirty tracking, no object-per-tile), zero-copy typed
  views over wasm memory, layout-mirror guard (cargo test + vitest). Built via `pnpm add:wasm:sim`.
- [x] **R1 — spike + benchmark** (`bench_step` in Rust + `bench.ts`, `runSimCoreBench()`). 4-way
  apples-to-apples; produced the abort verdict (§9).

### Not pursued (kept for reference — the phased-port shape, if ever resumed)

- [ ] **R2 — hot-loop port** (movement/needs/FSM/combat → Rust over SoA; JS keeps cold logic).
- [ ] **R3 — state boundary** (Rust owns SoA in `(Shared)ArrayBuffer`; snapshot = a buffer view;
  this is where a Float32Array position channel + worldMap deltas would land).
- [ ] **R4 — multicore** (`rayon` / multi-worker over SAB across entity batches / map chunks).
- [ ] **R5 — save/load from SoA + parity** against the JS reference.

### Why it was the wrong bet (recorded so we don't re-litigate)

The pivot assumed the cost was *object-graph cache misses + GC* that only SoA/Rust could fix. R1
isolated the variables and showed the cost is overwhelmingly **GC from the immutable pattern** —
which mutable-in-place JS reclaims directly. SoA's wins (cache bandwidth, SAB multicore) only show up
at far larger scale than the real target; Rust's constant factor (~1.2–1.4× here) doesn't justify the
two-language cost. Reusable from the attempt: the worker boundary/command registry/snapshot protocol
(still in use) and the SoA crate (parked).

---

## 1 · Post-mortem — how the FIRST premise was wrong

- [x] **Perception O(n²) premise FALSIFIED.** It dominated exactly **one** capture — an *idle* moment (pawns 7 ms). Under realistic movement load the `pawns` phase was 94 ms and **pathfinding dwarfed perception ~13×**. The lesson: the first profiler run was unrepresentative; instrument under load before concluding.
- [x] **The FPS counter was lying** — `updateFPS()` discarded any frame slower than 250 ms, so below 4 fps it froze at the last healthy value. This is why the regression was invisible for so long. (Fixed; threshold → 2 s, commit `02c4dfd`.)
- [x] **"CPU asleep" was the single-thread illusion** — one core of 22 at ~90% busy ≈ 4% aggregate. Confirmed CPU-bound (not GPU: `gpuWait ~4 ms`) via the `gl.finish` probe. The sim and render share **one thread**.

---

## 2 · What actually landed (measured, free wins = real bugs)

- [x] **Profiler tooling — built, used, then RETIRED (2026-06-15).** The honest FPS counter + per-frame `[RENDER-PROF]` + per-phase `[PROF]`/`profCount` instrumentation found the early wins (below), but the instrumentation *itself* became ~75% of per-tick cost (console/log traffic scaling with entity count) and couldn't see the worker→main boundary. **All removed** (`[PROF]`/`profCount`/`?simprof`/`USE_SIM_PROFILE`/the custom profiler scenario auto-enable). Replaced by browser-native profiling — see §10. The free wins it *did* surface (soft-body pathfinding, terrain VBO/cache) are below; commits `02c4dfd`, `250b55f`, `4482dba`, `cf94bed`, `0c02800`.
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
- [x] **W1 — WASM in the worker.** `WasmPathfinderService` inits inside the worker. Verified with the `verifyWasmInWorker()` console check. **Gotcha:** `$app/environment`'s `browser` can't bundle into a worker → worker-safe `core/runtime.ts` `isClientRuntime`; plus Vite `worker: { format: 'es', … }` (IIFE workers can't code-split the WASM import).
- [x] **W2 — state snapshot → store projection.** Worker posts a full-ish snapshot (worldMap omitted unless its ref changed); `simWorkerClient` caches worldMap and reattaches it, then drives the store projection.
- [x] **W3 — player commands main→worker.** ~30 commands converted to a **serializable registry** (`sim/commands.ts`, named `(state,payload)=>state`), dispatched via `gameState.command()`. Guarded by `jobRegistry.test.ts`.
- [x] **W4 — save/load through the worker + cutover.** Worker owns state; `requestSave` posts full state to `saveManager`. Boot handoff in `gameState.ts`. Flag-gated cutover (`USE_SIM_WORKER`).
- [x] **W5 — wall-clock batch budget.** A fixed `MAX_STEPS_PER_BATCH` was the wrong knob off-thread (locks the worker with no snapshots → stutter). Replaced with a ~16 ms wall-clock budget per batch: run ticks back-to-back to the compute ceiling, yield so snapshots flow, **clamp** carried backlog so higher speeds carry without spiralling. (8 ms was too tight → pinned ~62 TPS at every speed; raised + clamped so the speed control actually multiplies — see 4b.)

**Acceptance — met:**

- [x] Render holds display-rate FPS while the sim runs heavy — `[RENDER-PROF]` shows **`sim 0.0`**.
- [x] Speed control multiplies TPS up to the compute ceiling (4× boosts TPS where headroom exists).
- [x] Save/load, player commands, combat/needs unchanged — **221 tests green**, build ✓.

### 4b · Worker-mode post-mortem (what worked / what didn't)

- [~] **Publish full snapshot EVERY tick** — *tried, REVERTED (`a24685c`→`22290e8`).* Cloning ~290 entities 50×/s crashed FPS to 7. The freeze it targeted was render-thread blocking (terrain), not position rate (the tell: *overlay animations* froze too). Restored flush-only (~15 Hz).
- [x] **`_terrainRev`** (`a24685c`) + **fuel/lit-excluding building signature** (`1d52954`). structured-clone hands new refs every snapshot → defeated the ref-based terrain-change check → 90 ms rebuild every snapshot. A worker-computed revision (bumped only on *visible* terrain change; campfire fuel churn excluded) fixed the freeze storm. **User-confirmed resolved.**
- [x] **Speed control** (`d6e7418`) — the W5 budget at 8 ms forced 1 tick/batch at every speed → "4× does nothing". Raised the budget so a backlogged worker runs to its ceiling + clamp (not drop) backlog → speed multiplies.
- [x] **Combat-text / chronicle under the worker** (`d6e7418`) — the sim's `simLog` sink is registered only on the main thread; in the worker it was the no-op → floating damage numbers vanished. Forward sink calls worker→main (buffered per batch), replay against the real sink.
- [x] **Campfire walkability** (`d6e7418`) — the `--profiler` scenario injected complete buildings without `applyBuildingFootprint`, so solid buildings never blocked their tile. Apply the footprint in the scenario.

### 4c · Known gaps (before flipping the worker default ON)

- [x] **Worker is now the ONLY sim path (W4 complete, `?simworker` flag RETIRED).** The two former holdouts (`createZoneInstance`, `craftItem`) are converted to worker commands (`createZoneInstance` takes a caller-generated id; `craftItem` moved into `sim/commands.ts`), and the other direct-mutation sites (`equipFromTile`, dev spawn/clear) too; world-regen/reset re-init the worker. `USE_SIM_WORKER = isClientRuntime` (browser always; SSR/tests use the in-thread fallback).
- [x] **Slim snapshot — DONE, and it was the whole game (§B).** The hunch here ("~2 ms the user won't feel") was *wrong*: measured on the worker thread, the snapshot clone was **~32%**, the dominant cost. Slimmed via the W2 sectional diff + W2b per-entity slim/resync → `post` 31.6 → 6.5%, 44 → 80–100 TPS. (No `Float32Array` needed yet — slim structured-clone was enough.)
- [ ] **worldMap deltas** — re-sends the whole 38k-tile array on any tile change; send changed-tile deltas if active-harvesting bursts re-introduce hitching.

---

## 5 · Deferred (real features / bigger bets — NOT the perf fix)

- [ ] **Perception target-persistence + push alerting** (ADR-018) — an AI-correctness/feel feature, not a measured perf need. Build when AI behaviour wants it.
- [ ] **Line of sight** (`blocksSight` + WASM raycast, ADR-019) — wanted for gameplay (no chasing through walls), **blocks RANGED-COMBAT**, feeds SEASONS fog.
- [ ] **Designations/zones off the static terrain layer** (or incremental terrain upload) — removes the §3 terrain-throttle tradeoff at the source. Render polish.
- [ ] **SAB multicore / wrapper decision** — deferred to the DISTRIBUTION milestone (ADR-020). The wrapper is **not** a perf lever (§6). Multicore would ride on a future SoA effort (§A).

---

## 6 · Evaluated & rejected

| Option | Verdict | Why |
| ------ | ------- | --- |
| "O(n²) perception is #1" | **Falsified** | One idle capture; pathfinding dwarfed it 13× under load. |
| Oversized-canvas / GPU bound | **Rejected** | 0.8 MP canvas, `gpuWait ~2–4 ms`; it's CPU/single-thread. |
| Battery / power-saving throttle | **Rejected** | User on AC; reproduced at full clock. |
| Connectivity pre-check for unreachable A* | **Rejected** | 100 % of fails were `bodyBlocked` (terrain *was* reachable). Soft-bodies was the fix. |
| Publish full snapshot every tick (worker) | **Reverted** | Cloning ~290 entities 50×/s crashed FPS to 7; the freeze was render-thread blocking, not position rate. |
| Raise `MAX_STEPS_PER_BATCH` (worker) | **Rejected** | Off-thread it only lengthens the worker lock per catch-up batch; a wall-clock budget is the right knob (W5). |
| **Rust-SoA simulation core (full port)** | **Rejected (R1, §9)** | Only ~1.2–1.4× over *mutable* JS — not worth a two-language rewrite. Spike parked (§A) for a possible partial port at far larger scale. |
| **JS-SoA core (typed arrays, no Rust)** | **Rejected (R1)** | SoA showed *no* win over mutable OOP in JS at 500 entities (index math costs more than it saves until cache-bound). The lever is immutable→mutable, not layout. |
| Throttle `findCombatThreat`/auto-defend | **Kept, ~non-win** | 180 → ~80 calls/tick but TPS unchanged — the scan uses a cached hostile subset (cheap). Harmless + the right model (RimWorld staggering), so kept; not the lever. |
| **M4 — de-immutable `combat`** | **Dropped** | Combat-active cost is *compute* (attack resolution, wounds, A*), not allocation. ~1 ms for the `preCombatState`/`handleFreshCombatCorpses` before/after-diff rewrite risk — not worth it. |
| **TS uniform-grid for `nearest*`** | **Reverted (§B)** | At ~290 entities, building a grid (Map+buckets+closures) every tick cost ~8.8% vs ~5.7% for the linear scans + GC churn. Grids win only in the thousands; JIT-inlined linear scan wins here. |
| **`(pawns,mobs)`-memoized `blockedTiles`** | **Reverted (§B)** | `processMovement` rebuilds `pawns` every patch → near-zero cache hit rate; bookkeeping cost more than the plain scan (1.0 → ~2.1%). |
| Switch wrapper (Electron/Tauri) **for perf** | **Rejected** | Single-thread JS either way; decide wrapper on distribution grounds later. |
| Fork Electron / embed SpiderMonkey | **Rejected** | Team-years for ~zero gain. |

---

## 7 · ADRs & status

- [x] ADR-021 — Sim/render decouple: soft-body pathfinding (amends ADR-014), terrain VBO/cache, sim→Worker (W0–W5 shipped), `_terrainRev` change-signal, wall-clock batch budget, **and the W2/W2b snapshot protocol (sectional diff + per-entity slim/resync, §B) — the cost that actually mattered.** **The accepted perf direction.**
- [x] ADR-018 — **corrected**: "perception is the #1 perf cost" falsified; persistence/push retained as a deferred AI-correctness feature (§5).
- [x] ADR-019 (LoS) / ADR-020 (scaling ladder) — point at the real findings + the Worker.
- [ ] **No ADR for a Rust core** — it was spiked (R0/R1) and aborted (§A) before locking in. If the **mutable-in-place** refactor (★ ACTIVE) is locked in as a pattern, or a partial Rust port is ever resumed, write an ADR then.
- [ ] Re-measure on the shipped engine (WebKitGTK / V8) at the DISTRIBUTION milestone — Firefox numbers don't transfer.

---

## 8 · Sim ceiling — the capture that prompted the Rust evaluation (2026-06-14)

Worker-side `[SIM-TPS]` + per-phase `[PROF]` (emitted from inside the worker). 240×160, 150 pawns +
~140 mobs, 4×:

- `[SIM-TPS] speed=4× tps=30–38 (target 240) avgTick=27–32 ms busy≈100 %` — compute-bound on one
  core; below realtime under load. Startup spikes 84–217 ms/tick (one-time: A* grid build, job-pool
  gen for 300 designations, spawn).
- `[PROF]` phase split, growing as the colony activates (the "harvest tank"):

  | phase | start | active |
  | ----- | ----- | ------ |
  | pawns | 5 ms | 12 ms |
  | entityStep | 4.6 ms | 8.5 ms |
  | combat | 0.45 ms | 4.75 ms |
  | needsTick | 2.4 ms | 5.7 ms |
  | **TOTAL** | **18 ms** | **38 ms** |

- `#findCombatThreat/tick ≈ 201` — auto-defend runs a per-pawn threat scan every tick (60 Hz; uses
  the pre-filtered `hostiles` subset, so not raw O(n²) — the cost is the 60 Hz × entity-count pattern).

**Conclusion (corrected by §9):** no single hot spot — aggregate per-entity cost. At the time this
read as "needs a Rust-SoA core". R1 (§9) then showed the cost is the *immutable allocation pattern*,
fixable in JS → ★ ACTIVE, not a rewrite.

---

## 9 · R1 benchmark — the capture that ABORTED the Rust port (2026-06-15)

`runSimCoreBench()` — one representative hot loop (needs decay + movement + chunked tile read), the
**identical** work four ways, 500 entities · 1000×1000 · 600 ticks × 5 reps, browser (V8 + wasm):

| variant | ms/tick | reads as |
| ------- | ------- | -------- |
| rust-soa | **0.0083** | the proposed core |
| js-oop-mutable | **0.0100** | mutate objects in place |
| js-soa | 0.0117 | same layout, JS over typed arrays |
| js-oop-immutable | **0.1250** | the CURRENT engine style (spread/map per tick) |

Ratios: **alloc tax (immutable / mutable) = 12.5×**; rust over js-soa = 1.4×; **rust over mutable
JS ≈ 1.2×**; SoA-layout "win" over mutable OOP = 0.9× (a loss).

**Conclusion:** the lever is **mutable-vs-immutable (12.5×)**, not OOP-vs-SoA (≤1×) and not JS-vs-Rust
(~1.2×). A two-language Rust-SoA rewrite buys almost nothing the immutable→mutable change doesn't —
so the port is **aborted** (§A) and the active work is **de-immutabling the hot loops** (★ ACTIVE).

---

## 10 · Profiling workflow — browser-native (replaced the custom profiler, 2026-06-15)

The in-game `[PROF]`/`profCount` profiler was retired (§2): it scaled with entity count and couldn't
see the worker→main boundary — the very cost that turned out to dominate (§B). Profiling is now done
**by the browser**, off the game's hot path entirely:

- [x] **Capture:** run the heavy sandbox (`./dev.sh --profiler` → `VITE_PROFILER` heavy scene, 4×,
  `?simworker`) in Firefox/Zen, record a heavy-moment with the **Firefox Profiler**, *Download* the
  `.json` into `.debug/`. (Automated headless capture via `MOZ_PROFILER_STARTUP` was attempted and
  **abandoned** — a 2nd Zen instance hits "channel error" alongside a running one, and headless WebGL
  fails the framebuffer; manual record→download is the working loop.)
- [x] **Read (headless, scriptable):** `node scripts/profile-self.mjs [file] [topN]` — attributes each
  sample to its deepest `isJS` frame and prints **true JS self-time per function** for each worker
  thread, flagging the sim worker. This is how the §B cross-comparison was produced. The
  `@firefox-devtools/profiler-cli` (`pq`) is also a devDep for interactive querying of the same exports.
- **`firefox-devtools-mcp`** can drive a live browser but has **no profiler-capture tool** and rejects
  Zen's binary (`--version` reports "Zen" not "Firefox") — not usable for capture here.
- **Lesson of the whole arc:** instrument the *boundary*, not just the sim. Every wrong turn (O(n²)
  perception §1, the Rust pivot §A, the de-immutable plateau ★ ACTIVE) came from optimising what was
  *assumed* hot; every win came from a function-level capture of what *actually* was.
