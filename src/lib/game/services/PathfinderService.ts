import type { WorldTile } from '../core/types.js';

export interface PathfinderService {
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
