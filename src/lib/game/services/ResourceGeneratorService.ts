/**
 * ResourceGeneratorService.ts
 * Populates tile-level resource amounts on the world map after generation.
 * Ported from Celestia: world/generation/resource_gen.gd
 */

import type { WorldTile } from '../core/types';
import { resourceObjectService } from './ResourceObjectService';

/** Simple xorshift32 PRNG — deterministic, seeded. */
function makeRng(seed: number) {
    let s = seed >>> 0 || 1;
    return (min: number, max: number): number => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        const t = (s >>> 0) / 0x100000000;
        return Math.floor(t * (max - min + 1)) + min;
    };
}

/** Simple djb2-style hash for a string. */
function hashString(str: string): number {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
}

class ResourceGeneratorServiceImpl {
    /**
     * Mutates the worldMap in-place to add resource amounts per tile.
     * Called once after generateWorld().
     * @param baseSeed  — the same seed used for world generation
     */
    generateResources(worldMap: WorldTile[][], baseSeed: number): void {
        const resourceSeed = (baseSeed * 7919) >>> 0;

        for (const def of resourceObjectService.getAll()) {
            const resourceId = def.id;
            const seed = (resourceSeed + hashString(resourceId)) >>> 0;
            const rng = makeRng(seed);

            for (const row of worldMap) {
                for (const tile of row) {
                    // Skip if tile already has this resource
                    if (tile.resources[resourceId] !== undefined) continue;
                    // Only place on matching subterrain
                    if (!def.terrainSubtypes.includes(tile.subType)) continue;

                    tile.resources[resourceId] = rng(def.nodeAmountRange[0], def.nodeAmountRange[1]);
                }
            }
        }
    }
}

export const resourceGeneratorService = new ResourceGeneratorServiceImpl();
