/**
 * ResourceGeneratorService.ts
 * Populates tile-level resource amounts on the world map after generation.
 * Ported from Celestia: world/generation/resource_gen.gd
 */

import type { WorldTile } from '../core/types';
import type { ResourceObjectDef } from './ResourceObjectService';
import { resourceObjectService } from './ResourceObjectService';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '../core/Terrains';

/** Subterrains that must never be empty — they always carry one of their valid resources. */
const GUARANTEED_FILL_SUBTYPES = new Set(['mineral_deposit']);

/** Simple xorshift32 PRNG — deterministic, seeded. */
function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return (min: number, max: number): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
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

        let placed = false;
        for (const def of defs) {
          const chance = def.spawn.subterrains[baseSubType] ?? 0;
          if (chance <= 0) continue;

          const roll = rng(0, 100000) / 100000;
          if (roll >= chance) continue;

          this.placeResource(tile, def, rng);
          placed = true;
          // One primary object per tile keeps biome->terrain->object flow predictable.
          break;
        }

        // Bug fix: some subterrains (mineral_deposit) must NEVER be empty — a mineral deposit
        // always holds a metal ore, salt, or coal. If the independent rolls above all missed,
        // force-place one of the tile's valid resources, weighted by their spawn chance here.
        if (!placed && GUARANTEED_FILL_SUBTYPES.has(baseSubType)) {
          const chosen = this.pickGuaranteedResource(baseSubType, defs, rng);
          if (chosen) this.placeResource(tile, chosen, rng);
        }
      }
    }
  }

  /** Place a resource object on a tile and update its physics from the resource definition. */
  private placeResource(
    tile: WorldTile,
    def: ResourceObjectDef,
    rng: (min: number, max: number) => number
  ): void {
    tile.resources[def.id] = rng(def.nodeAmountRange[0], def.nodeAmountRange[1]);
    // walkable comes directly from the resource; movementCost falls back to the objectSubType
    // subterrain so slow-but-passable resources still apply cost.
    const resourceSub = SUBTERRAINS[def.subterrain] ?? SUBTERRAIN_FALLBACK;
    tile.ascii = pickChar(resourceSub, tile.x, tile.y);
    tile.walkable = def.walkable ?? resourceSub.walkable;
    tile.movementCost = resourceSub.movementCost;
  }

  /** Weighted pick (by `subType` spawn chance) among resources that can spawn on `subType`. */
  private pickGuaranteedResource(
    subType: string,
    defs: ResourceObjectDef[],
    rng: (min: number, max: number) => number
  ): ResourceObjectDef | null {
    const candidates = defs.filter((d) => (d.spawn.subterrains[subType] ?? 0) > 0);
    if (candidates.length === 0) return null;
    const total = candidates.reduce((s, d) => s + d.spawn.subterrains[subType], 0);
    let r = (rng(0, 100000) / 100000) * total;
    for (const c of candidates) {
      r -= c.spawn.subterrains[subType];
      if (r <= 0) return c;
    }
    return candidates[candidates.length - 1];
  }
}

export const resourceGeneratorService = new ResourceGeneratorServiceImpl();
