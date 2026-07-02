import type { WorldTile } from '../core/types.js';
import { wasmPathfinderService } from './WasmPathfinderService.js';

export interface PathfinderService {
  /** Initialise the underlying pathfinder (WASM). Idempotent — safe to call multiple times. */
  init(): Promise<void>;
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
    ey: number,
    /** Per-call node-expansion cap (0/omitted = full-grid default, for long pawn paths). Mob
     *  callers pass a tight cap so an unreachable goal bails fast instead of sweeping the whole
     *  connected region (ENGINE-PERFORMANCE-II). */
    maxIter?: number
  ): { x: number; y: number }[];
  /**
   * Batch nearest-entity query (ENGINE-PERFORMANCE-II §S1). For each `[qx,qy]` in `queries`,
   * returns the index into `points` (flat `[x,y,…]`) of the nearest within `maxDist`, or -1.
   * Returns `null` while the backend isn't ready (caller falls back to a JS scan).
   */
  nearestEach(points: Float32Array, queries: Float32Array, maxDist: number): Int32Array | null;
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
 * Patch a single tile's walkability in the memoized base grid. Required because the cache is keyed
 * on `worldMap` identity, but several hot paths flip `tile.walkable` IN PLACE (build/deconstruct
 * footprints, regrowth restore) while deliberately keeping the worldMap ref stable — so the memo
 * would otherwise serve a stale grid and A* would route pawns straight onto a freshly-built wall.
 * O(1), keeps the cache warm; the WithBlocked/SoftBlocked builders `.slice()` this base per call,
 * so the patch propagates. No-op if the cache isn't built yet (it'll be built correct on first use).
 */
export function patchPathfindingWalkable(x: number, y: number, walkable: boolean): void {
  if (!_cache) return;
  if (x < 0 || y < 0 || x >= _cache.width || y >= _cache.height) return;
  _cache.walkable[y * _cache.width + x] = walkable ? 1 : 0;
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

/**
 * Like the soft-blocked grid, but additionally CONFINES the route to `allowed` tiles: every tile not in
 * the set becomes a hard wall, so A* (the WASM pathfinder, untouched — ADR-008) can never route a pawn
 * outside its restriction zone. Body avoidance still applies (costs come from the shared soft-blocked
 * grid). The mover's own tile is always kept walkable so A* can start and step back in if it ends up just
 * outside. A goal outside `allowed` yields no route — the caller's "unreachable" handling copes.
 *
 * Builds a FRESH walkable array (all walls, then opens the allowed tiles) — O(allowed), not O(map) — and
 * shares the soft-blocked cost array by reference (read-only).
 */
export function buildPathfindingGridsConfined(
  worldMap: WorldTile[][],
  blocked: Set<string>,
  allowed: Set<string>,
  sx: number,
  sy: number
): PathfindingGrids {
  const soft = buildSharedSoftBlockedGrid(worldMap, blocked);
  const { width, height, costs } = soft;
  const walkable = new Uint8Array(width * height); // everything a wall by default
  for (const key of allowed) {
    const c = key.indexOf(',');
    const x = +key.slice(0, c);
    const y = +key.slice(c + 1);
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      walkable[idx] = soft.walkable[idx]; // keep terrain walkability — an in-zone wall stays a wall
    }
  }
  if (sx >= 0 && sx < width && sy >= 0 && sy < height) walkable[sy * width + sx] = 1;
  return { walkable, costs, width, height };
}

// Per-tick shared soft-blocked grid (mob hot path). Every mob pathing in one FSM tick sees IDENTICAL
// occupancy, so the O(map) cost-array clone + penalty pass is built ONCE and reused — keyed on the
// (worldMap, blocked) refs, both stable through a tick (blocked = the per-tick-cached occupancy set;
// worldMap only flips on a tile mutation). Without this, a busy combat tick rebuilt the full 562k-tile
// cost array PER path request — measured 35% of the worker once many mobs re-path (deadlock re-route /
// un-frozen hunters). Unlike `buildPathfindingGridsSoftBlocked`, there is NO per-call start/goal
// exemption (it can't be applied to a shared array): the start tile's own penalty is irrelevant to A*
// (start g=0), and mob melee goals are unoccupied adjacent tiles, so neither exemption mattered.
let _sbWorld: WorldTile[][] | null = null;
let _sbBlocked: Set<string> | null = null;
let _sbResult: PathfindingGrids | null = null;

export function buildSharedSoftBlockedGrid(
  worldMap: WorldTile[][],
  blocked: Set<string>
): PathfindingGrids {
  const base = buildPathfindingGrids(worldMap);
  if (blocked.size === 0) return base;
  if (_sbWorld === worldMap && _sbBlocked === blocked && _sbResult) return _sbResult;
  const { width, height, walkable } = base;
  const costs = base.costs.slice();
  for (const key of blocked) {
    const c = key.indexOf(',');
    const x = +key.slice(0, c);
    const y = +key.slice(c + 1);
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      if (walkable[idx]) costs[idx] += BODY_SOFT_PENALTY;
    }
  }
  _sbWorld = worldMap;
  _sbBlocked = blocked;
  _sbResult = { walkable, costs, width, height };
  return _sbResult;
}
