import type { Season, WorldTile } from '$lib/game/core/types.js';
import { positionHash, type TreeAge, type TreeSeason } from './manifest.js';

export const MATURE_SHARE = 0.45;
const AGE_SALT = 0x2c1b3c6d;
const HASH_SPAN = 1024;

export function treeAge(tile: Pick<WorldTile, 'x' | 'y' | 'growthTurn'>): TreeAge {
  if (tile.growthTurn !== undefined) return 'young';
  const roll = (positionHash(tile.x ^ AGE_SALT, tile.y) % HASH_SPAN) / HASH_SPAN;
  return roll < MATURE_SHARE ? 'mature' : 'young';
}

export function treeSeason(season: Season | undefined): TreeSeason {
  return season === 'autumn' || season === 'winter' ? season : 'summer';
}
