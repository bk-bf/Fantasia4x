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

/** Convert a WorldTile[][] into flat walkable + cost arrays for the pathfinder. */
export function buildPathfindingGrids(worldMap: WorldTile[][]): {
    walkable: Uint8Array;
    costs: Float32Array;
    width: number;
    height: number;
} {
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

    return { walkable, costs, width, height };
}
