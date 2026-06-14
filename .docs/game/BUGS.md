# Bug Log — Fantasia4x

Tracks confirmed bugs, root causes, and fix status. Add new entries at the top.

> Performance bugs found in the 2026-06-14 profiling pass live with full context in
> [.tasks/open/ENGINE-PERFORMANCE.md](../.tasks/open/ENGINE-PERFORMANCE.md) + ADR-021. Summarised here.

---

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
