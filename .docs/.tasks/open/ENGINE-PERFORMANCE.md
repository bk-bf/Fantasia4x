<!-- LOC cap: 870 (created: 2026-06-14, rewritten 2026-06-14 post-profiling; worker shipped 2026-06-14; Rust-SoA pivot 2026-06-14 then ABORTED after R1 2026-06-15 → mutable-in-place JS; M1–M3 + throttle landed 2026-06-15, de-immutabling plateaued; 2026-06-15 custom profiler RETIRED → Firefox Profiler + pq; capacity/formula caches + the WORKER→MAIN SNAPSHOT (W2/W2b) broke the plateau → 80–100 TPS @4×; then de-immutabled pawn-patch spreads + paused warmup screen → 200+ TPS @4× after ~5s, GOAL CRUSHED 2026-06-15; then JS-allocation capture (§C) verified the de-immutable win + drove the harvest-time worldMap-delta fix; 2026-06-15 Electron chosen over Tauri (A/B), and the Electron renderer trace opened §D — renderer-side hitches D1–D3; 2026-06-16 §D extended: prealloc + designation-decouple + RESYNC 8→32 + worldMapDelta-slim landed, and the BIG one — three `worldMap.map()` full-rebuilds (harvest completion / mob forage / building footprint) found via the `[TRIG]` probe and de-immutabled in place → `worldMapRef=0`; sectional throttle TRIED+REVERTED; then the ENTITY BASELINE got its surgical cut after all (D8) — `[SNAP-PAWN]` field-audit + drop-never-read-fields projection (`entityProjection.ts`), slim pawn 766→~535B / pawns 152k→109k, the path≈900B premise was STALE; next non-entity lever = `droppedItems` deltas; 2026-06-20 §F — `droppedItems` per-id `EntitySync` + `_carcassCondition` summary + throttled spoilage + chronicle-batch + combat per-hit in-place (COW), the LAST done after a self-inflicted unconditional-per-tick-clone regression caught in `perf.log`) -->

# ENGINE PERFORMANCE & SCALING

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-008, ADR-014, ADR-018/019/020/021) · [game/BUGS](../../game/BUGS.md) · [RANGED-COMBAT](RANGED-COMBAT.md) (consumes LoS) · [SEASONS_WEATHER](../archive/SEASONS_WEATHER-2026-06-17.md) (fog of war — deferred here) · [DISTRIBUTION](DISTRIBUTION.md) · archived: [SIMULATION-PERF](../archive/SIMULATION-PERF-2026-05-30.md)

Profiling-driven performance work, measured on the heavy `--profiler` sandbox (150 pawns +
~140 mobs, 240×160 map, 4× speed; `.debug/perf.log`).

> **Scale note.** `1000×1000` map + `200–500` entities was an aspirational **ceiling**, never a
> committed goal. The real bar is ~50 pawns + a moderate mob count, where the sim is trivially fast
> (the per-entity tick at that scale is ~4–5 ms → 200+ TPS, 4× works). The heavy `--profiler` stress
> case (150 pawns + ~140 mobs) is what these numbers track: it now runs **comfortably 200+ TPS @4×**
> after ~5 s warmup (was 2 fps / ~30 TPS at the start) — see §0. The benchmark that chased the ceiling
> (R1) told us it wasn't worth a rewrite (see ★ ACTIVE + §A + §9).

> **This spec has been rewritten twice as the work changed direction.** Original premise — *"O(n²)
> perception is the #1 cost"* — **FALSIFIED by the profiler** (§1). Then the sim ceiling looked like
> it needed a **Rust-SoA core** (§A) — **also wrong**: the R1 benchmark (§9) showed the real cost is
> the **immutable update pattern**, fixable in plain JS. The lesson each time: instrument, then act.

---

## 0 · Status

- **🩸 COMBAT + ITEM SNAPSHOT FIXES (§F, 2026-06-20) — engagement-wave FPS dips fixed; one self-inflicted
  regression caught + fixed.** A 5-pawn/420-mob playtest dipped (worker TPS *and* FPS) during mass mob-vs-mob
  engagement waves (`perf.log` dips lined up with `combat.log` waves) and during carcass accumulation. Landed,
  in order: (1) **`droppedItems` per-id `EntitySync`** (was shipped WHOLE every flush and grew unbounded with
  kills — the D8-flagged lever); (2) **`_carcassCondition` summary** computed worker-side so the per-unit
  `unitConditions` arrays never cross the boundary and the sidebar/crafting panels stop re-scanning all drops
  each flush; (3) **throttled spoilage** (`stepItemDecay` every 60 ticks, not every tick — it re-referenced the
  whole `droppedItems`+`stockpile` every tick); (4) **chronicle batch** (`batchLogReplay` — a combat flood
  replayed dozens of `simlog` events in one synchronous burst, each re-running every `activityLog` derived view
  + panel; now one notify per batch); (5) **combat per-hit array rebuild → in-place** — `_applyInjuryToEntity`/
  `applyOnHitEffect` rebuilt the WHOLE 420-mob array (`state.mobs.map()`) on every injury, several times per
  landed hit; a wave did dozens of full-array rebuilds/tick (this is M4, which §6 had DROPPED at 140 mobs —
  re-opened for the 420-mob case). **The regression-on-the-fix:** the first combat cut cloned the mobs+pawns
  arrays UNCONDITIONALLY every tick (even at peace) → reintroduced the very per-tick-alloc tax this spec is
  about + churned the `pawnById` array-ref memo → new single-tick GC stalls in `perf.log`. Fixed with
  **copy-on-write** (clone an array only on the first hit that writes it; peace ticks allocate nothing). Guarded
  by `combatSim.test.ts` (a `tickCombat`-doesn't-mutate-its-input test, so the fresh-corpse index-diff stays
  valid). **Lesson (the reason for the AGENTS.md cross-check rule): I caused a perf regression while fixing a
  perf bug — every hot-path/snapshot edit must be cross-checked against THIS spec + `perf.log` re-read after.**
- **🧱 CHUNKED TERRAIN (§E, 2026-06-20) — FPS regression from the 500×500 default map, FIXED + validated in-game.** Commit
  `b2a1031` changed the default map 240×160 → 500×500 (**38k → 250k tiles, 6.5×**). TPS was unaffected
  (the sim is per-*entity*: a 5-pawn/420-mob playtest) but **FPS clapped** — the renderer drew the WHOLE
  map as one static VBO (`renderAllTiles:true`): a ~138MB buffer, **1.5M verts drawn every frame**, and
  O(map) rebuilds/uploads on every terrain change — every §D cliff reopened at 6.5×. Fix: the terrain
  layer is now sliced into **32² chunks, each its own VAO/VBO, built lazily and drawn only when it
  overlaps the viewport (+1-chunk margin)**; a content/`lightVersion` bump rebuilds only the visible
  chunks; un-drawn chunks are evicted to bound GPU memory. Render cost is now **O(visible tiles),
  independent of map size**. Geometry stays camera-independent (world-space verts + pan/zoom uniforms),
  so panning only changes which chunks draw. `grid-renderer.ts` + `renderer-core.ts`; `pnpm check` clean
  (pre-existing `bulkLogistics.test.ts` cast error aside), 486 tests green. **Live playtest confirmed:**
  the pre-fix sustained collapse (~30s at 14–50 TPS, bottoming at `tps=1`) is gone — post-fix `perf.log`
  holds a flat **60–61 TPS** over a ~90s stretch with only isolated single-tick GC blips. See §E.
- **🪶 ENTITY BASELINE CUT (D8, 2026-06-16) — the snapshot projection got its surgical cut after all.**
  The `[SNAP-PAWN]` field probe (measured, not assumed) showed the per-flush slim pawn was ~766B dominated by
  `needs` (150) + `activeJob` (117) + `jobQueue` (168 *when populated*) + `state` (77) — **`path` was only 35B**,
  so the old "path ≈ 900B" premise (§D-below) was **stale/wrong for this scenario** (real-game local harvest/haul,
  not cross-map treks). A full main-thread read-audit (components/stores/routes + GameCanvas) found most of those
  bytes are **worker-only fields the renderer/HUD never read**. `projectSentEntity` (`sim/entityProjection.ts`)
  DROPS them from the SENT projection — the `slimTile` pattern for entities: needs `lastX` timestamps, activeJob
  ids/coords/scratch, the `jobQueue` lookahead, the `state` FSM booleans (redundant with the hot `currentState`)
  — plus truncates `path` to the next 2 cells (drafted pawns keep the full path for the order overlay). **Zero
  staleness** — only never-read fields are dropped, so no resync/merge machinery was needed (unlike the
  demote-to-resync the doc had proposed). Result: slim pawn **766 → ~535B**, **`pawns` 152k → ~109k (~28%)**.
  Guarded by `entityProjection.test.ts`. **Lesson (again):** the first attempt truncated `path` off the doc's
  stale number and did ~nothing — only the `[SNAP-PAWN]` field measurement found the real cost. *Measure the
  field, don't trust the prior note.* Remaining entity cost is now genuinely-read scalars; the next entity lever
  is transferable `Float32Array` positions (a rewrite, not a cut). **Next non-entity lever: `droppedItems` —
  it ships whole every flush and GROWS unbounded with harvest (16k → 31k+ in one session); D6-style item deltas.**
- **🖥️ RENDERER-side arc (§D, 2026-06-16) — the cliffs are fixed; then the entity baseline was cut (D8, above).**
  After the Electron cutover ([[electron-over-tauri-distribution]], ~250 TPS vs Tauri ~100) Chrome-trace
  profiling of the *render thread* opened a new surface (§D). What landed: terrain vertex prealloc (D1′),
  designation→terrain decouple (D1″), resync cadence 8→32 (D5), worldMapDelta tile-slim (D4), staggered
  resync (D2), async autosave (D3). **The big one (D6):** three `worldMap.map()` sites — harvest completion,
  **mob foraging (per-tick, in a loop — worst)**, building footprint — rebuilt the whole 38k worldMap to
  change a few tiles, flipping its ref → full re-clone across the boundary (the 211 ms `onmessage` spikes)
  **and** a full terrain rebuild. Found via the `[TRIG]` probe (`worldMapRef=5–11/30flush` during harvest);
  de-immutabled in place → **`worldMapRef=0`**, only `worldMapDelta`s flow. **The sectional throttle (D7)
  was TRIED and REVERTED** (worsened start FPS). The entity baseline (`pawns+mobs ≈ 400–500k/flush`) looked like a
  *project, not a cut* — **but D8 (above) found a clean surgical cut after all** (drop the never-read fields). See §D.
- **🏁 GOAL CRUSHED (2026-06-15, validated in-game): comfortably 200+ TPS @4×** on the giant
  `--profiler` map after ~5 s of play (settles in 2–3 s post-unpause, climbs past 200 by ~5 s). The
  full arc — worker decouple → W2/W2b snapshot → de-immutabling the residual pawn-patch spreads
  (below) → **paused loading-screen warmup** (hides the worker-boot + WebGL-init GC ramp; player
  unpauses manually) — lands far past the original 60-TPS bar. Firefox Profiler attached costs
  **~2–3× TPS** (expected instrumentation tax); unprofiled is the real number.
- **⚠️ Overload symptom (documented, NOT a priority):** running **multiple game instances at once**
  produces **visuals glitching back-and-forth** — a sign of worker↔main bridge desync (the snapshot
  mirror in `simWorkerClient` racing under starved CPU). Single-instance is the supported case; this
  is just how "too much load" now expresses itself since the snapshot protocol replaced full-state
  sync. If it ever surfaces single-instance, suspect the diff/resync reassembly in W2b.
- **🌿 HARVEST-TIME COLLAPSE FIXED (2026-06-15, §C).** TPS dropped 150 → sub-50 once pawns harvested:
  `processResourceRegrowth` rebuilt + re-sent the **whole 38k-tile worldMap every tick** a cooldown
  expired (≈every tick under 150-pawn harvest). Now mutates expired tiles **in place** + ships a
  `worldMapDelta` (changed tiles only). A JS-allocation capture (§C) drove this — it was 18.9% of JS
  alloc — and the same capture confirmed the de-immutable pawn win (those sites now ~0%).
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
  residual **immutable pawn-patch spreads** (`CopyDataPropertiesUnfiltered`, then the #1 line at ~10%)
  were the *next* lever — **now LANDED (2026-06-15):** `updatePawnState`/`updateMorale`/`processMovement`
  (PawnService) + `tickConditions` (PawnStateMachine) mutate the live pawn in place instead of rebuilding
  the pawns array, killing the spread + O(n²) churn. Combined with the warmup screen → **200+ TPS** (top).
- **Rust-SoA core: evaluated, spiked (R0/R1), then ABORTED (2026-06-15).** R1 (§9) measured it at
  ~1.2–1.4× over *mutable* JS — not worth a two-language rewrite. Parked (§A).
- **At 290 entities, 60 TPS no longer needs parallelism** — the snapshot fix got the stress case to
  80–100 TPS @4× single-thread. The parked multicore/SoA (§A) is a *far*-larger-scale concern now.
- Decisions in ADR-021 (decouple + snapshot protocol). No ADR for a Rust core — aborted before lock-in.

---

## ★ DONE — De-immutable the hot loops (mutable in place)

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
- [x] **M4 — `combat` → mutable: RE-OPENED + LANDED at the 420-mob scale (§F, 2026-06-20).** Dropped at
  140 mobs (compute, not alloc) — but a 5-pawn/**420-mob** mob-vs-mob wave made the per-hit `state.mobs.map()`
  full-array rebuild (several per landed hit, dozens of hits/tick) the dominant cost. Now in-place via
  copy-on-write working clones (`spliceEntity`); the `preCombatState`/`handleFreshCombatCorpses` before/after
  diff is preserved (the COW clone keeps the input intact; index-aligned). The residual per-hit
  `computeCapacities` recompute (compute, cache-miss on the fresh `{...entity}`) is still open — separate lever.
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
| `CopyDataPropertiesUnfiltered` | 6.9% | 7.4% | **10.3%** (then #1)³ |

¹ Reads higher in C only because the denominator collapsed (post got out of the way), not slower.
³ Historical — from the retired custom profiler / a non-JIT view. **Not reproducible in the Firefox CPU
sampler** (JIT inlines the helper); the de-immutable win was instead confirmed via a JS-allocation capture (§C).
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

### Next lever — DONE

- [x] **De-immutabled the residual pawn-patch spreads** (2026-06-15). `tickConditions`/`updateMorale`/
  `updatePawnState`/`processMovement` were doing `.map(p => ({...p}))` over all pawns each tick
  (`CopyDataPropertiesUnfiltered`). Now mutate the live pawn in place (★ DONE). **Verified by a JS-allocation
  capture (§C):** those four now allocate **~0.1–2%** each — the spread churn is gone from the heap.
- [x] **worldMap tile deltas** (2026-06-15) — see §C. `processResourceRegrowth` was re-sending the whole
  38k-tile array (and rebuilding it) every tick during harvest; now mutates expired tiles in place and
  ships only the changed tiles (`tileDeltas.ts` + `worldMapDelta` in the snapshot). Fixes the
  active-harvest TPS collapse.

---

## §C · JS-allocation capture — verifying the de-immutable win + the harvest fix (2026-06-15)

**Why an allocation capture.** The CPU sampler (§10) **can't** confirm the de-immutable win: JIT
(Ion/Baseline) hides spread/copy inside unsymbolicated `fun_XXXX` frames and inlines the C++ helper
`CopyDataPropertiesUnfiltered` → it reads **0%** in *every* CPU profile (the §B "~10% #1 line" was the
retired custom profiler / a non-JIT view — historical). Instead capture **Firefox Profiler → "Record
allocations" (`jsallocations`)**: keep JS+CPU+Native Stacks on, record ~10–15 s warm (TPS is meaningless
under alloc tracking — only the *distribution* matters), read `thread.jsAllocations` (bytes, inclusive
per-func via stack walk).

### What the ~15 MB capture showed

- ✅ **De-immutable win confirmed.** The four de-immutabled sites now allocate ~nothing: `updatePawnState`
  **0.19%**, `updateMorale` **0.12%**, `processMovement` 1.97%, `processNeedsTick` 1.63%. `post` doesn't
  appear (structured-clone is native, off the JS-alloc path).
- ⚠️ **Original ordering (inclusive JS-alloc):** `processResourceRegrowth` 18.9%, mob FSM
  `stepEntities`/`stepOne` 18.6%, `tickConditions` 13.0%, `nearestPawn` 10.6%, `generateJobs`+`_syncHarvestJobs`
  ~8.6% — most now FIXED below. **Dominant allocator was `next` (49%)** — a SpiderMonkey self-hosted iterator
  `.next` (not our code), driven by `for…of`/`Object.entries` churn in those callers. **Fixing `next` = killing
  that iteration in the hot callers, not `next` itself** (indexed loops + `Set`/`Map` lookups, all below).

### tickConditions — drop the per-tick clone (DONE)

- [x] **Cause→fix:** `tickConditions` did `let conditions = [...pawn.conditions]` **every pawn every tick**
  (a wasted clone for healthy pawns) + `applyConditionDriver` rebuilt the array on each change — 20.7% of
  `next`. Now operates on the **live `pawn.conditions` in place** (`??=` once per pawn; `applyConditionDriver`
  `push`/`splice`/index-assigns, returns `void`) → common path allocates **nothing**. conditions is a cold
  snapshot field (resync) so in-place is safe; lethal branches keep immutable killPawn patches; logic
  byte-identical (death-path suite green).

### \_syncHarvestJobs — O(designations × jobs) → O(1) Set dedup (DONE)

- [x] **Found via the deterministic re-capture (CPU, §10 seed fix):** `_syncHarvestJobs` was **12.5%** of
  worker CPU, **~8% of it a single `jobs.some(...)`** — for every designated tile×resource (hundreds) it
  linear-scanned the whole harvest pool to test existence, every tick. Index existing harvest jobs in a
  `Set<"x,y,resourceId">` once, then O(1) `has`. Behaviour-identical (no dup jobs, stale jobs still
  filtered) — `harvestJobSync.test.ts`. *(This is what the now-comparable CPU captures bought us.)*

### pawn-id → index Map — kill the `find` O(n) lookups (DONE)

- [x] **`find` was 12.6%** of worker CPU — `gameState.pawns.find(p => p.id === id)` scans (140 mobs ×
  150 pawns for hunt targets + per-pawn state/morale/FSM passes). New `core/pawnIndex.ts` `pawnById`
  memoises a `Map<id,Pawn>` **on the pawns ARRAY REF** (rebuilds only on add/remove — always a new
  array via map/filter; no in-place push/splice). Hot callers query a STABLE array across many lookups
  (mob FSM in `stepEntities`; `processPawnTurn` + FSM tick under in-place updates), so one O(n) build
  serves hundreds of O(1) gets. Applied to PawnService state/morale, the in-place updaters
  `mutatePawn`/`transitionTo`/`goIdle`/`haltMovement`, the mob hunt-target, and the FSM re-fetches.
  Holds live refs (ADR-002-safe); death-path `killPawn` keeps `.find`. Guarded by `pawnIndex.test.ts`.

### Validation + dip/spike stability cross-check (2026-06-15, deterministic-seed CPU captures)

- [x] **Last two fixes validated** on identical seeded runs (21.03 → 21.28): `find` **12.6 → 6.0%**
  (pawn-id Map), `_syncHarvestJobs` **12.5 → 5.6%** (Set dedup). Both halved; user-confirmed "performance
  is amazing".
- [x] **Dip/spike analysis** (window the worker timeline by busy-ratio = inverse-TPS proxy; diff the
  function mix of the 5 most-saturated vs 5 most-headroom windows): the run is **stable** — only ~20%
  dip↔spike spread, **no pathological culprit** (no GC pause, no combat/job-gen burst). Dips are driven by
  the pawn/mob FSM, led by **`nearestPawn` +3.3pp** (13.5% vs 10.3%) and `handleWorking` +2.4pp. Notably
  **`tickCombat` (-0.8), `computeTileLightLevel` (-0.9), `generateJobs` (-0.7) are NOT dip drivers** (flat
  or anti-correlated) — so don't chase them for stability.
- [x] **`nearestPawn` micro-opt landed:** it's the one function overlapping *both* the queued perf list and
  the stability signal. Indexed loop (no `for…of` iterator — the self-hosted `next` churn) + result object
  built once, not per improvement. Behaviour-identical (entitySim tests green).
- [ ] **Heavy `nearestPawn` (spatial index) — DEFER to Living World / LoS, NOT now.** It's O(mobs×pawns)
  every tick; the proper fix is a spatial index, but the TS uniform grid was already **built + reverted**
  at this scale (§B — per-tick rebuild/alloc lost to the JIT'd linear scan). The upcoming **fog-of-war
  (visibility) + ranged-combat LoS** are spatial (ADR-008) and will build that index anyway — fold
  nearest/vision/LoS/fog into ONE amortised spatial service then. Doing it standalone now re-litigates the
  revert for ~3pp = premature. Likewise `handleWorking` is gameplay logic (may change with the unclaimed
  cooking job) — don't pre-optimise. **Perf is at a clean stopping point; pivot to feature dev.**

### The harvest fix — `processResourceRegrowth` in place + worldMap deltas (DONE)

- [x] **Symptom→cause:** harvesting dropped TPS 150 → sub-50. With ~150 pawns harvesting, *some* regrowth
  cooldown expires almost every tick → the old code ran `worldMap.map(row=>row.map(...))` (rebuild all 38k
  tiles) **and** flipped the worldMap ref → the publisher re-`structured-clone`d the **whole 38k-tile
  worldMap** every tick. Double cost: the 18.9% JS-alloc + the full re-send (the §4c gap, now biting).
- [x] **Fix (ADR-002 amendment + §4c):** mutate only expired tiles **in place** (no rebuild, no ref flip)
  + ship changed tiles. New `core/tileDeltas.ts` (worker singleton: `markTileDirty`/`drain`/`clear`);
  regrowth marks tiles; the publisher drains them into `worldMapDelta` (sent *instead of* the full worldMap
  when the ref is unchanged) + bumps `_terrainRev`; `simWorkerClient` patches its cached worldMap in place.
  A full worldMap send supersedes + clears pending deltas. Guarded by `resourceRegrowth.test.ts`. *(Harvest
  depletion `_completeHarvest` still full-sends its one rebuilt row on the completion tick — event-rate, fine.)*

---

## §D · RENDERER-side hitches — the Electron trace (2026-06-15)

**New surface: §B/§C all optimised the *worker* + the worker→main boundary. The renderer main thread
itself was never profiled until the Electron cutover** ([[electron-over-tauri-distribution]] — Electron
~250 TPS won the A/B over Tauri ~100). A Chrome DevTools trace of the heavy `--profiler` scene
(`.debug/Trace-*.json`, parsed with an ad-hoc node script — Chrome format, **not** the Firefox `pq`
pipeline) shows the renderer is **smooth at baseline but hitches periodically**, and the hitches are
pure JS + GPU-upload + GC, **not** paint/layout.

- **Baseline fine:** median frame gap **8.4 ms (~119 fps)**, p95 17 ms, thread **13% idle**. Steady
  per-frame cost: `generateBatchVertexData` (~1.8 ms), `updateWorldEffectOverlays` (~1 ms, the day/night
  hue overlay), snapshot ingest.
- **Stutters:** **16 tasks >50 ms (up to 209 ms), 21 janky frames in 11 s.** Window-attributed CPU
  self-time inside the hitches:

  | share of stutter | function(s) | cause |
  | ---------------- | ----------- | ----- |
  | **~47%** | `generateBatchVertexData` 31% + `bufferData` 6% + `setTile` 5% + `buildGameGrid`/`getVertexData` | **full 38k-tile vertex rebuild + whole-VBO re-upload** on terrain change — the §C "rebuild everything" bug, now on the *renderer's vertex buffer* |
  | **~25%** | `w.onmessage` (`simWorkerClient`) | **ingesting a big snapshot synchronously** — the every-8th-flush full cold-field resync = one giant message |
  | **~4%** | `saveManager` + `stripTile` | **autosave serialising 38k tiles on the main thread** mid-frame |
  | **8%** | `(garbage collector)` (max 21 ms pause) | churn from the vertex arrays + snapshot objects above |

- **Engine-independent:** these are *our* render functions; SpiderMonkey/JSC hitch on the same ops
  (Tauri just amplified it). The fixes are the same regardless of engine.

### Fixes (each mirrors a win already proven on the worker side)

- [~] **D1 — incremental terrain vertices: TRIED, REVERTED (made it worse).** Built it (worker
  `terrainFull` flag → `_tileDeltas` coords → GameCanvas patches only changed tiles via
  `bufferSubData`), but the post-D1 trace showed **median ~105→~54 fps, biggest dip 310→476 ms.**
  Cross-check verdict: the biggest dips are **full terrain rebuilds**, and D1 *couldn't* replace them
  because harvest **churns designations every tick** → `terrainFull` is true on most flushes → the
  full rebuild fires anyway, with the incremental path's `buildBaseTile` + per-tile
  `generateBatchVertexData([tile])` running *on top* (unthrottled), net more work + GC. Wrong lever.
- [x] **D1′ — preallocate the terrain vertex buffer — LANDED (the actual fix for the biggest dips).**
  The big dips are individual full rebuilds, expensive because `generateBatchVertexData` built a
  ~5.2M-element `number[]` via `.push(...)` then `new Float32Array(it)`. Now it writes straight into a
  preallocated `Float32Array` (size exact: 138 floats/tile, no skips) — output byte-identical, kills
  the giant transient alloc + conversion + its GC. One function, `pnpm check` 0 errors, 235 tests green.
- [x] **D1″ — decouple designations from the terrain rebuild — LANDED (2026-06-16).** A *dip-correlated*
  trace (worst renderer tasks × what BOTH threads ran in that window — see §D-method) showed **10/12 worst
  dips were the full 38k terrain rebuild** (`redrawOverlayNow → buildGameGrid → setTile×38k →
  generateBatchVertexData → bufferData`), fired ~2×/s by **designation churn** — yet `buildGameGrid` doesn't
  even read `designations` (icons are a separate 2D `drawDesignations` overlay; only `zoneTiles` tints the
  grid). So the worker now bumps `_terrainRev` only on worldMap/buildings/zones, and a SEPARATE
  `_designationRev` drives the cheap 2D overlay. Designation churn no longer triggers a terrain rebuild.
- [x] **D5 — resync cadence `RESYNC_EVERY` 8 → 32 — LANDED.** The `[SNAP]` payload probe showed the
  per-flush **resync slice** (~19 full pawns/flush carrying cold trees — inventory/limbs/skills/injuries) was
  ~131k/flush — the single biggest snapshot payload AND GC source (full entity objects deserialized + tossed
  every flush). Those cold trees feed only the selected-entity panel (tolerates ~2 s staleness), so 4× the
  interval cut that bandwidth ~4× (`pawns` floor ~241k → ~176k). Live scalars (position/needs/state) still
  flow every flush.
- [x] **D6 — THE harvest cliff: three `worldMap.map()` full-rebuilds → in-place + `markTileDirty`. LANDED
  (the big one, 2026-06-16).** The `[TRIG]` probe (counts what bumps the terrain-rev) pinned it: during
  harvest **`worldMapRef = 5–11 / 30 flush`** — the whole worldMap ARRAY getting a NEW ref — everything else
  (deltas, buildings, zones, designations) `= 0`. A new worldMap ref does TWO expensive things at once: a full
  terrain rebuild AND a full 38k-tile **re-clone across the worker boundary** (the 211 ms `message handler`
  violations). Three sites rebuilt the entire 38k array via `.map()` to change a handful of tiles:
  - `JobService._completeHarvest` — per-completion (~2–5×/s under 150-pawn harvest).
  - `entityAI` mob-foraging tile depletion — **per-tick, in a `for` LOOP (one full rebuild PER depletion ×
    140 mobs) — the worst offender**, and one I'd never have looked at without the user's "check other jobs".
  - `BuildingService.applyBuildingFootprint` — event-rate (build/deconstruct).
  All three now mutate the changed tile IN PLACE + `markTileDirty` (ADR-002 amendment, mirroring §C regrowth)
  → no ref flip, ships a `worldMapDelta`. **Result: `worldMapRef → 0`; `worldMapDelta` now flows (3–12/30flush,
  `wmDelta ≈ 0–0.4k` payload); the full re-clone is gone.** (Found by grep for `worldMap.map`; codegraph's
  reachability *couldn't* see `_completeHarvest` — registry-dispatched — see [[codegraph-registry-blindspot]],
  since FIXED in the extractor.)
- [~] **D7 — sectional throttle (jobs/workAssignments/droppedItems/stockpile @ ~4Hz): TRIED, REVERTED.**
  Aimed at the constant `jobs ≈ 50k/flush` tax + harvest-time `droppedItems` growth, staggered onto phases so
  they never land on one flush. **The data killed it:** at game START (pre-harvest) the `state` payload is
  already tiny (~0–4k) — the dominant cost there is the ENTITY baseline (~465k), untouched by the throttle.
  And throttling the *most volatile* fields (the job pool churns hardest during startup colony setup)
  concentrated their reactive work into bursts → **FPS got WORSE at start.** Wrong target + bursty. Reverted.
- [x] **D4 — the harvest cliff is the worldMapDelta SNAPSHOT, not the job logic — slimmed it. LANDED.**
  Post-D1′ trace + a time-split (early vs harvest) showed the real harvest degradation: the renderer's
  `w.onmessage` (snapshot deserialize) and the worker's `post` (serialize) **spike 5–8× the instant
  harvest starts** (153→1313 ms/window renderer; 157→957 ms worker) and move in lockstep — two ends of
  the same payload. `_syncHarvestJobs` (~5%), `processResourceRegrowth`, and the mob FSM are all **flat
  across the run** — *not* the cliff. Cause: 150 pawns harvesting → hundreds of distinct tiles change/s,
  each shipped as a **full `WorldTile`** cloned out (`post`) + back in (`onmessage`). Fix: the
  worldMapDelta now sends a **slim tile** — only the 9 fields the main thread reads (`type/terrainType/
  subType/movementCost/walkable/resources/resourceCooldowns/x/y`), dropping the 10 worker/save-only ones
  (A* scratch + `ascii/discovered/density/moisture/temperature/territoryOwner`, the same set
  `saveManager` strips). The bridge MERGES it onto the cached full tile, so dropped fields keep their
  values (none change on a harvest delta). `pnpm check` 0 errors, 235 tests green. **Verify:** re-trace —
  `post` + `w.onmessage` should drop sharply during harvest. (`_syncHarvestJobs` ~5% steady is a
  separate, smaller worker lever for later.)
- [x] **D2 — stagger the cold-field resync (~25%) — LANDED.** `syncEntities` (sim.worker.ts) now sends a
  FULL (cold-inclusive) entity only for this flush's round-robin slice (`i % RESYNC_EVERY === phase`) +
  newly-seen ids; everyone else stays slim. Over RESYNC_EVERY flushes every entity is refreshed → same
  staleness backstop, no 150 ms `onmessage` wall. The old `{full}` all-at-once branch is retired (the
  type variant + client branch remain as harmless dead code). 235 tests green.
- [x] **D3 — autosave off the render hot path (~4%+) — LANDED + CONFIRMED.** `scheduleSave` (saveManager.ts)
  runs the `stripState` 38k-tile clone + IDB write inside `requestIdleCallback` (macrotask fallback), off the
  frame-critical path. Post-fix trace cross-check: `saveManager`+`stripTile` dropped **~4.4% → ~0.9%** of
  stutter time. ✅

### §D-method · the trace toolchain this session built (TEMP — strip before ship)

Chrome DevTools traces (Electron) parsed by **ad-hoc node scripts in `/tmp`** (not committed; Chrome format,
not the Firefox `pq` pipeline): per-thread JS self-time; **dip-correlation** (worst renderer tasks × what
BOTH the renderer AND worker ran in that window — this is what pinned D1″/D6); and three in-worker console
probes in `sim.worker.ts` gated by `SNAP_SIZE_LOG`:
- **`[SNAP]`** — serialized byte size of each snapshot component + the biggest `state`-delta fields (sampled
  ~every 2 s). Revealed the payload is dominated by `pawns+mobs`, with `jobs≈50k` a constant tax.
- **`[SNAP-PAWN]`** — one slim pawn broken down by field (`needs`/`activeJob`/`state` ≈ 350B; `path` 100–650B
  when moving).
- **`[TRIG]`** — what bumps the terrain-rev each window (worldMapDelta vs worldMapRef vs buildings/zones vs
  designations). This is what found D6 (`worldMapRef=5–11→0`).

These probes + the `--max-semi-space-size=128` GC band-aid in `desktop-spike/electron/main.js` are **temporary
instrumentation still in the tree** — strip them before committing for real.

### §D8 · the entity-baseline cut — drop the never-read fields (2026-06-16, LANDED)

Every **cliff** is fixed and measured: worldMap rebuilds (`worldMapRef=0`, D6), the full re-clone (gone, D6),
terrain vertex cost (halved, D1′), designation-driven rebuilds (decoupled, D1″), the resync slice (4× smaller,
D5), the worldMapDelta tile (slimmed, D4). At the real ~50-pawn target this is trivially fast.

The entity baseline (`pawns + mobs ≈ 400–500k/flush`) was framed above as a *project, not a cut* — and the
proposed lever assumed **`path` inflated each slim pawn to ~900B**. **The `[SNAP-PAWN]` field probe falsified
that:** the ~766B slim pawn was `needs` (150) + `activeJob` (117) + `jobQueue` (168 *when populated*) +
`state` (77); **`path` was only 35B** (this scenario is local harvest/haul, not cross-map travel). The first
attempt truncated `path` off the stale number and saved ~nothing — *measure the field, don't trust the note.*

- [x] **Render-projection by DROPPING never-read fields** (`sim/entityProjection.ts` · `projectSentEntity`).
  A full main-thread read-audit (components/stores/routes + GameCanvas) showed the renderer/HUD read only:
  `needs.{hunger,fatigue,sleep,thirst,hygiene}` (all five drift-prone bars — kept hot; **thirst 0.70/s actually
  drifts *faster* than hunger**, so none were demoted), `activeJob.{type,resourceId,progress}`, `state.{mood,
  health}`, `position`, `currentState`, `nextCellCostLeft`, and `path[pathIndex]`. Everything else is worker-only.
  So the projection DROPS — never resyncs — the unread fields (the `slimTile` pattern for entities): needs `lastX`
  timestamps, the ~12 activeJob ids/coords/scratch fields, the `jobQueue` FSM lookahead (168B!), the three
  `state` FSM booleans (redundant with the hot `currentState`); and truncates `path` to the next 2 cells (drafted
  pawns keep the full path for the order overlay). **Denylists, not allowlists** → a newly-added *read* field stays
  included (fail-safe). The worker's canonical state + saves keep the full objects (nested objects rebuilt fresh,
  never mutated). **Zero staleness — only never-read fields drop, so NO resync/merge machinery was needed** (a
  cleaner outcome than the demote-to-resync first sketched). **slim pawn 766 → ~535B; `pawns` 152k → ~109k (~28%).**
  Guarded by `entityProjection.test.ts`.
- [ ] **Transferable `Float32Array` positions** — the §A/R3 idea; the next entity lever, but a rewrite not a cut.
  The remaining slim-pawn bytes are now genuinely-read render/HUD scalars (`needs` bars, mood/health, position,
  path, activeJob display) — no more free drops.

**Now the biggest growing cost is NOT entities — it's `droppedItems`.** The `[SNAP]` probe shows it shipped whole
every flush and **climbing unbounded with harvest (16k → 31k+ in one session)**; this is the D6 worldMap problem
for items. Next lever:
- [x] **`droppedItems` deltas — DONE (§F, 2026-06-20).** Now rides its own per-id `EntitySync` (`drops`), so only
  stacks whose object ref changed ship each flush; reconstructed by the bridge (`applyDropSync`). The per-unit
  carcass `unitConditions` arrays are kept off the panels' read path via a worker-computed `_carcassCondition`
  summary, and spoilage is throttled (60 ticks) so the array ref stops churning every tick. See §F.
- [ ] **`state` payload `workAssignments` (~46k) + `jobs` (~40–52k)** spike to ~120k when they ride along (the
  D7-reverted territory) — a separate, later lever.

**Lesson of §D, reaffirmed:** every win came from a *correlated/field-level* capture (`[TRIG]`, `[SNAP]`,
`[SNAP-PAWN]`); both blind/assumed moves regressed or no-op'd (D7's throttle; the path-only first cut off the
stale ~900B figure).

---

## §E · CHUNKED TERRAIN — render cost decoupled from map size (2026-06-20)

**New surface, same root cause as §C/§D6 — but on the GPU side and triggered by a content change, not a
profiler dig.** Commit `b2a1031` made 500×500 the default map (`currentMapSize` in `gameState.ts`):
**38,400 → 250,000 tiles**. The whole §D renderer arc was measured against the 38k map; multiplying tiles
by 6.5 reopened every cliff. **TPS held** (the sim is per-entity — the failing playtest was 5 pawns / 420
mobs, and regrowth/foraging touch only local tiles, so tile count barely moves the worker) which is exactly
why it read as "FPS clapped, TPS fine".

### Why it clapped FPS

The terrain layer rendered with **`renderAllTiles: true`** — one static VBO holding *every* tile, drawn in
full each frame. At 250k tiles that is:
- a **~138MB** `Float32Array` (138 floats/tile) held twice (CPU cache + GPU `STATIC_DRAW`),
- **`drawArrays` over ~1.5M vertices every frame** though only ~1–2k tiles are on screen,
- a **full O(250k) rebuild + 138MB re-upload** on any `cacheVersion` bump (worldMap/buildings/zones change)
  — the §D1′ prealloc only shrank this constant factor, it stayed O(map).

The matching worker symptom (the rare `tps=1/6` blips in `perf.log`) is event-rate **full worldMap
re-clones now copying 250k tiles** — same root cause leaking across the boundary.

### Fix — viewport-culled 32² chunks (option C)

- [x] **Per-chunk VAO/VBO, lazy + viewport-culled** (`grid-renderer.ts`). The terrain pass (callers that
  set `cacheVersion`) is sliced into `CHUNK_SIZE = 32`² chunks via a `Map<"cx:cy", TerrainChunk>`. Each
  frame only chunks overlapping the viewport + a 1-chunk margin are visited; a chunk is (re)built —
  `getTilesInRegion` → `generateBatchVertexData` → upload to its own VBO — **only when its `builtVersion`/
  `builtLight` no longer match**, otherwise it just binds its VAO and draws the buffer already resident.
  Off-map chunks cache `count = 0` so they aren't re-scanned. **Render is now O(visible tiles)**: the
  every-frame draw drops from 1.5M verts to ~the screenful, and a content bump rebuilds only the visible
  chunks, not the map.
- [x] **LRU eviction** — chunks not drawn within `CHUNK_EVICT_FRAMES` (~4s) free their GL resources
  (swept every `CHUNK_SWEEP_EVERY` frames), so panning a 500×500 map doesn't accumulate all 244 chunks'
  buffers; the resident set tracks the visited area.
- [x] **Geometry stays camera-independent.** Vertices use WORLD positions; `u_viewOffset`/`u_zoom` apply
  pan+zoom in the shader (unchanged from §D), so a chunk's buffer is valid across pans — only the visible
  SET changes as you scroll, never the geometry. The dynamic overlays (sparse pawn/item/mob grids, no
  `cacheVersion`) keep the unchanged full-render path — they hold a handful of cells.

- [x] **Validated in a live 500×500 playtest (2026-06-20).** User confirmed "FPS is back". `perf.log`
  cross-check: the **sustained pre-fix collapse is gone** — pre-fix the run sat at **14–50 TPS for ~30s,
  bottoming at `tps=1`** (T067xx–T081xx) from the 250k rebuild/clone storm; post-fix a **~90s steady
  stretch (T085xx–T141xx) holds a flat 60–61 TPS** with only **4 isolated single-tick GC/event blips** in
  the whole window and **zero WebGL/chunk errors** in `system.log`. The renderer's main-thread contention
  was also dragging the worker bridge, so flattening it flattened the residual *TPS* dips too — not just
  FPS. `pnpm check`/`pnpm test` green (486 tests). *(`perf.log` logs TPS only; FPS is the user's eyes —
  but the flat-TPS recovery + no sustained dips corroborates it.)*

### Follow-ups (not needed for the FPS fix)

- [ ] **`buildGameGrid` is still O(map).** `redrawOverlayNow` floods + `setTile`s all 250k tiles into a
  fresh `GameGrid` on each terrain-change event (the interior-mountain flood-fill is inherently global).
  Event-rate, not per-frame, so it's the secondary cost — but at 750×750+ it'll want per-chunk dirtying
  (the worker already ships `worldMapDelta`s; plumb changed-chunk ids to invalidate just those chunks
  instead of bumping the global `gridVersion`).

---

## §F · COMBAT + ITEM SNAPSHOT FIXES — engagement-wave dips, and a regression-on-the-fix (2026-06-20)

**Surface:** a 5-pawn/**420-mob** playtest. Two distinct dip families in `.debug/perf.log`, correlated with the
other logs (the spec's method — measure the boundary, not just the sim):
- **Carcass/item growth** — `droppedItems` shipped WHOLE every flush and grew unbounded as kills piled up
  (D8 had flagged this), and the per-unit carcass `unitConditions` arrays both bloated the clone and made the
  sidebar/crafting panels re-scan every drop each flush.
- **Engagement waves** — `perf.log` TPS dips lined up tick-for-tick with `combat.log` mob-vs-mob waves.

### What landed (in order)

- [x] **`droppedItems` per-id `EntitySync` (`drops`).** Added to `SECTIONAL_SKIP`; the worker ships only stacks
  whose object ref changed (`syncDrops`, whole-object ref-diff), the bridge rebuilds via `applyDropSync`
  (replace, not merge — drops carry the full object). Unchanged piles cost nothing/flush.
- [x] **`_carcassCondition` summary.** `carcassConditionByType(drops)` (pure, `core/carcassCondition.ts`) is
  computed WORKER-SIDE only when the `droppedItems` ref changes, shipped as a small `Record<id,number>`; the
  panels read `$gameState._carcassCondition` instead of re-scanning all drops × 2 components each flush. The
  per-unit arrays still ship inside the drop (the autosave persists the projected state — stripping them would
  silently lose carcass spoilage across save/load; `requestSave` is never called).
- [x] **Throttled spoilage.** `stepItemDecay(state, elapsedTicks)` runs every `DECAY_INTERVAL_TICKS = 60`
  (erosion scaled by the elapsed ticks) instead of every tick — it re-referenced the whole `droppedItems` +
  `stockpile` every tick. Mirrors the existing `DETERIORATION_INTERVAL_TICKS` pattern.
- [x] **Chronicle batch (`batchLogReplay`).** A combat flood replayed dozens of `simlog` events in one
  synchronous burst; each `activityLog` mutation re-ran ALL derived views (the `allLogEntries` O(n log n) sort
  over ≤2400 entries, the per-type filters) + every subscribed panel. `activityLog` is now a batchable store;
  the bridge wraps the replay loop so the whole batch fires ONE notification.
- [x] **M4 combat per-hit rebuild → in-place (copy-on-write).** `_applyInjuryToEntity`/`applyOnHitEffect`
  rebuilt the entire 420-mob array (`state.mobs.map()`) on every injury — several per landed hit, dozens of
  hits/tick under a wave. Now `tickCombat` runs `_combatWorking` mode and `spliceEntity` writes the changed
  entity into its array SLOT in place. New entity OBJECTS are still created (cold-field refs stay fresh for the
  snapshot diff; the index-aligned `handleFreshCombatCorpses` still sees old-vs-new), only the array isn't
  rebuilt per hit. Public `applyInjury*` stay immutable for the tests.

### The regression-on-the-fix (the reason for the cross-check rule)

- [x] The FIRST combat cut cloned the mobs + pawns arrays **unconditionally at the top of every `tickCombat`**,
  even at peace — reintroducing the per-tick allocation tax THIS spec is about (★ DONE / R1's 12.5×) and
  churning the `pawnById` array-ref memo (rebuilt every tick). `perf.log` showed new single-tick GC stalls.
  **Fixed with copy-on-write:** `next = state` (no clone); `spliceEntity` clones an array only on the FIRST hit
  that writes it, then writes slots in place. A peace tick writes nothing → clones nothing → zero allocation.
  Guarded by a `tickCombat`-doesn't-mutate-its-input test (`combatSim.test.ts`). **Lesson:** I caused a perf
  regression *while fixing a perf bug* — hence the AGENTS.md rule to cross-check this spec + re-read `perf.log`
  on every hot-path/snapshot edit.

### Still open (combat)

- [ ] **Per-hit `computeCapacities` recompute.** `_applyInjuryToEntity` calls it with a fresh `{...entity,
  limbs, injuries}` → cache-miss every hit → full capacity recompute. Compute, not allocation (won't show in an
  alloc capture) — likely still a slice of the wave cost. Wants a worker-thread capture before touching it.

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
- [x] **worldMap deltas — DONE (§C, 2026-06-15).** Active-harvest hitching *did* show up (TPS 150 → sub-50): `processResourceRegrowth` rebuilt + re-sent the whole 38k worldMap every tick. Now mutates expired tiles in place + ships `worldMapDelta` (changed tiles only). *(Harvest depletion still full-sends its one row on the completion tick — event-rate, fine.)*

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
| **M4 — de-immutable `combat`** | **Dropped at 140 mobs → RE-OPENED + LANDED at 420 (§F)** | Compute-bound with light combat; but a 420-mob mob-vs-mob wave made the per-hit `state.mobs.map()` rebuild dominant. Landed via copy-on-write working clones (`spliceEntity`), corpse-diff preserved. |
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
- [x] **Reproducible scenario (2026-06-15):** `buildProfilerScenario` now `rng.reseed(seed)`s (seed
  `0xf00d`) **before** `generatePawns`/`seedInitialEntities`, so every `--profiler` launch spawns the
  identical colony + event trajectory and the worker replays it deterministically (no `Math.random`/
  wall-clock in sim logic) — removes the run-to-run variance that made captures incomparable. **Caveat:**
  real-time TPS still varies with machine load; only the colony *trajectory* is pinned.
- [x] **Read (headless, scriptable):** parse the JSON with an ad-hoc node script over the shared tables
  (`shared.{stackTable,frameTable,funcTable,stringArray}` + `thread.samples`). Two gotchas: **(1)** weight
  by `samples.threadCPUDelta`, not `timeDeltas` — the worker sleeps between ticks at high TPS, so wall-clock
  shows the idle-park native frame `fun_b4df0` at ~100% while CPU-delta shows real work; **(2)** JIT hides
  JS in unsymbolicated `fun_XXXX` leaves (C++ symbols *are* named), so **inclusive** per-func (walk the
  stack) is the only readable view, not leaf-self. Detect the sim worker by stacks containing
  `processGameTurn`/`tickPawn`. This produced §B and §C. (`pq` is a devDep for interactive querying too.)
- [x] **Allocation capture (the only way to verify de-immutabling, §C):** Firefox Profiler → **"Record
  allocations"** (`jsallocations`) → `thread.jsAllocations` (bytes, inclusive per-func). Sees the inlined
  JIT allocation the CPU sampler can't; TPS is meaningless under it (only the distribution).
- **`firefox-devtools-mcp`** can drive a live browser but has **no profiler-capture tool** and rejects
  Zen's binary (`--version` reports "Zen" not "Firefox") — not usable for capture here.
- **Lesson of the whole arc:** instrument the *boundary*, not just the sim. Every wrong turn (O(n²)
  perception §1, the Rust pivot §A, the de-immutable plateau ★ ACTIVE) came from optimising what was
  *assumed* hot; every win came from a function-level capture of what *actually* was.
