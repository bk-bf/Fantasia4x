import type { WorldTile } from '../core/types.js';
import { tileKey } from '../core/util/tileKey.js';
import { wasmPathfinderService } from './WasmPathfinderService.js';
import { patchConnectivity, separated } from './entity/connectivity.js';

export interface PathfinderService {
  init(): Promise<void>;
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
    maxIter?: number
  ): { x: number; y: number }[];
  nearestEach(points: Float32Array, queries: Float32Array, maxDist: number): Int32Array | null;
  loadGrid(walkable: Uint8Array, costs: Float32Array, width: number, height: number): void;
  setGridWalkable(index: number, walkable: boolean): void;
  findPathOnGrid(
    softBlocked: Uint32Array,
    penalty: number,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    maxIter?: number
  ): { x: number; y: number }[];
}

export const pathfinderService: PathfinderService = wasmPathfinderService;

type PathfindingGrids = {
  walkable: Uint8Array;
  costs: Float32Array;
  width: number;
  height: number;
};

let _cacheKey: WorldTile[][] | null = null;
let _cache: PathfindingGrids | null = null;
let _loaded: PathfindingGrids | null = null;

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

export function patchPathfindingWalkable(x: number, y: number, walkable: boolean): void {
  if (!_cache) return;
  if (x < 0 || y < 0 || x >= _cache.width || y >= _cache.height) return;
  const idx = y * _cache.width + x;
  const next = walkable ? 1 : 0;
  if (_cache.walkable[idx] === next) return;
  _cache.walkable[idx] = next;
  if (_loaded === _cache) pathfinderService.setGridWalkable(idx, walkable);
  patchConnectivity(_cache, x, y, walkable);
}

export function cannotReach(
  worldMap: WorldTile[][],
  sx: number,
  sy: number,
  ex: number,
  ey: number
): boolean {
  return separated(buildPathfindingGrids(worldMap), sx, sy, ex, ey);
}

export function buildPathfindingGridsWithBlocked(
  worldMap: WorldTile[][],
  blocked: Set<number>,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): PathfindingGrids {
  const base = buildPathfindingGrids(worldMap);
  if (blocked.size === 0) return base;
  const { width, height, costs } = base;
  const walkable = base.walkable.slice();
  const start = tileKey(sx, sy, width);
  const end = tileKey(ex, ey, width);
  for (const key of blocked) {
    if (key !== start && key !== end) walkable[key] = 0;
  }
  return { walkable, costs, width, height };
}

export const BODY_SOFT_PENALTY = 40;

export function withSoftBlocked<T>(
  worldMap: WorldTile[][],
  blocked: Set<number>,
  use: (grid: PathfindingGrids) => T,
  exempt: readonly number[] = []
): T {
  const base = buildPathfindingGrids(worldMap);
  if (blocked.size === 0) return use(base);
  const { walkable, costs } = base;
  const touched: number[] = [];
  const saved: number[] = [];
  for (const key of blocked) {
    if (!walkable[key] || exempt.includes(key)) continue;
    touched.push(key);
    saved.push(costs[key]);
    costs[key] += BODY_SOFT_PENALTY;
  }
  try {
    return use(base);
  } finally {
    for (let i = touched.length - 1; i >= 0; i--) costs[touched[i]] = saved[i];
  }
}

export function findPathOnWorld(
  worldMap: WorldTile[][],
  blocked: Set<number>,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  maxIter = 0,
  exempt: readonly number[] = []
): { x: number; y: number }[] {
  const grid = buildPathfindingGrids(worldMap);
  if (_loaded !== grid && pathfinderService.isReady()) {
    pathfinderService.loadGrid(grid.walkable, grid.costs, grid.width, grid.height);
    _loaded = grid;
  }
  const soft: number[] = [];
  for (const key of blocked) if (grid.walkable[key] && !exempt.includes(key)) soft.push(key);
  return pathfinderService.findPathOnGrid(
    Uint32Array.from(soft),
    BODY_SOFT_PENALTY,
    sx,
    sy,
    ex,
    ey,
    maxIter
  );
}

export function findPathSoftBlocked(
  worldMap: WorldTile[][],
  blocked: Set<number>,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): { x: number; y: number }[] {
  const width = worldMap[0]?.length ?? 0;
  return findPathOnWorld(worldMap, blocked, sx, sy, ex, ey, 0, [
    tileKey(sx, sy, width),
    tileKey(ex, ey, width)
  ]);
}

export function confineGrid(
  grid: PathfindingGrids,
  allowed: Set<string>,
  sx: number,
  sy: number
): PathfindingGrids {
  const { width, height, costs } = grid;
  const walkable = new Uint8Array(width * height);
  for (const key of allowed) {
    const c = key.indexOf(',');
    const x = +key.slice(0, c);
    const y = +key.slice(c + 1);
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      walkable[idx] = grid.walkable[idx];
    }
  }
  if (sx >= 0 && sx < width && sy >= 0 && sy < height) walkable[sy * width + sx] = 1;
  return { walkable, costs, width, height };
}
