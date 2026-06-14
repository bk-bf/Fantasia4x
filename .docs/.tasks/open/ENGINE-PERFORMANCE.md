<!-- LOC cap: 400 (created: 2026-06-14) -->

# ENGINE PERFORMANCE & SCALING

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [game/DECISIONS](../../game/DECISIONS.md) (ADR-008, ADR-014, ADR-018/019/020) · [RANGED-COMBAT](RANGED-COMBAT.md) (consumes LoS) · [SEASONS_WEATHER](SEASONS_WEATHER.md) (fog of war) · [DISTRIBUTION](DISTRIBUTION.md) · archived: [SIMULATION-PERF](../archive/SIMULATION-PERF-2026-05-30.md)

How entities perceive each other and the world (threat/prey detection, line of sight),
and how that perception — the current #1 sim cost — scales toward hundreds of entities
across the browser **and** the shipped desktop runtime (Tauri or Electron — **wrapper
undecided**; see §5).

> **This spec is provisional until §6 validates it.** Its central claim — that killing
> the O(n²) perception scan yields a large, real speedup — is a *hypothesis backed by one
> profiler run*, not a proven result. **Do not implement LoS, the full persistence model,
> or any downstream spec feature until the §6 validation spike confirms the speedup on the
> profiler sandbox.** If the spike does not move the needle, the premise here is false and
> the spec must be reworked, not shipped.

---

## 1 · Evidence (measured, not assumed)

From the `--profiler` browser sandbox (150 pawns + ~140 mobs, 240×160 map, 4× speed),
captured to `.debug/perf.log` (`[SYS]`/`[RENDER-PROF]`/`[PROF]`):

- **`[SYS]`** — canvas backing store **1024×798 (0.8 MP)**, 22 cores, Intel HD GPU →
  **not** GPU/canvas-bound; the oversized-canvas theory is **falsified**.
- **`[RENDER-PROF]`** — ~3 fps, ~390 ms/frame = **sim ~230 + render ~70 + GPU-idle ~100 ms**,
  **main-thread ~80% busy**. One core of 22 at 80% ≈ 3–4% system-wide → looks idle in a
  monitor. **Single-thread CPU-bound on the sim**, not idle, not GPU.
- **`[PROF]`** — **~15 ms/tick** (headless's 1.4 ms misled: no WASM pathfinding, less
  motion). At 4× the loop runs 16 ticks/frame → ~230 ms. Per-tick: `pawns` ~7 ms ·
  `entityStep` ~3.6 ms · `needsTick` ~2.3 ms · rest <0.6 ms.
- **Smoking gun:** `#findCombatThreat/tick ≈ 154` — once per pawn/entity, each a linear
  scan of all mobs (`findCombatThreat` + twin `findNearestHuntTarget`). 150 × 140 ≈ 21k
  checks/tick, re-deriving `hostile` on every neutral animal. Bulk of the `pawns` phase.

**Conclusion:** the cost is algorithmic (O(n²) perception), single-threaded, identical in
shape on every JS engine. Everything below follows.

**Actions:**

- [x] Honest FPS counter (250 ms→2 s freeze fix) + render-frame profiler landed (commit `02c4dfd`).
- [x] Profiler output persisted to `.debug/perf.log` via the `PERF` tag (no console copy-paste).
- [ ] Re-measure tick cost on the ship engine once the Tauri/Electron scaffold exists (see §6, TAURI A4).

---

## 2 · Goals / Non-goals

**Goals (this spec's definition of done):**

- [ ] (a) Perception is O(n·k), not O(n²).
- [ ] (b) Correct, legible AI: predators commit to a target; prey react only to what they perceive; attacked animals fight back.
- [ ] (c) Line of sight — detection respects walls/terrain.
- [ ] (d) A runtime/threading strategy that survives the desktop WebView, wrapper-agnostic (§5).
- [ ] (e) A cheap falsification test before any of it ships (§6).

**Non-goals — explicitly NOT this spec (guardrails, do not start):**

- [ ] ~~Full multicore~~ · ~~ECS/struct-of-arrays rewrite~~ · ~~per-entity shadowcast FOV~~ · ~~sim off the main thread~~ (separate, later) · ~~deciding the wrapper~~ (DISTRIBUTION milestone).

---

## 3 · Perception & Threat AI (the O(n²) kill)

**Current.** `findCombatThreat(pawn)` and `findNearestHuntTarget(pawn)` each loop all mobs,
every pawn, every tick — no memory; a pawn re-asks "nearest threat" from scratch 60×/s.
O(n²) **and** twitchy re-targeting. Three composing layers fix it (cost × frequency ×
correctness — spatial index = *what's near*, LoS = *what's visible*, persistence = *how
often we ask*; they multiply, none redundant):

**Build:**

- [ ] **Stateful hostility (correctness):** hostile = `entityClass==='mob'` ∪ `Attacking`/`Alerted` ∪ *provoked* (attacked animal gains an aggressor ref + calm-down timer, reverts on survive+disengage). Without it, a class-only pre-filter breaks "boars fight back".
- [ ] **Target persistence (frequency — biggest lever):** lock a target; re-acquire only on a trigger (target dead/gone · out of perception N ticks · reached · self-flee). New fields (names TBD): `targetId`, `targetAcquiredTick`, `lastSeenX/Y`, `provokedBy`, `provokedUntil`.
- [ ] **Bounded acquisition — pull (cost):** query the spatial index (ADR-008 `SpatialIndexService`; verify it's wired, may need implementing) within perception radius → LoS-prune (§4) → nearest visible. Raycasts only on the small candidate set.
- [ ] **Push alerting:** a *moving hostile* radius-queries and alerts nearby prey (+ provocation propagation) — flips O(prey×mobs) → O(hostiles×local); idle prey never poll.

**Decide (open Qs — block the state model):**

- [ ] Provoked → target only the specific attacker, or general aggro toward the colony?
- [ ] On LoS loss → drop the target immediately, or keep a "last-known position" memory window (predator investigates where prey vanished)?

---

## 4 · Line of Sight

**Goal.** Entities don't perceive through sight-blockers (no wolf chasing a goat through a
mountain). Detection = bounded raycast, not fixed radius. Also the cleanest persistence
invalidator (§3): "lost LoS to target" = re-acquire trigger — immediate, physical, beats a
timeout.

**Build:**

- [ ] Add **`blocksSight: boolean`** to `resources.jsonc` + `buildings.jsonc`, **defaulting to `!walkable`** (solid blocks sight for free; no mass annotation).
- [ ] Author the exceptions only: `window` (`walkable:false` but `blocksSight:false`), transparent roof, closed-vs-open door (state-dependent), low cover (scrub/shallow water) `false`.
- [ ] `opaque` bitmap (`Uint8Array`, map-sized) in `spatial-core`, **maintained incrementally** (never rebuilt per query), mirrored like the existing `walkable`/`costs` arrays.
- [ ] **AI raycast:** point-to-point Bresenham/supercover on the small §3 candidate set. **Per-pair-per-tick LoS is forbidden** (O(n²×ray-len) — worse than the bug).
- [ ] **Player fog reveal:** recursive shadowcast FOV — separate, lower-frequency consumer, **not** run per entity.

---

## 5 · Scaling & Runtime strategy

**Reality.** Browser JS is single-threaded; parallelism = Web Workers (message-passing) or
SharedArrayBuffer (typed arrays). Our immutable object-graph `GameState` is single-owner:
`postMessage` deep-copies; SAB needs an ECS rewrite. The shipped runtime is **not** the dev
browser, and **the wrapper is undecided** — Tauri (three OS WebViews: WebKitGTK/JSC,
WebView2/V8, WKWebView/JSC) vs Electron (uniform Chromium/V8+Node). Dev is Firefox
(SpiderMonkey). So Firefox perf numbers don't transfer; Workers are universal but SAB is
reliable only on V8-based runtimes; **WASM runs ~identically on every engine** — the
portable lever regardless of wrapper.

The ordered work is the wrapper-agnostic ladder in **§7** (steps P0–P5). This section only
tracks what feeds the *deferred* wrapper decision:

- [ ] Re-measure on the ship engine (WebKitGTK) — perf doesn't transfer from Firefox (also §1, §6).
- [ ] Record the fragmentation trade (3-engine Tauri vs uniform-V8+threads Electron vs +150–250 MB; SAB portability) as input for the TAURI-milestone decision (§8 table).
- [ ] Keep all hot-compute work wrapper-agnostic (WASM common denominator) so neither wrapper is pre-committed by this spec.

---

## 6 · Validation spike — **DO THIS FIRST, before anything else here**

The cheapest test of the premise. Falsifiable, contained, no new systems.

**The experiment (Step 0):**

- [x] Pre-filter hostiles once per tick into a small array; make `findCombatThreat`/`findNearestHuntTarget` scan that (~10) instead of all mobs (~140). *Implemented:* `mobSubsets()` memo in `pawnHelpers.ts`, keyed on `gs.mobs` identity (self-invalidating). Behaviour-preserving (218 tests green); no persistence/LoS/push/spatial-index yet.
- [ ] Re-run the `--profiler` sandbox in the browser; read `.debug/perf.log`. *(Authoritative — headless lacks WASM movement, so only the browser run validates.)*

**Acceptance — premise holds only if ALL pass.** Note: the pre-filter is a **constant-factor** cut (each scan ~140→~10 hostiles), so its metric is the **`pawns`-phase ms**; `#findCombatThreat/tick` stays ~154 (still once per pawn) until persistence (P1) stops the per-tick re-scan.

- [ ] `pawns` phase drops materially from the pre-filter alone (directional target: 7 ms → ~4–5 ms). If it doesn't move at all → findCombatThreat isn't the cost → premise suspect (see falsification).
- [ ] tick TOTAL trends down in the **same** sandbox (full 7 ms → ≤ 2 ms / 15 ms → ≤ 6 ms targets need P1 persistence + P2 spatial index).
- [ ] `#findCombatThreat/tick` drops toward ~1–2 — **P1 outcome**, not P0; verify after persistence lands.
- [ ] the win **also shows on the ship engine** (WebKitGTK under `tauri dev`, or V8 if Electron) — not just Firefox.

**Falsification (premise wrong → STOP):**

- [ ] If the scan count drops but the tick cost does **not** move → the bottleneck is elsewhere (allocation churn? `entityStep`? state cloning?). Re-profile and rewrite §1–§3 before proceeding. **Never** backlog this as "tracked", build §3/§4/§7 on top, then find the assumption was false.

---

## 7 · Implementation phases (the wrapper-agnostic ladder)

Each phase gated on the previous; do not start one until its gate is met. P0–P3 are the
algorithmic work; P4–P5 are the deferred threading steps from §5.

- [ ] **P0** — §6 validation spike. Pre-filter **landed** (`mobSubsets()` in `pawnHelpers.ts`, behaviour-preserving, 218 tests green); **awaiting browser-sandbox numbers** to confirm the `pawns`-phase drop. *Gate: —*
- [ ] **P1** — full target persistence + stateful/provoked hostility (resolve §3 open Qs). *Gate: §6 passed.*
- [ ] **P2** — spatial-index acquisition + push-based prey alerting (wire/verify `SpatialIndexService`). *Gate: P1.*
- [ ] **P3** — LoS: `blocksSight` data + `opaque` bitmap + WASM raycast; persistence invalidates on LoS loss. *Gate: P2; ADR-019.* **Enables RANGED-COMBAT** (Living-World LoS dep) + SEASONS_WEATHER fog.
- [ ] **P4** — (optional, separate) push hot compute into WASM + sim → one Web Worker. *Gate: measured need.*
- [ ] **P5** — (deferred) SAB multicore / native sim core (form depends on wrapper). *Gate: still CPU-bound after P1–P4.*

---

## 8 · Evaluated & rejected/deferred

- [ ] At the TAURI milestone, decide **Tauri vs Electron** using the §6 ship-engine data; keep both live until then.

| Option | Verdict | Why |
| ------ | ------- | --- |
| Oversized-canvas / GPU theory | **Rejected** | `[SYS]` shows 0.8 MP canvas, 80% main-thread busy — CPU/sim, not GPU. |
| Naive per-pair-per-tick LoS | **Rejected** | O(n²×ray-len) — worse than the bug. Only affordable gated by persistence (§3). |
| Shadowcast FOV per entity | **Rejected (for AI)** | O(radius²) each; overkill for "can A see B". Kept only for player fog reveal. |
| Pre-filter hostiles *alone* | **Stepping stone** | Big constant-factor cut (§6) but still per-tick; persistence is the real fix. |
| SAB multicore *now* | **Deferred** | Needs ECS/SoA rewrite vs the immutable model; reliable only on V8 runtimes. After P1–P4. |
| Electron vs Tauri (wrapper) | **OPEN — decide at TAURI milestone** | Electron = uniform V8 + Node threads vs +150–250 MB/RAM; Tauri = tiny bundle + Rust synergy vs three-engine spread. The §3 fix may make perf moot, tilting it on size/feel. |
| **Fork** Electron / Chromium | **Rejected** | Team-years maintenance (rebasing Chromium patches) for ~zero benefit; configure, don't fork. |
| Embed SpiderMonkey | **Rejected** | Two engines + embedding maintenance for an engine no faster than V8; dominated either way. |
| Native sim core (Rust sidecar / addon) | **Deferred** | Genuine multicore, but forks browser-vs-desktop runtime. Only if §6+P1–P4 still CPU-bound. |

---

## 9 · ADRs & status

- [x] ADR-018 (perception/persistence — provisional, validation-gated), ADR-019 (LoS — design, impl deferred), ADR-020 (scaling ladder — wrapper deferred) written + registered in `codegraph.config.json` (`adr-coverage` ✓).
- [x] Spec written 2026-06-14; profiler tooling + honest FPS counter landed (`02c4dfd`).
- [x] P0 pre-filter (`mobSubsets()` memo) landed 2026-06-14, behaviour-preserving (218 tests green).
- [ ] **Provisional — gated on §6.** No P1+ work (or any downstream spec feature) until the browser sandbox confirms the pre-filter moved the `pawns` phase.
