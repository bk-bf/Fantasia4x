import type { WorldTile } from '$lib/game/core/types.js';
import { isWet } from '$lib/game/world/shores.js';
import { idHash, positionHash } from './manifest.js';

export const ELDER_CHANCE = 0.25;
export const ELDER_EDGE = 16;
export const ELDER_OPEN = 6;
export const ELDER_GROVE = 6;
export const ELDER_GROVE_MIN = 2;
export const ELDER_WOOD = 4;
export const ELDER_WOOD_MIN = 16;
export const ELDER_FROM_START = 40;
export const ELDER_CLEARING = 4;
const SITE_SALT = 0x51ed2705;
const HASH_SPAN = 1024;

export interface ElderSite {
  x: number;
  y: number;
  id: string;
}

type HasElder = (resourceId: string) => boolean;

const found = new WeakMap<WorldTile[][], ElderSite | null>();

const kindOf = (tile: WorldTile | undefined, hasElder: HasElder) => {
  for (const id in tile?.resources ?? {}) if (hasElder(id)) return id;
  return undefined;
};

function around(x: number, y: number, reach: number, at: (x: number, y: number) => boolean) {
  let n = 0;
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) if ((dx || dy) && at(x + dx, y + dy)) n++;
  return n;
}

function deepInGrove(map: WorldTile[][], x: number, y: number, id: string): boolean {
  const kin = around(x, y, ELDER_GROVE, (u, v) => map[v]?.[u]?.resources?.[id] !== undefined);
  if (kin < ELDER_GROVE_MIN) return false;
  const grown = (u: number, v: number) => Object.keys(map[v]?.[u]?.resources ?? {}).length > 0;
  return around(x, y, ELDER_WOOD, grown) >= ELDER_WOOD_MIN;
}

function openGround(map: WorldTile[][], x: number, y: number): boolean {
  for (let dy = -ELDER_OPEN; dy <= ELDER_OPEN; dy++)
    for (let dx = -ELDER_OPEN; dx <= ELDER_OPEN; dx++) {
      const t = map[y + dy]?.[x + dx];
      if (
        !t ||
        t.type === 'water' ||
        t.type === 'mountain' ||
        t.terrainType === 'mountain' ||
        isWet(t)
      )
        return false;
    }
  return true;
}

export function elderAllowed(x: number, y: number): boolean {
  return (idHash(`elder:${x}:${y}`) % HASH_SPAN) / HASH_SPAN < ELDER_CHANCE;
}

export function elderCandidate(map: WorldTile[][], hasElder: HasElder): ElderSite | null {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  let best: ElderSite | null = null;
  let bestHash = Infinity;
  for (let y = ELDER_EDGE; y < h - ELDER_EDGE; y++)
    for (let x = ELDER_EDGE; x < w - ELDER_EDGE; x++) {
      const id = kindOf(map[y][x], hasElder);
      if (!id || Math.hypot(x - w / 2, y - h / 2) < ELDER_FROM_START) continue;
      const rank = positionHash(x ^ SITE_SALT, y);
      if (rank >= bestHash || !deepInGrove(map, x, y, id) || !openGround(map, x, y)) continue;
      best = { x, y, id };
      bestHash = rank;
    }
  return best;
}

export function elderSite(map: WorldTile[][], hasElder: HasElder): ElderSite | null {
  const known = found.get(map);
  if (known !== undefined) return known;
  const best = elderCandidate(map, hasElder);
  const site = best && elderAllowed(best.x, best.y) ? best : null;
  found.set(map, site);
  return site;
}

export function nearElder(
  site: ElderSite | null,
  x: number,
  y: number
): 'elder' | 'clearing' | null {
  if (!site) return null;
  if (site.x === x && site.y === y) return 'elder';
  return Math.abs(site.x - x) <= ELDER_CLEARING && Math.abs(site.y - y) <= ELDER_CLEARING
    ? 'clearing'
    : null;
}
