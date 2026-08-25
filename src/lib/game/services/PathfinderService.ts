import type { WorldTile } from '../core/types.js';
import { wasmPathfinderService } from './WasmPathfinderService.js';

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
  _cache.walkable[y * _cache.width + x] = walkable ? 1 : 0;
}

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

export const BODY_SOFT_PENALTY = 40;

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
  const costs = base.costs.slice();
  for (const key of blocked) {
    const c = key.indexOf(',');
    const x = +key.slice(0, c);
    const y = +key.slice(c + 1);
    if ((x === sx && y === sy) || (x === ex && y === ey)) continue;
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      if (walkable[idx]) costs[idx] += BODY_SOFT_PENALTY;
    }
  }
  return { walkable, costs, width, height };
}

export function buildPathfindingGridsConfined(
  worldMap: WorldTile[][],
  blocked: Set<string>,
  allowed: Set<string>,
  sx: number,
  sy: number
): PathfindingGrids {
  const soft = buildSharedSoftBlockedGrid(worldMap, blocked);
  const { width, height, costs } = soft;
  const walkable = new Uint8Array(width * height);
  for (const key of allowed) {
    const c = key.indexOf(',');
    const x = +key.slice(0, c);
    const y = +key.slice(c + 1);
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      walkable[idx] = soft.walkable[idx];
    }
  }
  if (sx >= 0 && sx < width && sy >= 0 && sy < height) walkable[sy * width + sx] = 1;
  return { walkable, costs, width, height };
}

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
