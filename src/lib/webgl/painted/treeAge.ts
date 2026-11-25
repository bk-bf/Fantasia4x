import type { Season, WorldTile } from '$lib/game/core/types.js';
import { positionHash, type TreeAge, type TreeSeason } from './manifest.js';
import { elderSite, nearElder } from './elder.js';

export const MATURE_SHARE = 0.45;
const AGE_SALT = 0x2c1b3c6d;
const HASH_SPAN = 1024;

export function treeAge(tile: Pick<WorldTile, 'x' | 'y' | 'growthTurn'>): TreeAge {
  if (tile.growthTurn !== undefined) return 'young';
  const roll = (positionHash(tile.x ^ AGE_SALT, tile.y) % HASH_SPAN) / HASH_SPAN;
  return roll < MATURE_SHARE ? 'mature' : 'young';
}

export function treeAgeIn(
  tile: Pick<WorldTile, 'x' | 'y' | 'growthTurn'>,
  map: WorldTile[][] | undefined,
  hasElder: ((resourceId: string) => boolean) | null
): TreeAge {
  const near = map && hasElder ? nearElder(elderSite(map, hasElder), tile.x, tile.y) : null;
  if (near === 'elder') return 'elder';
  if (near === 'clearing') return 'young';
  return treeAge(tile);
}

export function treeSeason(season: Season | undefined): TreeSeason {
  return season === 'autumn' || season === 'winter' ? season : 'summer';
}
