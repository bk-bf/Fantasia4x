/**
 * ResourceGeneratorService.ts
 * Populates tile-level resource amounts on the world map after generation.
 * Ported from Celestia: world/generation/resource_gen.gd
 */

import type { WorldTile } from '../core/types';
import { resourceObjectService } from './ResourceObjectService';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '../core/Terrains';

/** Simple xorshift32 PRNG — deterministic, seeded. */
function makeRng(seed: number) {
    let s = seed >>> 0 || 1;
    return (min: number, max: number): number => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        const t = (s >>> 0) / 0x100000000;
        return Math.floor(t * (max - min + 1)) + min;
    };
}

class ResourceGeneratorServiceImpl {
    /**
     * Mutates the worldMap in-place to add resource amounts per tile.
     * Called once after generateWorld().
     * @param baseSeed  — the same seed used for world generation
     */
    generateResources(worldMap: WorldTile[][], baseSeed: number): void {
        const resourceSeed = (baseSeed * 7919) >>> 0;
        const defs = resourceObjectService.getAll();
        const rng = makeRng(resourceSeed);

        for (const row of worldMap) {
            for (const tile of row) {
                const baseSubType = tile.subType;

                for (const def of defs) {
                    const chance = def.spawn.subterrains[baseSubType] ?? 0;
                    if (chance <= 0) continue;

                    const roll = rng(0, 100000) / 100000;
                    if (roll >= chance) continue;

                    // Spawn this object on the tile.
                    tile.resources[def.id] = rng(def.nodeAmountRange[0], def.nodeAmountRange[1]);

                    // Update physics from the resource's objectSubType subterrain.
                    // tile.subType stays as the base terrain; visuals are layered in the renderer.
                    const resourceSub = SUBTERRAINS[def.objectSubType] ?? SUBTERRAIN_FALLBACK;
                    tile.ascii = pickChar(resourceSub, tile.x, tile.y);
                    tile.walkable = resourceSub.walkable;
                    tile.movementCost = resourceSub.movementCost;

                    // One primary object per tile keeps biome->terrain->object flow predictable.
                    break;
                }
            }
        }
    }
}

export const resourceGeneratorService = new ResourceGeneratorServiceImpl();
