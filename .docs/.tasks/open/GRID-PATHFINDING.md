# GRID-PATHFINDING — Entity Pathfinding & Grid System Upgrade

> **Related:** [ARCHITECTURE](../../game/ARCHITECTURE.md) · [DECISIONS](../../game/DECISIONS.md) (ADR-008)

## Motivation

Mob movement currently uses a greedy 3-candidate step (`stepDirectional`) that silently returns the
mob unchanged when all candidates are blocked. This causes entities in `Foraging` or `Hunting` state
to freeze in place and starve. Celestia had an explicit `Grid` class with A* baked into every tile;
Fantasia4x already has a WASM A* implementation (`spatial-core/find_path`) with octile heuristic,
8-direction movement, diagonal wall-cut prevention, and terrain costs — but it is only planned (ADR-008)
and not yet wired to mob movement at all.

This spec upgrades mob pathfinding to use the same WASM core as pawns, adds a proper `PathfindingService`
interface layer, and replaces the random-walk wander fallback with a correct 8-neighbor query.

---

## What already exists (do not duplicate)

| Asset                 | Location                                     | Notes                                                                                                      |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| WASM A* (`find_path`) | `spatial-core/src/lib.rs`                    | Octile heuristic, 8-dir, diagonal wall-cut, terrain cost. Already compiled to `src/lib/spatial-core-pkg/`. |
| WASM bindings         | `src/lib/spatial-core-pkg/spatial_core.d.ts` | `find_path(walkable, costs, w, h, sx, sy, ex, ey): Uint32Array`                                            |
| Path advancement      | `src/lib/game/systems/MovementSystem.ts`     | `advanceAlongPath()` handles budget-drain and sub-tile interpolation. Used by mobs today.                  |
| Mob path field        | `src/lib/game/core/types.ts` (`Mob`)         | `path`, `pathIndex`, `nextCellCostLeft` — already on every `Mob`.                                          |
| Occupation check      | `EntityService.advanceMobMovement()`         | Start-of-tick `Set<string>` snapshot; keep as-is.                                                          |
| Greedy step           | `EntityService.stepDirectional()`            | Demoted to fleeing only (see Phase 3).                                                                     |

---

## Architecture rules (ADR-008 constraints)

- **No direct imports from `spatial-core-pkg/`** in any service, store, or component.  
  All call-sites go through the `PathfindingService` TypeScript interface.
- `PathfindingService` belongs in `src/lib/game/services/PathfindingService.ts`.
- The singleton export is `pathfindingService`.
- `EntityService` may call `pathfindingService` — this does not violate layer order (both are services).

---

## Phase 1 — GridCache (prerequisite)

**Goal:** Maintain the two flat typed arrays that the WASM function requires, in sync with `GameState.worldMap`.

### New file: `src/lib/game/services/PathfindingService.ts`

```typescript
// ── Interface ─────────────────────────────────────────────────────────────────
export interface PathfindingService {
  /**
   * Find an A* path from (sx,sy) to (ex,ey).
   * Returns tile coords [(x,y)…] excluding the start tile, or [] if unreachable.
   * Automatically rebuilds the grid cache when dirty.
   */
  findPath(
    sx: number, sy: number,
    ex: number, ey: number,
    state: GameState
  ): { x: number; y: number }[];

  /**
   * Mark the grid cache stale. Call whenever GameState.worldMap changes
   * (building placed, tile depletion, etc.).
   */
  invalidate(): void;
}
```

### Implementation details

```
PathfindingServiceImpl
  private walkable : Uint8Array | null = null
  private costs    : Float32Array | null = null
  private cacheWidth  : number = 0
  private cacheHeight : number = 0
  private dirty    : boolean = true
```

**`rebuildCache(state)`** — called lazily inside `findPath` when `dirty`:

```
width  = state.worldMap[0].length
height = state.worldMap.length
walkable = new Uint8Array(width * height)
costs    = new Float32Array(width * height)

for each tile at (x, y):
    idx = y * width + x
    walkable[idx] = tile.walkable ? 1 : 0
    costs[idx]    = tile.movementCost > 0 ? tile.movementCost : 1.0

dirty = false
```

**`findPath`**:

```
if dirty → rebuildCache(state)

raw = find_path(walkable, costs, width, height, sx, sy, ex, ey)
// raw is Uint32Array of interleaved x,y pairs

return Array.from({length: raw.length/2}, (_, i) => ({
  x: raw[i*2], y: raw[i*2+1]
}))
```

**Graceful degradation**: if the WASM module is not yet initialized (async load in progress),
return `[]`. Callers already handle empty paths.

**`invalidate()`**: sets `dirty = true`. Called from:
- `GameEngineImpl.processGameTurn()` after any world mutation (building placed, tile depleted)
- `EntityService.stepEntities()` does NOT need to call this — mob position changes don't affect walkability.

---

## Phase 2 — Wire PathfindingService into EntityService

### 2a — Hunting: full A* path to prey

**Current** (`stepHunting`):
```typescript
return this.moveToward({ ...mob, huntTargetId: prey.id }, preyPos, state);
// moveToward → stepDirectional → greedy 3-candidate
```

**Replacement**:
```typescript
// Re-path if: no path, path exhausted, or prey has moved > 1.5 tiles from path end
const pathEnd = mob.path?.[mob.path.length - 1];
const preyMoved = !pathEnd || this.dist(pathEnd, preyPos) > 1.5;
const pathExhausted = !mob.path?.length || (mob.pathIndex ?? 0) >= (mob.path?.length ?? 0);

if (pathExhausted || preyMoved) {
  const newPath = pathfindingService.findPath(mob.x, mob.y, preyPos.x, preyPos.y, state);
  return { ...mob, huntTargetId: prey.id, path: newPath, pathIndex: 0, nextCellCostLeft: undefined };
}
// Path still valid — let advanceMobMovement carry the mob forward this tick.
return { ...mob, huntTargetId: prey.id };
```

### 2b — Foraging: full A* path to edible tile

**Current** (`stepForaging`):
```typescript
return this.moveToward(mob, target, state);
```

**Replacement**: same pattern as 2a, targeting the edible tile.

```typescript
const pathEnd = mob.path?.[mob.path.length - 1];
const targetChanged = !pathEnd || pathEnd.x !== target.x || pathEnd.y !== target.y;
const pathExhausted = !mob.path?.length || (mob.pathIndex ?? 0) >= (mob.path?.length ?? 0);

if (pathExhausted || targetChanged) {
  const newPath = pathfindingService.findPath(mob.x, mob.y, target.x, target.y, state);
  if (!newPath.length) {
    // Genuinely unreachable — bail to wander so the mob doesn't starve in place
    return this.wanderStep(mob, def, state);
  }
  return { ...mob, path: newPath, pathIndex: 0, nextCellCostLeft: undefined };
}
return mob; // advancing via advanceMobMovement
```

> **Critical**: the `if (!newPath.length) return this.wanderStep(...)` guard is the direct fix for the
> starvation-in-place bug. When A* returns empty the mob now gracefully falls back instead of freezing.

### 2c — Demote stepDirectional to fleeing only

`moveToward()` currently calls `stepDirectional()`. After Phase 2, `moveToward` is only used by
`stepHostile` for `Alerted` state (1-step approach). That's fine — a single reactive step doesn't
need A*. Keep `stepDirectional` and `wanderStep` unchanged; only `stepForaging` and the hunting
pursuit call in `stepHunting` switch to the service.

`moveAway()` (fleeing) stays as greedy — fleeing is reactive and 1-step; A* is overkill and would
recalculate every tick.

---

## Phase 3 — 8-neighbor `wanderStep`

**Current** (`findNearbyWalkable`): 8 random attempts at ±1, any failure returns `null`.

**Replace** with deterministic 8-neighbor enumeration shuffled once per call:

```typescript
private findNearbyWalkable(
  state: GameState, x: number, y: number,
  homeX?: number, homeY?: number
): { x: number; y: number } | null {
  const HOME_RANGE = 10;
  const DIRS = [
    {dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0},   // cardinal
    {dx:1,dy:-1},{dx:1,dy:1},{dx:-1,dy:1},{dx:-1,dy:-1}, // diagonal
  ];
  // Fisher-Yates shuffle for natural-looking wander
  const dirs = [...DIRS];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const { dx, dy } of dirs) {
    const nx = x + dx, ny = y + dy;
    if (!this.isWalkable(state, nx, ny)) continue;
    if (homeX !== undefined && homeY !== undefined &&
        (Math.abs(nx - homeX) > HOME_RANGE || Math.abs(ny - homeY) > HOME_RANGE)) continue;
    // Diagonal wall-cut: at least one ortho neighbour must be walkable
    if (dx !== 0 && dy !== 0) {
      if (!this.isWalkable(state, x + dx, y) && !this.isWalkable(state, x, y + dy)) continue;
    }
    if (!this.isOccupied(state, nx, ny, mob.id)) return { x: nx, y: ny };
  }
  return null;
}
```

> Note: this mirrors exactly what `spatial-core/get_neighbors()` would do in Celestia — the
> full 8-neighborhood with diagonal wall-cut validation.

---

## Phase 4 — Stuck-detection via PathfindingService (replaces the _lastPos Map proposal)

Since `findPath` now returns `[]` when a goal is unreachable, the explicit stuck Map is no longer
needed for the **correctness** fix. However, for **logging** we add a lightweight check in
`stepForaging` and `stepHunting`:

```typescript
// In stepForaging, after A* returns empty path:
if (!newPath.length) {
  gameLogger.log(turn, 'ENTITY-FEED',
    `${def.name}#${mob.id.slice(-4)} FORAGE-UNREACHABLE pos=(${mob.x},${mob.y}) target=(${target.x},${target.y}) hunger=${mob.needs.hunger.toFixed(0)}`);
  return this.wanderStep(mob, def, state);
}
```

Same pattern for hunting. This gives the debug signal without a separate tracking structure.

---

## Phase 5 — WASM init sequencing

`find_path` is loaded asynchronously. The existing pattern in the codebase (from ADR-008) is to
call `initSync` from the compiled WASM or `await init()` at app startup. Verify that
`PathfindingServiceImpl.findPath` is never called before the module is ready.

**Guard pattern**:
```typescript
import init, { find_path } from '$lib/spatial-core-pkg/spatial_core.js';

let wasmReady = false;
init().then(() => { wasmReady = true; });

// In findPath():
if (!wasmReady) return [];  // WASM not loaded yet — caller handles empty gracefully
```

If the game engine already ensures WASM is ready before the first tick (check `GameEngineImpl`
or `gameState.ts` store initialization), this guard can be removed and replaced with an assertion.

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

1. **PathfindingService stub** — interface + impl with cache rebuild + WASM call (no EntityService changes yet). Verify `find_path` returns correct paths for a known map slice.
2. **Wire into `stepHunting`** — replace `moveToward` pursuit with A* path. Test: wolves reach rabbits across obstacles.
3. **Wire into `stepForaging`** — replace `moveToward` foraging with A* path + unreachable bail-out. Test: herbivores reach grass; no starvation when surrounded.
4. **Replace `findNearbyWalkable`** with 8-neighbor enumeration.
5. **Add `[ENTITY-FEED]` unreachable logging** via `gameLogger`.
6. **Type-check + run type-check CI** — `pnpm exec svelte-check --tsconfig ./tsconfig.json`.

---

## Acceptance criteria

- [ ] No mob starves while in `Foraging`/`Hunting` state when food exists within the search radius but is not directly adjacent.
- [ ] Mobs navigate around obstacles to reach prey / edible tiles.
- [ ] When food is genuinely absent within radius, mob transitions back to `Grazing`/`Wander` (not frozen).
- [ ] `[ENTITY-FEED] FORAGE-UNREACHABLE` / `HUNT-UNREACHABLE` log lines appear in `.debug/game.log` when a target is inaccessible.
- [ ] `pnpm exec svelte-check` reports 0 errors.
- [ ] No regression on pawn movement (pawns do not call `pathfindingService`).
