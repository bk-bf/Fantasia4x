# Bug Log — Fantasia4x

Tracks confirmed bugs, root causes, and fix status. Add new entries at the top.

---

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

**Fix** (`src/lib/game/services/entity/`):
- New `entityHelpers.fleeFromThreats(mob, threats[], state)`: picks the walkable, unoccupied neighbour
  that maximises the **minimum** (Chebyshev) distance to **every** in-range threat (maximin). With one
  threat it flees straight away; boxed between two it slips **perpendicular** (through the gap) and —
  via a same-step/heading tie-break — commits to that direction instead of reversing each tick (which
  also preserves the in-progress crossing, so no render snap). When no neighbour keeps the closest
  threat as far as standing still, it **holds** (stands fast) rather than thrash into a worse tile.
- Both `Fleeing` cases (`stepAnimal` + `stepHostile`) now gather every threat within `fleeRange`
  (nearest pawn + nearest predator) and call `fleeFromThreats`; the animal case gained the
  `SAFE_RESET_TICKS` give-up the hostile case already had, so a persistently boxed-in prey drops back
  to `Grazing` to re-evaluate instead of fleeing forever. Tests in `entity/fleeFromThreats.test.ts`.
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
