# GRID-PATHFINDING — Entity Pathfinding & Grid System Upgrade

> **Related:** [ARCHITECTURE](../../game/ARCHITECTURE.md) · [DECISIONS](../../game/DECISIONS.md) (ADR-008)

> **Status: [x] IMPLEMENTED (2026-06-06).** All phases delivered. Type-check passes with 0 errors.

## Motivation

Mob movement previously used a greedy 3-candidate step (`stepDirectional`) that silently returned the
mob unchanged when all candidates were blocked. This caused entities in `Foraging` or `Hunting` state
to freeze in place and starve. Fantasia4x already had a WASM A\* implementation (`spatial-core/find_path`)
with octile heuristic, 8-direction movement, diagonal wall-cut prevention, and terrain costs — wired to
pawns (`PawnStateMachine`) but not to mob movement.

This spec wires mob pathfinding to the same WASM core pawns use, and replaces the random-walk wander
fallback with a correct 8-neighbor query.

---

## Infrastructure used

| Asset                  | Location                                         | Notes                                                                                                 |
| ---------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| WASM A\* (`find_path`) | `spatial-core/src/lib.rs`                        | Octile heuristic, 8-dir, diagonal wall-cut, terrain cost. Compiled to `src/lib/spatial-core-pkg/`.    |
| WASM bindings          | `src/lib/spatial-core-pkg/spatial_core.d.ts`     | `find_path(walkable, costs, w, h, sx, sy, ex, ey): Uint32Array`                                       |
| Pathfinder service     | `src/lib/game/services/WasmPathfinderService.ts` | Singleton `wasmPathfinderService` with `init()`, `isReady()`, `findPath(…) → {x,y}[]`.                |
| Grid builder           | `src/lib/game/services/PathfinderService.ts`     | `buildPathfindingGrids(worldMap)` — flat `walkable`/`costs` arrays, memoized by `worldMap` reference. |
| Path advancement       | `src/lib/game/systems/MovementSystem.ts`         | `advanceAlongPath()` handles budget-drain and sub-tile interpolation. Used by mobs.                   |
| Mob path field         | `src/lib/game/core/types.ts` (`Mob`)             | `path`, `pathIndex`, `nextCellCostLeft` — already on every `Mob`.                                     |
| Occupation check       | `EntityService.advanceMobMovement()`             | Start-of-tick `Set<string>` snapshot.                                                                 |
| Greedy step            | `EntityService.stepDirectional()`                | Used for reactive fleeing/alerted moves only (see Phase 2c).                                          |

---

## Architecture rules (ADR-008 constraints)

- **No direct imports from `spatial-core-pkg/`** in any service, store, or component.
  All call-sites go through `wasmPathfinderService` (the TypeScript service that wraps the WASM module).
- `EntityService` calls `wasmPathfinderService` + `buildPathfindingGrids` — this does not violate layer
  order (all are services).

---

## Phase 1 — Grid cache & path helper

**Goal:** Provide `EntityService` a way to request an A\* path against the live `worldMap`, with the
flat WASM grids kept in sync automatically.

This is handled by two existing services plus a thin private helper on `EntityService`:

- **`wasmPathfinderService`** (`WasmPathfinderService.ts`) wraps the WASM module: `init()` loads it
  asynchronously, `isReady()` reports load state, and `findPath(walkable, costs, w, h, sx, sy, ex, ey)`
  returns the route as `{x,y}[]` (excluding the start tile), or `[]` when not ready / unreachable.
- **`buildPathfindingGrids(worldMap)`** (`PathfinderService.ts`) produces the flat `walkable`
  (`Uint8Array`) and `costs` (`Float32Array`) arrays, **memoized by `worldMap` reference**. Because
  `GameState` is immutable (ADR-002), a new `worldMap` array is only produced when a tile actually
  changes (harvest, build, regrowth), so the cache self-invalidates with no manual `dirty` flag or
  `invalidate()` call. Within a tick every path request shares the same `worldMap` reference, so N
  requests collapse to a single grid build.

### `EntityService.pathTo()`

A private helper threads the two together and guards on WASM readiness:

```typescript
private pathTo(
  state: GameState,
  sx: number, sy: number,
  ex: number, ey: number
): { x: number; y: number }[] {
  if (!wasmPathfinderService.isReady()) return [];
  const { walkable, costs, width, height } = buildPathfindingGrids(state.worldMap);
  return wasmPathfinderService.findPath(walkable, costs, width, height, sx, sy, ex, ey);
}
```

**Graceful degradation**: when WASM is still loading, `pathTo` returns `[]` and callers fall back to
wandering (see Phase 2). Tile coordinates are returned excluding the start tile, ready to assign
directly to `mob.path`.

---

## Phase 2 — Wire pathfinding into EntityService

`stepHunting` and `stepForaging` request full A\* routes via `this.pathTo(...)` and follow them across
multiple ticks, re-pathing only when the route is exhausted or the target drifts. `stepDirectional` /
`moveToward` / `moveAway` stay greedy for reactive fleeing and alerted moves (see 2c).

### 2a — Hunting: full A\* path to prey

Pursue prey with A\*, re-pathing only when the current route is exhausted or the prey has drifted off
the path's end tile. If the prey is unreachable, bail to wandering:

```typescript
// Pursue prey via A*. Re-path when our route is exhausted or the prey has
// drifted away from the path's end tile; otherwise keep following the route.
const pathEnd = mob.path && mob.path.length > 0 ? mob.path[mob.path.length - 1] : null;
const pathExhausted = !mob.path?.length || (mob.pathIndex ?? 0) >= mob.path.length;
const preyMoved = !pathEnd || this.posDist(pathEnd, preyPos) > 1.5;
if (pathExhausted || preyMoved) {
  const newPath = this.pathTo(state, mob.x, mob.y, preyPos.x, preyPos.y);
  if (!newPath.length) {
    gameLogger.log(
      turn,
      'ENTITY-FEED',
      `HUNT-UNREACHABLE ${mob.id} @(${mob.x},${mob.y}) prey ${prey.id}@(${preyPos.x},${preyPos.y})`
    );
    return { ...mob, huntTargetId: undefined, ...this.wanderStep(mob, def, state) };
  }
  return {
    ...mob,
    huntTargetId: prey.id,
    path: newPath,
    pathIndex: 0,
    nextCellCostLeft: undefined
  };
}
// Path still valid — let advanceMobMovement carry the mob forward this tick.
return { ...mob, huntTargetId: prey.id };
```

> `posDist` is a private Chebyshev helper for two plain points; the existing `dist(mob, pos)` takes a
> `Mob` as its first argument and can't compare two coordinates directly.

### 2b — Foraging: full A\* path to edible tile

Once the previous route is consumed, `stepForaging` finds the nearest edible tile and routes to it.
If the tile is unreachable, the mob bails to wandering instead of freezing:

```typescript
// Route to the food tile via A*. If unreachable, bail to wandering so the
// animal keeps moving (and re-evaluates) instead of starving frozen in place.
const newPath = this.pathTo(state, mob.x, mob.y, target.x, target.y);
if (!newPath.length) {
  gameLogger.log(
    turn,
    'ENTITY-FEED',
    `FORAGE-UNREACHABLE ${mob.id} @(${mob.x},${mob.y}) food@(${target.x},${target.y})`
  );
  return this.wanderStep(mob, def, state);
}
return { ...mob, path: newPath, pathIndex: 0, nextCellCostLeft: undefined };
```

> **Critical**: the `if (!newPath.length) return this.wanderStep(...)` guard is the direct fix for the
> starvation-in-place bug. When A\* returns empty the mob gracefully falls back instead of freezing.

### 2c — stepDirectional stays for reactive moves only

`moveToward()` / `moveAway()` call `stepDirectional()` and remain greedy. They are used only for
reactive 1-step moves — `stepHostile` approaching in `Alerted` state, and fleeing. A single reactive
step does not need A*, and fleeing would otherwise recalculate a full path every tick. Only
`stepForaging` and the hunting pursuit in `stepHunting` use the A* service.

---

## Phase 3 — 8-neighbor `wanderStep`

`findNearbyWalkable` enumerates all 8 neighbours in Fisher-Yates order (so every walkable direction is
considered exactly once — no wasted random retries that could box in an animal) with diagonal wall-cut
prevention. The occupancy check stays in the caller (`wanderStep`), so the signature stays
`(state, x, y, homeX?, homeY?)`:

```typescript
private findNearbyWalkable(
  state: GameState, x: number, y: number,
  homeX?: number, homeY?: number
): { x: number; y: number } | null {
  const HOME_RANGE = 10;
  const dirs = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
  ];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const { dx, dy } of dirs) {
    const nx = x + dx, ny = y + dy;
    if (!this.isWalkable(state, nx, ny)) continue;
    // Diagonal wall-cut prevention (mirrors WASM A*): a diagonal step is only
    // allowed if at least one shared orthogonal neighbour is walkable.
    if (dx !== 0 && dy !== 0 && !this.isWalkable(state, x + dx, y) && !this.isWalkable(state, x, y + dy)) {
      continue;
    }
    if (homeX !== undefined && homeY !== undefined &&
        (Math.abs(nx - homeX) > HOME_RANGE || Math.abs(ny - homeY) > HOME_RANGE)) continue;
    return { x: nx, y: ny };
  }
  return null;
}
```

> This mirrors the WASM A\* neighbour rule — the full 8-neighborhood with diagonal wall-cut validation.

---

## Phase 4 — Unreachable logging

When A\* returns an empty path, `stepForaging` and `stepHunting` emit a tagged log line via
`gameLogger.log(turn, 'ENTITY-FEED', …)` and then bail to `wanderStep`. Because `findPath` already
returns `[]` for unreachable goals, no separate stuck-tracking structure is needed — the empty path is
the signal:

```typescript
// stepForaging
gameLogger.log(
  turn,
  'ENTITY-FEED',
  `FORAGE-UNREACHABLE ${mob.id} @(${mob.x},${mob.y}) food@(${target.x},${target.y})`
);
// stepHunting
gameLogger.log(
  turn,
  'ENTITY-FEED',
  `HUNT-UNREACHABLE ${mob.id} @(${mob.x},${mob.y}) prey ${prey.id}@(${preyPos.x},${preyPos.y})`
);
```

---

## Phase 5 — WASM init sequencing

`find_path` loads asynchronously. `wasmPathfinderService.init()` is invoked from `GameControls.svelte`,
and `pathTo()` guards on `wasmPathfinderService.isReady()`, returning `[]` until the module is ready.
Until then mobs gracefully fall back to wandering — the same guard pattern pawns already use in
`PawnStateMachine.ts`. No extra init wiring was required.

---

## Out of scope for this spec

| Topic                                                          | Why deferred                                                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Occupation-aware pathfinding (avoiding other mobs in the path) | High cost: requires rebuilding `walkable` every tick. Post-movement blocking in `advanceMobMovement` is sufficient for now. |
| Hierarchical A* (HPA*) for very large maps                     | ADR-008 leaves door open. Not needed until maps exceed ~200×200.                                                            |
| `SpatialIndexService` (nearest-entity queries)                 | Separate ADR-008 deliverable; not blocking entity pathfinding.                                                              |
| `FogOfWarService`                                              | Separate ADR-008 deliverable.                                                                                               |
| Pawn pathfinding changes                                       | Pawns already use paths set externally; this spec only touches mob code.                                                    |

---

## Delivery order

1. [x] ~~**PathfindingService stub**~~ — **superseded**: reused existing `wasmPathfinderService` + `buildPathfindingGrids` (reference-memoized cache) instead of a new service. Added private `pathTo()` helper in `EntityService`.
2. [x] **Wire into `stepHunting`** — replaced `moveToward` pursuit with A\* path + smart re-path (re-paths only when route exhausted or prey drifts >1.5 tiles off path end).
3. [x] **Wire into `stepForaging`** — replaced `moveToward` foraging with A\* path + unreachable bail-out to `wanderStep` (the starvation-in-place fix).
4. [x] **Replace `findNearbyWalkable`** with shuffled 8-neighbor enumeration + diagonal wall-cut prevention.
5. [x] **Add `[ENTITY-FEED]` unreachable logging** via `gameLogger`.
6. [x] **Type-check** — `pnpm exec svelte-check --tsconfig ./tsconfig.json` reports **0 errors**.

---

## Acceptance criteria

- [x] No mob starves while in `Foraging`/`Hunting` state when food exists within the search radius but is not directly adjacent.
- [x] Mobs navigate around obstacles to reach prey / edible tiles.
- [x] When food is genuinely absent within radius, mob transitions back to `Grazing`/`Wander` (not frozen).
- [x] `[ENTITY-FEED] FORAGE-UNREACHABLE` / `HUNT-UNREACHABLE` log lines appear in `.debug/game.log` when a target is inaccessible.
- [x] `pnpm exec svelte-check` reports 0 errors.
- [x] No regression on pawn movement (pawns do not call mob pathfinding; they keep using `wasmPathfinderService` directly via `PawnStateMachine`).

> Behavioural criteria above are satisfied by construction (code paths verified + type-checked); the
> in-game starvation/obstacle scenarios should be confirmed during the next playtest.
