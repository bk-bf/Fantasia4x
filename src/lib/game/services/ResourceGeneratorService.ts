import type { WorldTile } from '../core/types';
import type { ResourceObjectDef } from './ResourceObjectService';
import { resourceObjectService, isGrowableResource } from './ResourceObjectService';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar, isSpawnableTile } from '../core/defs/terrains';
import { makeSeededRng } from '../core/util/rng';
import { STARTING_BUBBLE_RADIUS, MIN_LAIR_SPACING } from './entity/entityConstants';

const CLUSTERED_SUBTYPES = new Set(['mineral_deposit']);

const GUARD_SEARCH_RADIUS = 6;
const GUARD_CHANCE = 0.4;
const HOARD_CHANCE = 0.35;

function makeRng(seed: number) {
  const rand = makeSeededRng(seed);
  return (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;
}

class ResourceGeneratorServiceImpl {
  generateResources(
    worldMap: WorldTile[][],
    baseSeed: number,
    opts?: { exclude?: ReadonlySet<string> }
  ): void {
    const resourceSeed = (baseSeed * 7919) >>> 0;
    const all = resourceObjectService.getAll();
    const defs = opts?.exclude ? all.filter((d) => !opts.exclude!.has(d.id)) : all;
    const rng = makeRng(resourceSeed);

    const mapH = worldMap.length;
    const mapW = worldMap[0]?.length ?? 0;
    const cx = Math.floor(mapW / 2);
    const cy = Math.floor(mapH / 2);
    const lairFreeR2 = STARTING_BUBBLE_RADIUS * STARTING_BUBBLE_RADIUS;

    for (const row of worldMap) {
      for (const tile of row) {
        const baseSubType = tile.subType;
        if (CLUSTERED_SUBTYPES.has(baseSubType)) continue;

        const dx = tile.x - cx;
        const dy = tile.y - cy;
        const lairBlocked = dx * dx + dy * dy <= lairFreeR2;

        for (const def of defs) {
          if (def.lair && lairBlocked) continue;
          const chance = def.spawn.subterrains[baseSubType] ?? 0;
          if (chance <= 0) continue;
          if (rng(0, 100000) / 100000 >= chance) continue;
          this.placeResource(tile, def, rng);
          break;
        }
      }
    }

    this.fillResourceClusters(worldMap, defs, rng);

    this.placeLairGuardians(worldMap, defs, rng, cx, cy, lairFreeR2);

    this.placeBuriedHoards(worldMap, defs, rng, cx, cy, lairFreeR2);
  }

  placeSingleResource(tile: WorldTile, def: ResourceObjectDef, seed: number): void {
    tile.resources = {};
    this.placeResource(tile, def, makeRng(seed));
  }

  private fillResourceClusters(
    worldMap: WorldTile[][],
    defs: ResourceObjectDef[],
    rng: (min: number, max: number) => number
  ): void {
    const h = worldMap.length;
    const w = worldMap[0]?.length ?? 0;
    const visited = new Uint8Array(h * w);
    const claimed = new Uint8Array(h * w);
    const idx = (x: number, y: number) => y * w + x;
    const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (visited[idx(x, y)]) continue;
        const subType = worldMap[y][x].subType;
        if (!CLUSTERED_SUBTYPES.has(subType)) continue;

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

        const target = rng(3, 8);
        for (let qi = 0; qi < queue.length && cluster.length < target; qi++) {
          const cur = queue[qi];
          for (const [nx, ny] of this.neighbors4(cur.x, cur.y, rng)) {
            if (cluster.length >= target) break;
            if (!inBounds(nx, ny) || claimed[idx(nx, ny)]) continue;
            const nt = worldMap[ny][nx];
            if (nt.terrainType !== 'mountain') continue;
            claimed[idx(nx, ny)] = 1;
            nt.subType = 'mineral_deposit';
            visited[idx(nx, ny)] = 1;
            cluster.push(nt);
            queue.push(nt);
          }
        }

        for (const t of cluster) {
          t.resources = {};
          this.placeResource(t, chosen, rng);
        }
      }
    }
  }

  private placeLairGuardians(
    worldMap: WorldTile[][],
    defs: ResourceObjectDef[],
    rng: (min: number, max: number) => number,
    cx: number,
    cy: number,
    bubbleR2: number
  ): void {
    const wantedBy = new Map<string, ResourceObjectDef[]>();
    for (const d of defs) {
      if (!d.lair || !d.lairAttractors?.length) continue;
      for (const a of d.lairAttractors) {
        const arr = wantedBy.get(a);
        if (arr) arr.push(d);
        else wantedBy.set(a, [d]);
      }
    }
    if (wantedBy.size === 0) return;

    const lairIds = new Set(defs.filter((d) => d.lair).map((d) => d.id));
    const h = worldMap.length;
    const w = worldMap[0]?.length ?? 0;

    const hasLairNear = (x: number, y: number, r: number): boolean => {
      for (let dy = -r; dy <= r; dy++) {
        const row = worldMap[y + dy];
        if (!row) continue;
        for (let dx = -r; dx <= r; dx++) {
          const t = row[x + dx];
          if (!t) continue;
          for (const id in t.resources) if (lairIds.has(id)) return true;
        }
      }
      return false;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const res = worldMap[y][x].resources;
        let guardians: ResourceObjectDef[] | undefined;
        for (const id in res) {
          const m = wantedBy.get(id);
          if (m) {
            guardians = m;
            break;
          }
        }
        if (!guardians) continue;
        if (rng(0, 100000) / 100000 >= GUARD_CHANCE) continue;
        if (hasLairNear(x, y, MIN_LAIR_SPACING)) continue;
        const spot = this.findGuardSpot(worldMap, x, y, cx, cy, bubbleR2);
        if (!spot) continue;
        const g = guardians.length === 1 ? guardians[0] : guardians[rng(0, guardians.length - 1)];
        this.placeResource(spot, g, rng);
      }
    }
  }

  private placeBuriedHoards(
    worldMap: WorldTile[][],
    defs: ResourceObjectDef[],
    rng: (min: number, max: number) => number,
    cx: number,
    cy: number,
    bubbleR2: number
  ): void {
    const hoard = defs.find((d) => d.id === 'buried_hoard');
    if (!hoard) return;
    const lairIds = new Set(defs.filter((d) => d.lair).map((d) => d.id));
    if (lairIds.size === 0) return;
    const h = worldMap.length;
    const w = worldMap[0]?.length ?? 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const res = worldMap[y][x].resources;
        let isLair = false;
        for (const id in res)
          if (lairIds.has(id)) {
            isLair = true;
            break;
          }
        if (!isLair) continue;
        if (rng(0, 100000) / 100000 >= HOARD_CHANCE) continue;
        const spot = this.findGuardSpot(worldMap, x, y, cx, cy, bubbleR2);
        if (spot) this.placeResource(spot, hoard, rng);
      }
    }
  }

  private findGuardSpot(
    worldMap: WorldTile[][],
    ax: number,
    ay: number,
    cx: number,
    cy: number,
    bubbleR2: number
  ): WorldTile | null {
    let best: WorldTile | null = null;
    let bestD = Infinity;
    for (let dy = -GUARD_SEARCH_RADIUS; dy <= GUARD_SEARCH_RADIUS; dy++) {
      const row = worldMap[ay + dy];
      if (!row) continue;
      for (let dx = -GUARD_SEARCH_RADIUS; dx <= GUARD_SEARCH_RADIUS; dx++) {
        if (dx === 0 && dy === 0) continue;
        const t = row[ax + dx];
        if (!t || !isSpawnableTile(t)) continue;
        if (Object.keys(t.resources).length > 0) continue;
        const bdx = t.x - cx;
        const bdy = t.y - cy;
        if (bdx * bdx + bdy * bdy <= bubbleR2) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
    }
    return best;
  }

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

  private placeResource(
    tile: WorldTile,
    def: ResourceObjectDef,
    rng: (min: number, max: number) => number
  ): void {
    tile.resources[def.id] = rng(def.nodeAmountRange[0], def.nodeAmountRange[1]);
    if (isGrowableResource(def)) {
      (tile.growth ??= {})[def.id] = rng(60, 100);
    }
    const resourceSub = SUBTERRAINS[def.subterrain] ?? SUBTERRAIN_FALLBACK;
    tile.ascii = pickChar(resourceSub, tile.x, tile.y);
    tile.walkable = def.walkable ?? resourceSub.walkable;
    tile.blocksSight = def.blocksSight ?? resourceSub.blocksSight ?? false;
    tile.movementCost = resourceSub.movementCost;
  }

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
