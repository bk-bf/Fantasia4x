/**
 * ResourceGeneratorService.ts
 * Populates tile-level resource amounts on the world map after generation.
 * Ported from Celestia: world/generation/resource_gen.gd
 */

import type { WorldTile } from '../core/types';
import type { ResourceObjectDef } from './ResourceObjectService';
import { resourceObjectService } from './ResourceObjectService';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '../core/Terrains';

/**
 * Subterrains whose resources form CLUSTERS rather than per-tile scatter: each connected blob of
 * the subterrain is filled with a SINGLE resource (a hematite vein, a coal seam…), chosen once
 * for the whole blob. These subterrains are also never empty.
 */
const CLUSTERED_SUBTYPES = new Set(['mineral_deposit']);

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

    // Pass 1 — per-tile scatter for ordinary subterrains (trees, plants, surface stone, …).
    for (const row of worldMap) {
      for (const tile of row) {
        const baseSubType = tile.subType;
        if (CLUSTERED_SUBTYPES.has(baseSubType)) continue; // handled as clusters in pass 2

        for (const def of defs) {
          const chance = def.spawn.subterrains[baseSubType] ?? 0;
          if (chance <= 0) continue;
          if (rng(0, 100000) / 100000 >= chance) continue;
          this.placeResource(tile, def, rng);
          // One primary object per tile keeps biome->terrain->object flow predictable.
          break;
        }
      }
    }

    // Pass 2 — clusters: each connected blob of a clustered subterrain (mineral_deposit) is a
    // single-resource deposit (a whole hematite vein / coal seam), not a mix scattered per tile.
    this.fillResourceClusters(worldMap, defs, rng);
  }

  /**
   * Flood-fill each connected component of a clustered subterrain (4-connectivity) and fill the
   * ENTIRE component with one resource, weighted by that subterrain's spawn chances. Turns the
   * mineral_deposit blobs the world generator already produces into uniform single-mineral veins.
   */
  private fillResourceClusters(
    worldMap: WorldTile[][],
    defs: ResourceObjectDef[],
    rng: (min: number, max: number) => number
  ): void {
    const h = worldMap.length;
    const w = worldMap[0]?.length ?? 0;
    const visited = new Uint8Array(h * w);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (visited[y * w + x]) continue;
        const subType = worldMap[y][x].subType;
        if (!CLUSTERED_SUBTYPES.has(subType)) continue;

        // BFS the connected blob of this subterrain.
        const component: WorldTile[] = [];
        const stack: Array<[number, number]> = [[x, y]];
        visited[y * w + x] = 1;
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          component.push(worldMap[cy][cx]);
          for (const [nx, ny] of [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1]
          ] as Array<[number, number]>) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (visited[ny * w + nx]) continue;
            if (worldMap[ny][nx].subType !== subType) continue;
            visited[ny * w + nx] = 1;
            stack.push([nx, ny]);
          }
        }

        // One resource for the whole blob.
        const chosen = this.pickGuaranteedResource(subType, defs, rng);
        if (chosen) for (const t of component) this.placeResource(t, chosen, rng);
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
