/**
 * ResourceGeneratorService.ts
 * Populates tile-level resource amounts on the world map after generation.
 * Ported from Celestia: world/generation/resource_gen.gd
 */

import type { WorldTile } from '../core/types';
import type { ResourceObjectDef } from './ResourceObjectService';
import { resourceObjectService, isGrowableResource } from './ResourceObjectService';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '../core/Terrains';
import { makeSeededRng } from '../core/rng';
import { STARTING_BUBBLE_RADIUS } from './entity/entityConstants';

/**
 * Subterrains whose resources form CLUSTERS rather than per-tile scatter: each connected blob of
 * the subterrain is filled with a SINGLE resource (a hematite vein, a coal seam…), chosen once
 * for the whole blob. These subterrains are also never empty.
 */
const CLUSTERED_SUBTYPES = new Set(['mineral_deposit']);

/** Deterministic integer-range RNG: the shared seeded xorshift float gen (core/rng) scaled to
 *  [min, max] inclusive. Same sequence as before — the float gen is byte-identical to the old inline
 *  xorshift, so resource placement for a given seed is unchanged. */
function makeRng(seed: number) {
  const rand = makeSeededRng(seed);
  return (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;
}

class ResourceGeneratorServiceImpl {
  /**
   * Mutates the worldMap in-place to add resource amounts per tile.
   * Called once after generateWorld().
   * @param baseSeed  — the same seed used for world generation
   * @param opts.exclude — resource ids the random scatter must NOT place (the menu preview excludes the
   *   magical groves so its deliberately-placed ring is the SOLE source of them; real play omits this).
   */
  generateResources(
    worldMap: WorldTile[][],
    baseSeed: number,
    opts?: { exclude?: ReadonlySet<string> }
  ): void {
    const resourceSeed = (baseSeed * 7919) >>> 0;
    const all = resourceObjectService.getAll();
    const defs = opts?.exclude ? all.filter((d) => !opts.exclude!.has(d.id)) : all;
    const rng = makeRng(resourceSeed);

    // Lair-free spawn zone: never scatter a lair den within STARTING_BUBBLE_RADIUS of the map centre
    // (where the colony starts — see spawnPawnsOnMap). Pairs with the time-boxed entity bubble so the
    // den is neither physically generated NOR repopulated next to the player at spawn. Permanent for
    // the initial map; lairs may still GROW near the centre later (tickLairs, once the bubble lifts).
    const mapH = worldMap.length;
    const mapW = worldMap[0]?.length ?? 0;
    const cx = Math.floor(mapW / 2);
    const cy = Math.floor(mapH / 2);
    const lairFreeR2 = STARTING_BUBBLE_RADIUS * STARTING_BUBBLE_RADIUS;

    // Pass 1 — per-tile scatter for ordinary subterrains (trees, plants, surface stone, …).
    for (const row of worldMap) {
      for (const tile of row) {
        const baseSubType = tile.subType;
        if (CLUSTERED_SUBTYPES.has(baseSubType)) continue; // handled as clusters in pass 2

        const dx = tile.x - cx;
        const dy = tile.y - cy;
        const lairBlocked = dx * dx + dy * dy <= lairFreeR2;

        for (const def of defs) {
          if (def.lair && lairBlocked) continue; // keep dens out of the spawn bubble (try other defs)
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
   * Force a single resource object onto a tile (scripted / art-directed placement, e.g. the menu-preview
   * magical groves). Clears any existing resources on the tile first so the node isn't visually clobbered
   * by an earlier scatter pass. Deterministic in `seed`. Reuses the same `placeResource` as world-gen so
   * the node's physics/visual baking can't drift from the procedural path.
   */
  placeSingleResource(tile: WorldTile, def: ResourceObjectDef, seed: number): void {
    tile.resources = {};
    this.placeResource(tile, def, makeRng(seed));
  }

  /**
   * Turn the mineral_deposit blobs the world generator produces into proper single-mineral veins:
   * each connected deposit blob gets ONE resource, and is GROWN to a 3–8 tile cluster by spreading
   * that same mineral into adjacent mountain tiles (carving the vein out of the surrounding rock /
   * walls). Eliminates the lone scattered ore tiles — every deposit is a cluster.
   */
  private fillResourceClusters(
    worldMap: WorldTile[][],
    defs: ResourceObjectDef[],
    rng: (min: number, max: number) => number
  ): void {
    const h = worldMap.length;
    const w = worldMap[0]?.length ?? 0;
    const visited = new Uint8Array(h * w);
    const claimed = new Uint8Array(h * w); // tiles already assigned to some cluster
    const idx = (x: number, y: number) => y * w + x;
    const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (visited[idx(x, y)]) continue;
        const subType = worldMap[y][x].subType;
        if (!CLUSTERED_SUBTYPES.has(subType)) continue;

        // BFS the connected mineral_deposit blob (the cluster seed).
        const cluster: WorldTile[] = [];
        const queue: WorldTile[] = [worldMap[y][x]];
        visited[idx(x, y)] = 1;
        claimed[idx(x, y)] = 1;
        for (let qi = 0; qi < queue.length; qi++) {
          const cur = queue[qi];
          cluster.push(cur);
          for (const [nx, ny] of this.neighbors4(cur.x, cur.y, rng)) {
            if (!inBounds(nx, ny) || visited[idx(nx, ny)]) continue;
            if (worldMap[ny][nx].subType !== subType) continue;
            visited[idx(nx, ny)] = 1;
            claimed[idx(nx, ny)] = 1;
            queue.push(worldMap[ny][nx]);
          }
        }

        const chosen = this.pickGuaranteedResource(subType, defs, rng);
        if (!chosen) continue;

        // Grow the cluster to a target size by spreading into adjacent (unclaimed) mountain tiles.
        const target = rng(3, 8);
        for (let qi = 0; qi < queue.length && cluster.length < target; qi++) {
          const cur = queue[qi];
          for (const [nx, ny] of this.neighbors4(cur.x, cur.y, rng)) {
            if (cluster.length >= target) break;
            if (!inBounds(nx, ny) || claimed[idx(nx, ny)]) continue;
            const nt = worldMap[ny][nx];
            if (nt.terrainType !== 'mountain') continue; // keep veins in the mountains
            claimed[idx(nx, ny)] = 1;
            cluster.push(nt);
            queue.push(nt);
          }
        }

        // Fill the whole cluster with the one mineral (clearing any wall placed in pass 1).
        for (const t of cluster) {
          t.resources = {};
          this.placeResource(t, chosen, rng);
        }
      }
    }
  }

  /** 4-neighbours of (x,y) in a seeded-random order, so grown clusters take organic shapes. */
  private neighbors4(
    x: number,
    y: number,
    rng: (min: number, max: number) => number
  ): Array<[number, number]> {
    const n: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];
    for (let i = n.length - 1; i > 0; i--) {
      const j = rng(0, i);
      [n[i], n[j]] = [n[j], n[i]];
    }
    return n;
  }

  /** Place a resource object on a tile and update its physics from the resource definition. */
  private placeResource(
    tile: WorldTile,
    def: ResourceObjectDef,
    rng: (min: number, max: number) => number
  ): void {
    tile.resources[def.id] = rng(def.nodeAmountRange[0], def.nodeAmountRange[1]);
    // §F: growable plants spawn at a RANDOM 60–100% maturity so the world isn't uniformly full-grown
    // (growth scales harvest yield + shows in the panel). The 60% floor matches the forage regrow gate
    // (MIN_FORAGE_GROWTH) so a freshly-spawned wild plant is always foragable at least once — below it,
    // a never-foraged node would be permanently locked (wild growth only recovers via yield regrowth).
    if (isGrowableResource(def)) {
      (tile.growth ??= {})[def.id] = rng(60, 100);
    }
    // walkable comes directly from the resource; movementCost falls back to the objectSubType
    // subterrain so slow-but-passable resources still apply cost.
    const resourceSub = SUBTERRAINS[def.subterrain] ?? SUBTERRAIN_FALLBACK;
    tile.ascii = pickChar(resourceSub, tile.x, tile.y);
    tile.walkable = def.walkable ?? resourceSub.walkable;
    // Bake combat LoS (Part VII): purely data-driven, mirroring `walkable` — the resource's own
    // `blocksSight` flag (rock / ore / gem nodes set it true; trees/bushes don't), else its subterrain's.
    tile.blocksSight = def.blocksSight ?? resourceSub.blocksSight ?? false;
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
