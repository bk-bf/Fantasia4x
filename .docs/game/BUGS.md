# Bug Log — Fantasia4x

Tracks confirmed bugs, root causes, and fix status. Add new entries at the top.

> Performance bugs found in the 2026-06-14 profiling pass live with full context in
> [.tasks/open/ENGINE-PERFORMANCE.md](../.tasks/open/ENGINE-PERFORMANCE.md) + ADR-021. Summarised here.

---

## [FIXED] Stray browser tabs — Electron shell punted its own URL to Zen (`URL` shadowed the global)

**Symptom:** While running the game in the Electron spike (`./launch.sh --electron`), **tabs at
`http://127.0.0.1:5174/` kept opening in the OS browser (Zen)** — periodically on their own and
reliably on **Exit to Main Menu** (which calls `location.reload()`) and on every **HMR reload**.
Felt like the game was "launching itself in the browser for no reason." Maddening because it looked
external (browser session-restore, a VS Code extension, the Claude Code extension were all suspected
and ruled out).

**Root cause (`desktop-spike/electron/main.js`):** a single shadowed variable.

```js
const URL = process.env.SPIKE_URL || 'http://localhost:5173'; // ← shadows the global URL constructor
```

`const URL = …` shadowed the **global WHATWG `URL` constructor for the whole module**, so **every
`new URL(...)` in the file threw `"URL is not a constructor"`**. Each call sat inside a `try/catch`,
so the throws were swallowed and every origin check (`isAppOrigin`, `isLoopbackUrl`, the original
`appOrigin()`) **silently returned `false`**. The navigation-hardening then concluded the app's *own*
dev-server URL was "external" and handed it to `shell.openExternal(url)` → OS browser → stray Zen tab.
Any full navigation fired it: HMR reconnects, the dev-server restart retry, and the menu reload. The
bug was latent from the start; `--hmr` + the reload-heavy menu just made `will-navigate` fire often
enough to be constant.

**Why it resisted several fixes:** the first patches rewrote the origin logic (stable `APP_ORIGIN`
instead of `getURL()`; `localhost`⇄`127.0.0.1`⇄`::1` equivalence; a fail-closed "never punt loopback"
gate) — all **correct logic sitting on code that could never run**, since they too called `new URL()`.
Nothing helped until a diagnostic build (monkeypatch + suppress `shell.openExternal`, log every call
with a stack, plus a temporary `xdg-open` PATH shim that logged the parent-process chain) caught the
tell: `APP=null` and `loop=false` for a plain `http://127.0.0.1:5174/` — impossible **unless
`new URL()` itself is throwing**. That pinned the shadowing.

**Fix:** rename the constant to **`APP_URL`** so the global `URL` constructor is intact; the
fail-closed gate (`shouldOpenExternal` = http(s) **and** not loopback **and** not the app origin) now
actually executes, so a loopback URL can never leak to the browser. A prominent comment warns against
re-introducing a `URL` binding. **Defense-in-depth added the same pass** (independent of this bug):
the `vite.config.ts` `SHELL_UA_MARKER` guard 403s any browser without the desktop-shell User-Agent,
and `./launch.sh --electron` now **network-namespace-sandboxes** the dev server by default
(`unshare --net`, port unreachable from the host browser; `--net-host`/`--profiler` opt out).

## [FIXED] Blueprint-queue jank — fetch jobs churn from colliding reserved-drop ids

**Symptom:** After drag-queuing a row of building blueprints (e.g. mud-brick walls), the assigned
builders **ping-pong rapidly between `MovingToResource` and `Idle`** and never deliver materials —
construction stalls. Reported as "pawns jank back and forth after queuing blueprints" (CODEBASE-REVIEW
N-5). Suspected at first to be a movement/approach-tile yoyo (FLEE-1 class) or a perf-arc regression;
it was neither.

**Root cause (confirmed via a live CDP state dump of the running Electron app):** **duplicate dropped-item
ids.** When `reserveForOrder` (`core/GameState.ts`) splits a stockpile stack to reserve build materials,
it minted the reserved sub-stack's id as `` `${d.id}-resv-${orderId.slice(-6)}` `` — and `slice(-6)` is the
**tail of the building's placement timestamp**. Every building **drag-placed in one batch shares a single
`Date.now()`**, so all of their reserved stacks of the same item, sitting on the same shared stockpile tile,
**collided on one id** (observed: ~15 distinct cordage drops all id `dev-loose-cordage-121-87-resv-548129`,
each with a different `reservedFor`). That detonated `JobService._syncFetchJobs`: its keep-filter did
`find(d => d.id === j.droppedItemId)` → returned the **first** stack sharing the id, whose `reservedFor`
belonged to a *sibling* wall → `reservedFor !== owner` → the valid fetch job was culled → re-added with a
**fresh `Date.now()` id** the same tick. The pawn's claimed `jobId` then dangled (`!jobInPool` in
`handleMovingToResource`) → it dropped to `Idle`, re-claimed the new id next tick, and repeated — a two-tick
oscillation. The latent fragility was old (ADR-016); drag-placing many buildings is what triggered the
collision, so the "since the perf work" association was incidental.

**Fix (three parts, `core/GameState.ts` + `services/JobService.ts`):**
- **Unique reservation ids** — use the **full `orderId`** (unique per building/order), not `slice(-6)`, so
  reserved stacks can no longer collide.
- **Owner-aware fetch matching** — the `_syncFetchJobs` keep-filter and the add-dedup match on **`id` AND
  `reservedFor`/owner**, so even a legacy save with already-collided ids resolves the correct stack and
  stops churning (self-healing).
- **Deterministic job ids** — fetch ids are `` `fetch-${drop.id}-${ownerId}` `` (no `Date.now()`), and the
  redundant `-${Date.now()}` was dropped from construct/craft/deconstruct/refuel too (all key on a unique
  entity id). A transient filter miss can no longer re-mint an id and dangle a claim.

**Verified live** (CDP, drag-placed wall scenario): `Date.now()`-format fetch jobs → 0, builders return to
`Working` and walls complete; no Idle↔MovingToResource flip. `check` 0 errors · `test` 246. (The probe that
caught it — per-transition + filter-reason logging in `work.ts`/`JobService.ts` — was removed after diagnosis.)

## [FIXED] Worker-mode freeze frames — terrain rebuilt on clone ref-churn + fuel churn (perf)

**Symptom:** After the sim→Worker cutover (FPS 35–63) the map hitched periodically — "waves" /
freeze frames affecting pawn movement **and overlay animations**. `[RENDER-PROF]` showed the
`terrain` field spiking **4 ms → 15 ms** during the slow frames; `🎯 GameGrid initialized` log spam
~2/sec.

**Root cause (two compounding):** (1) The worker sends snapshots via `postMessage`, and
structured-clone hands the main thread **brand-new object refs every snapshot** — defeating
GameCanvas's ref-based "did terrain change?" check, so the 90 ms terrain rebuild fired on *every*
snapshot. (2) Even after adding a worker-computed `_terrainRev` revision, the first cut compared the
raw `buildings` ref — but a **lit campfire decrements fuel every tick → a fresh `buildings` array
every tick** → `_terrainRev` bumped constantly → terrain still rebuilt ~2/sec for an *invisible*
change. (The "overlay animations freeze too" detail was the key tell: those run on the render loop's
own clock, so their freezing proved the **render thread itself was blocking** — a rebuild — not a
sim position-update-rate issue.)

**A misfix on the way (reverted):** the first attempt published the full snapshot **every tick**
instead of on flush, on the wrong theory that 15 Hz position pushes looked chunky. Cloning ~290
entities **50×/sec** crashed FPS to **7** (`a24685c` → reverted in `22290e8`). Flush-only (~15 Hz)
restored.

**Fix:** the worker computes `_terrainRev`, bumped only when the **visible** terrain set changes —
comparing a **fuel/lit-excluding building signature** (mirrors `GameCanvas.buildingsVisualSig`;
inlined in the worker since `overlay.ts` pulls webgl/DOM and isn't worker-safe), plus worldMap /
designations / zoneTiles refs. The renderer rebuilds the 38k-tile terrain only when `_terrainRev`
bumps. **Freezes resolved** (user-confirmed). Commits `22290e8` (revert), `1d52954` (fuel-excluding
sig). Full context + post-mortem in
[.tasks/open/ENGINE-PERFORMANCE.md §4b](../.tasks/open/ENGINE-PERFORMANCE.md).

## [FIXED] Pathfinding body-block flood — A* re-flooded the map every tick (perf)

**Symptom:** In a busy colony the sim crawled (~2 fps). The `pawns` phase was ~94 ms/tick;
`#blockedTiles/tick ≈ 145` (≈145 A* requests/tick — ~30× a healthy rate).

**Root cause:** ADR-014 hard occupancy treats every pawn/mob as an **impassable wall** in the A*
grid. With ~290 bodies, routes to jobs/beds were constantly **body-walled**, so A* to such a goal
**explored the entire reachable region before returning empty** (worst-case search), and the FSM
**retried it every tick**. The profiler proved **100 % of failures were `bodyBlocked`** (terrain
*was* reachable) — not terrain-unreachable, so a connectivity pre-check would have done nothing.

**Fix** (`b9726e1`, `buildPathfindingGridsSoftBlocked`): bodies become **high-cost, not walls**
(`BODY_SOFT_PENALTY`), so A* never fails on body-blocking — it routes around when cheap, through a
crowd when sealed, and the **movement layer** (`stepBody`, ADR-014) still enforces no-stacking by
holding at an occupied tile. **`pawns` 94 → 4 ms; `#pathReq` 145 → 0.5; `bodyBlocked` → 0.** Amends
ADR-014's pathing-layer rationale (ADR-021).

## [FIXED] Terrain re-rendered every frame — 38k-tile buffer rebuilt + re-uploaded (perf)

**Symptom:** `renderCPU` ~90 ms while running vs ~11 ms paused (same scene, same 233k verts);
`gpuWait` only ~4 ms, so it was CPU, not the GPU.

**Root cause (two compounding):** (1) terrain and the dynamic entity-overlay **shared one VBO**, so
the overlay clobbered it each frame and the ~21 MB terrain buffer was `bufferData`'d back every
frame. (2) The terrain vertex **cache was invalidated every frame** — `setGrid` bumps `gridVersion`,
and it ran every frame because `designations`/`worldMap` references churn each tick during play
(harvest completions, regrowth); `#terrainCacheHit` was **0**.

**Fix:** dedicated terrain VAO/VBO uploaded only on change (`d2738d2`) + coalesce all sim-driven
terrain rebuilds to ~2/sec (`1c4227c`). **Terrain pass 90 → ~10 ms on most frames; cache now hits.**
Tradeoff: terrain visuals lag ≤500 ms and a rebuild still hitches ~2/sec (tracked in
ENGINE-PERFORMANCE §3; proper fix = designations off the static layer, deferred).

## [FIXED] FPS counter froze below 4 fps (hid the regression)

**Symptom:** The topbar showed a healthy FPS (e.g. 48) while the game ran at ~2 fps — the counter
lied, which is why the perf regression went unnoticed.

**Root cause:** `PerformanceTimer.updateFPS()` **discarded any frame delta > 250 ms** (meant to skip
one-off stalls), so at a sustained <4 fps *every* frame was discarded and the EMA stayed frozen at
the last healthy value.

**Fix** (`02c4dfd`): raise the ignore threshold to 2 s (only true tab-background/debugger pauses), so
sustained slowness registers. Added the `[RENDER-PROF]` per-frame breakdown alongside.

---

## [FIXED] Predator frozen at kill site after eating (home-tether stranding) — HOME_RANGE removed

**Symptom:** A wolf (e.g. #16) hunts prey far across the map, kills + eats it, correctly transitions
to `Wander` — and then **never moves again**, sitting on the kill tile forever (Wander → Sleep →
Wander, `path=none`). Looks like the old "Entities freezing after eating" bug, but the FSM transition
is fine; movement is what's dead.

**Root cause:** `wanderStep` picked its next tile via `findNearbyWalkable(…, mob.homeX, mob.homeY, …)`,
which rejected any neighbour outside `HOME_RANGE` (10 tiles) of the mob's spawn tile — a tether so
grazers don't drift. But a predator chases prey ~100 tiles from spawn; after the kill **every**
neighbour is out of range → `findNearbyWalkable` returns `null` every tick → it can't take a step.
Prey chased far and animals displaced by fleeing hit the same trap.

**This is a RE-REGRESSION.** The home tether had been removed before; the EntityService→`entity/*`
decomposition (2026-06-14) reintroduced an old `findNearbyWalkable` with `HOME_RANGE` baked back in.
A "behaviour-preserving" file move resurrected long-dead logic.

**Fix:** removed the home tether entirely (per standing decision — entities roam freely, no
`HOME_RANGE`). `findNearbyWalkable(state, x, y, selfId?)` now just returns a random walkable,
unoccupied neighbour from wherever the mob is. Deleted the `homeX`/`homeY` `Mob` fields and the spawn
assignment so the var can't creep back. Tests in `entity/findNearbyWalkable.test.ts`. **Do not
re-add a home-range tether** — if grazer drift needs bounding later, do it in the grazing FSM, not by
crippling the shared `findNearbyWalkable`.

## [FIXED] Hunt yoyo — predator sub-tile render snap-back on re-path

**Symptom:** A hunting predator (e.g. wolf #16) visibly yoyos — the sprite springs forward then snaps
back toward its tile centre several times a second — while still making net forward progress toward
fleeing prey. At the logical (per-300-turn) level the chase is clean; the jitter is sub-tile/visual.

**Root cause:** The renderer derives a mob's sub-tile position from `nextCellCostLeft`
(`MovementSystem.simTarget`: `progress = 1 − costLeft/totalCost`). `stepHunting` re-paths every 10
ticks while the prey flees (`preyMoved && (turn − stateSince) % 10 === 0`), and each re-path returned
`nextCellCostLeft: undefined`. A tile crossing takes ~20 ticks at wolf speed, so the reset landed
**mid-crossing**, snapping `progress` back to 0 → the rendered sprite jumped back to tile centre
~6×/second. Pawns never did this: `PawnService.assignPath` leaves `nextCellCostLeft` intact, and the
flee `stepDirectional` even returns the mob unchanged when the new step equals the current one — only
the mob hunt re-path nuked the in-progress crossing.

**Fix** (`src/lib/game/services/entity/entityAI.ts`, `stepHunting`): drop the `nextCellCostLeft:
undefined` from the re-path return so the crossing carries over to the fresh path's first step (always
a neighbour of the same tile, since WASM `find_path` excludes the start tile — see
`spatial-core/src/lib.rs` `reconstruct`). Mirrors pawn `assignPath` / flee `stepDirectional`. This is
the same class as the ADR-014 "no re-path → no yoyo" principle, applied to the sub-tile interp.

## [FIXED] Cornered-flee ping-pong — prey boxed between two threats

**Symptom:** A prey animal (e.g. mountain goat #10) gets stuck in `Fleeing` for minutes, ping-ponging
between two adjacent tiles (observed: (82,101)↔(83,101)). It never exits to `Grazing`.

**Root cause (NOT the state machine):** The goat is boxed between two threats on opposite sides
(pawns to the NE, a predator to the SW). `Fleeing` exited to `Grazing` only when the *closest* threat
passed `def.stats.fleeRange`, but with a threat on each side the goat could never get beyond range of
both — so it stayed in `Fleeing`. And `moveAway` (→ `stepDirectional`, `sign=-1`) only steered away
from the **single closest** threat each tick; when the closest flipped side to side, the chosen tile
flipped too → the greedy per-tick step oscillated instead of committing to an escape (a *pathing*
weakness, not an FSM one). The animal flee also had no give-up timeout (the hostile flee did).

**Fix** (`src/lib/game/services/entity/`): flee to a **distant destination via A\***, not greedy
local steps — local maximin still dead-ended prey in corners and then stranded them (a first attempt;
kept only as a fallback).
- New `entityHelpers.fleeToSafety(mob, threats[], state)`: the mob **locks a destination** (`mob.fleeDest`)
  ~**half the map** away, in the direction that maximises the **minimum** distance to every threat, and
  **runs to that exact point** — re-routing around blocks toward the SAME tile — until it arrives or the
  point stops being safe (a threat got within half the flee distance of it). Only then does it pick a
  new goal. The prey disregards briefly moving *nearer* a threat to clear a pocket (8 headings ranked
  by safety; a corner-escape falls through to a less-safe-but-reachable one). **Why a locked, far
  destination:** earlier versions re-chose the "safest direction" every time the path ended (timer, or
  on every block/exhaustion). When two directions were near-tied (e.g. south `min-dist 44` vs NE `42`),
  the winner flipped as the threat moved → run south, then run NE — a **big-range yoyo**. Locking the
  goal removes the per-recompute choice; and "half the map" means the prey almost always breaks
  flee-range and exits Fleeing long before it ever arrives. Falls back to a local maximin step only when
  nothing distant is reachable.
- Fallback: when no distant point is reachable (or the pathfinder isn't ready),
  `fleeFromThreats(mob, threats, state)` takes one local maximin step (or holds), so a truly walled-in
  animal still reacts.
- Both `Fleeing` cases (`stepAnimal` + `stepHostile`) gather every threat within `fleeRange`
  (nearest pawn + nearest predator) and call `fleeToSafety`. The `SAFE_RESET_TICKS` give-up now fires
  **only when cornered** (`!mob.fleeDest` — no committed run, just holding), so a boxed-in prey still
  drops back to `Grazing`/`Wander` to re-evaluate, but a mob mid-run is NEVER timed out (timing it out
  re-startled it into a fresh, possibly-flipped destination — reintroducing the yoyo). `fleeDest` is
  cleared on every flee exit and on each fresh Startled→Fleeing. Tests in `entity/fleeFromThreats.test.ts`.
- Diagnostics: `entityAI.logFleeTrigger` emits `ENTITY-FLEE` lines (→ `.debug/entities.log`) at each
  →Startled transition (threat kind/pos/distance vs vision/flee ranges) so a cornered flee is
  diagnosable from the log.

## [FIXED] In-sync movement stagger + entities phasing through each other

**Symptom:** Two flavours of the same root problem. (1) During hunts/chases, a pursuer moving at the same speed as its quarry would stagger — stepping forward, snapping back, re-pathing every tick. (2) Enemies walked straight **through** pawns and through each other, letting them surround a defender or stack on one tile and deal stacked melee damage (no doorway/chokepoint defence possible).

**Root cause:** The movement model was "soft." Pathfinding used a terrain-only grid (entities not treated as walls), entities passed through each other mid-path, and the only no-stacking gate fired at a path's **final** tile against a snapshot taken at the **start of the tick**. A follower arriving on the tile the leader occupied at tick-start — but had already vacated that same tick — was falsely flagged blocked; its path was wiped and the FSM re-pathed next tick, producing the back-and-forth. Separately, nothing stopped mid-path phasing or two movers converging on one tile. Five callsites each defined "occupied" differently, so mobs and pawns disagreed.

**Fix** (ADR-014): Introduced `services/OccupancyService.ts` as the single source of truth for solid-body occupancy. Both pathfinding (`buildPathfindingGridsWithBlocked` masks occupied tiles → A\* routes around bodies) and the per-tick movement passes (`EntityService.advanceMobMovement`, `PawnService.processMovement`) consult it. One body per tile; blocked movers **hold and keep their path** (no re-path → no yoyo) and drop it after ~1.5 s to break deadlocks. Mobs gained a `blockedTicks` field. Regression coverage in `entitySim.test.ts` (`hard tile occupancy`).

## [FIXED] Hunt-chase stutter and global entity freeze

**Symptom:** During a wolf/deer (or any predator/prey) chase, the prey would stutter — freezing for ~1 second, then fleeing, then freezing again. Simultaneously, ALL entities on the map would briefly freeze during the chase.

**Root causes (three interacting):**

1. **Prey couldn't stay in combat.** `stepAnimal` had no `case 'Attacking'` in its switch. When a hunter forced prey into `Attacking` via `pendingMobState`, the prey's next tick fell through to `default` → `Grazing` → immediately `Startled` (1-second freeze) → `Fleeing`. This created a cycle: catch → freeze → flee → catch → freeze → flee.

2. **Hunt pathfinding ran every tick.** In `stepHunting`, the `preyMoved` check triggered A* re-pathing whenever prey drifted >1.5 tiles from the path end. Since fleeing prey moves every tick, wolves re-pathed every single tick. With multiple hunters, this stalled the main thread and caused the global entity freeze.

3. **Hostile `Fleeing` didn't drain stamina.** The hostile mob `Fleeing` case had no stamina drain — only the animal `Fleeing` case did. Hostile mobs fleeing from pawns could run forever without exhaustion.

**Fix** (`src/lib/game/services/EntityService.ts`):
- Added `case 'Attacking'` to `stepAnimal`: prey holds position while adjacent to its attacker; flees only if the attacker moves away or dies.
- Throttled hunt re-pathing to every 10 ticks (instead of every tick) when prey has moved, preventing main-thread stalls.
- Added stamina drain to hostile `Fleeing` case (mirrors animal Fleeing): drains `FLEE_STAMINA_DRAIN_PER_SECOND`, transitions to `Exhausted` when empty.
- Added `case 'Exhausted'` to `stepHostile` switch so hostile mobs can recover stamina after fleeing.

---

## [FIXED] Map flash on page load / hot reload / wipe

**Symptom:** During page load, hot reload, or after clicking the **Wipe** button, the map briefly displayed a freshly-generated world before snapping to the saved one (or vice-versa on wipe).

**Root causes (two interacting):**

1. **Synchronous `initialGameState` with generated world.**
   The store is created at module load with a brand-new `generateWorld()` result. Svelte subscribers (GameCanvas, etc.) render this immediately. The *real* persisted save is loaded asynchronously from IndexedDB and applied later, causing a visible flash as the ephemeral generated map is replaced by the stored one.

2. **`wipeAndReload()` called `set(initialGameState)` before reload.**
   After deleting the save, the function pushed a new generated world into the store for a split-second before `location.reload()` fired, causing the old stored map to flash back and forth.

**Fix** (`src/lib/stores/gameState.ts`, `src/routes/+page.svelte`):
- Added `storeReady` writable flag (default `false`). It becomes `true` only after `savedStateReady` resolves and the correct state is in the store.
- `+page.svelte` gates the entire game UI behind `{#if $storeReady}`; while loading, a minimal `LOADING…` screen is shown. The ephemeral generated map never reaches the DOM.
- `wipeAndReload()` now sets `storeReady.set(false)` immediately (hiding the game) and removes the pointless `set(initialGameState)` call before reload.

---

## [FIXED] Global simultaneous entity flickering

**Symptom:** All entities on the map visually lurched/snapped to new positions at the same time, roughly 15× per second, regardless of their individual state.

**Root causes (two interacting):**

1. **Stale mob/pawn data in the overlay renderer** (`GameCanvas.svelte` — `updatePawnOverlay`).
   The component's `mobs` and `pawns` variables are only refreshed by the Svelte store subscriber, which fires every 4 simulation ticks (`UI_PUSH_INTERVAL = 4`). The game engine calls `gameStore.setSilent()` every tick, so `get(gameState)` is always current. The overlay was interpolating toward 4-tick-old targets; when the throttled flush fired, every entity simultaneously jumped to catch up with the real position.

2. **Unclamped frame `dt` causing `alpha ≈ 1`.**
   When pathfinding for 45 entities stalls the JS thread, the next `requestAnimationFrame` callback receives a large `dt` (e.g. 200 ms). With `MOVE_SMOOTH_TAU = 0.06 s` that produces `alpha ≈ 0.97`, snapping all entities near-instantly rather than easing them.

**Fix** (`src/lib/components/UI/GameCanvas.svelte`):
- `updatePawnOverlay` now reads `get(gameState).mobs` / `.pawns` instead of the subscriber-throttled component variables, so the renderer always uses current-tick positions.
- `dt` is clamped to 50 ms before computing `alpha`, preventing whole-world snap on CPU-stall frames.

---

## [FIXED] Hunter yoyo — predator switching targets every tick

**Symptom:** Carnivore entities (wolves etc.) would continuously swap prey targets, causing them to run back and forth rather than pursuing a single animal.

**Root cause:** `findNearestPrey()` was called unconditionally every tick. Any closer animal that wandered into range caused an immediate target switch, resetting the A* path and producing zigzag movement.

**Fix** (`src/lib/game/services/EntityService.ts`):
- Added `huntTargetId` target-locking on `Mob`: once a target is set, the hunter pursues it exclusively.
- Re-evaluation only happens when the target becomes invalid (dead, stripped, tamed) or a corpse appears (free food opportunity).
- Added `huntCooldownUntil` field: if pathfinding to prey fails, the entity enters Wander state with a 60-second cooldown before re-entering Hunting.

---

## [FIXED] Entities freezing after eating

**Symptom:** After an entity finished eating (completing `eatProgress`), it remained stuck in its current state (`Hunting`/`Foraging`) indefinitely with no target.

**Root cause:** The `eatProgress` completion branch in `stepForaging` and `stepHunting` returned without explicitly setting a new state, leaving the FSM in Hunting/Foraging with no target to act on.

**Fix** (`src/lib/game/services/EntityService.ts`):
- All `eatProgress` completion paths now explicitly transition to a rest state (`'Grazing'` for passive animals, `'Wander'` for hostile entities) and set `path: []`.

---

## [FIXED] Entity flickering on state transitions (path not cleared)

**Symptom:** Individual entities would briefly jump backward by ~0.5 tile when changing FSM state (e.g. Grazing → Fleeing, Startled → Fleeing).

**Root cause:** State-transition returns in `stepAnimal`/`stepHostile` spread `...mob` without resetting `path`. The previous wander path was preserved in the new state; the movement engine followed it for one tick before the FSM assigned the correct flee/hunt path, causing a one-frame lurch in the wrong direction.

**Fix** (`src/lib/game/services/EntityService.ts`):
- All 15+ FSM state-transition return sites now include `path: []` to discard the old path immediately.

---

## [OPEN] Elk FORAGE-UNREACHABLE oscillation

**Symptom:** An elk stuck near impassable terrain (e.g. `mob-elk-6000-18`) logs `FORAGE-UNREACHABLE` every 2 ticks indefinitely. The entity oscillates between `Foraging` and `Grazing` states at ~30 ticks/second.

**Root cause:** When pathfinding to a food tile fails, `stepForaging` correctly transitions the mob to `Grazing`. But on the very next tick, the hungry-check in `stepAnimal` re-enters `Foraging` unconditionally (no cooldown). The same unreachable tile is found again, producing an infinite loop.

**Fix (not yet applied):** Add a `forageCooldownUntil?: number` field to `Mob` (mirroring the existing `huntCooldownUntil`). Set it when `FORAGE-UNREACHABLE` fires, and guard the `canForage → Foraging` transition in `stepAnimal` with a cooldown expiry check.
