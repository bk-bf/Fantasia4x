import type { WorldTile } from '../core/types.js';
import { wasmPathfinderService } from './WasmPathfinderService.js';
import { profCount } from '../core/log';

export interface PathfinderService {
  /** Whether the underlying pathfinder (WASM) has finished initialising. */
  isReady(): boolean;
  findPath(
    walkable: Uint8Array,
    costs: Float32Array,
    width: number,
    height: number,
    sx: number,
    sy: number,
    ex: number,
    ey: number
  ): { x: number; y: number }[];
}

/**
 * The active pathfinder, typed as the interface (ADR-008). Consumers in the simulation core
 * must depend on this binding — never import `WasmPathfinderService` (the spatial impl) directly.
 * The concrete WASM impl is wired in here, the one composition point allowed to know it.
 */
export const pathfinderService: PathfinderService = wasmPathfinderService;

type PathfindingGrids = {
  walkable: Uint8Array;
  costs: Float32Array;
  width: number;
  height: number;
};

// Memoize the flattened grids by worldMap reference. GameState is immutable, so a
// new worldMap array is only produced when a tile actually changes (harvest, build,
// regrowth). Within a tick every path request shares the same worldMap reference, so
// this collapses N rebuilds (one per pawn/path) into one. wasm-bindgen copies these
// arrays into wasm memory on findPath(), so the cached buffers are never neutered.
let _cacheKey: WorldTile[][] | null = null;
let _cache: PathfindingGrids | null = null;

/** Convert a WorldTile[][] into flat walkable + cost arrays for the pathfinder. */
export function buildPathfindingGrids(worldMap: WorldTile[][]): PathfindingGrids {
  if (_cacheKey === worldMap && _cache) return _cache;

  const height = worldMap.length;
  const width = worldMap[0]?.length ?? 0;
  const walkable = new Uint8Array(width * height);
  const costs = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = worldMap[y][x];
      const idx = y * width + x;
      walkable[idx] = tile.walkable ? 1 : 0;
      costs[idx] = tile.movementCost > 0 ? tile.movementCost : 1;
    }
  }

  _cacheKey = worldMap;
  _cache = { walkable, costs, width, height };
  return _cache;
}

/**
 * Like buildPathfindingGrids but treats entity-occupied tiles as walls so A* routes
 * AROUND other bodies (a pawn standing in a doorway becomes a real chokepoint). The
 * start (sx,sy) and goal (ex,ey) tiles are kept walkable — the mover stands on the
 * former and the caller has already chosen the latter as a valid, unoccupied target.
 *
 * Clones only the walkable array (costs are shared, never mutated). When `blocked` is
 * empty the memoized base grid is returned as-is.
 */
export function buildPathfindingGridsWithBlocked(
  worldMap: WorldTile[][],
  blocked: Set<string>,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): PathfindingGrids {
  const base = buildPathfindingGrids(worldMap);
  if (blocked.size === 0) return base;
  const { width, height, costs } = base;
  const walkable = base.walkable.slice();
  for (const key of blocked) {
    const c = key.indexOf(',');
    const x = +key.slice(0, c);
    const y = +key.slice(c + 1);
    if ((x === sx && y === sy) || (x === ex && y === ey)) continue;
    if (x >= 0 && x < width && y >= 0 && y < height) walkable[y * width + x] = 0;
  }
  return { walkable, costs, width, height };
}

/**
 * Movement-cost penalty added to an occupied tile when bodies are treated as SOFT obstacles
 * (see `buildPathfindingGridsSoftBlocked`). High enough that A* strongly prefers routing AROUND
 * other bodies, but finite — so it still finds a route THROUGH a crowd when there is no way
 * around, rather than failing. Tunes the max detour A* will take to avoid a body (~this many
 * extra tiles). Contrast the hard-wall builder, where a sealed route makes A* flood the whole
 * region and return empty (the per-tick failed-search churn the profiler caught).
 */
export const BODY_SOFT_PENALTY = 40;

/**
 * Like `buildPathfindingGridsWithBlocked` but bodies are **soft**: occupied tiles stay walkable
 * and instead take a `BODY_SOFT_PENALTY` cost bump. A* therefore NEVER fails on body-blocking —
 * it routes around bodies when cheap and plans through them (betting they move) when sealed in,
 * and the movement layer (`stepBody`, ADR-014) enforces the actual no-stacking by HOLDING the
 * mover at an occupied tile until it clears. The mover's own tile and goal are never penalised.
 */
export function buildPathfindingGridsSoftBlocked(
  worldMap: WorldTile[][],
  blocked: Set<string>,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): PathfindingGrids {
  profCount('softGrid'); // confirm the soft path-grid is the one in use (profiler check)
  const base = buildPathfindingGrids(worldMap);
  if (blocked.size === 0) return base;
  const { width, height, walkable } = base;
  // Penalise occupied tiles in a COST clone (terrain costs stay memoized); leave `walkable`
  // untouched so no tile ever becomes impassable — that is the whole point.
  const costs = base.costs.slice();
  for (const key of blocked) {
    const c = key.indexOf(',');
    const x = +key.slice(0, c);
    const y = +key.slice(c + 1);
    if ((x === sx && y === sy) || (x === ex && y === ey)) continue;
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      if (walkable[idx]) costs[idx] += BODY_SOFT_PENALTY; // only on walkable terrain
    }
  }
  return { walkable, costs, width, height };
}
