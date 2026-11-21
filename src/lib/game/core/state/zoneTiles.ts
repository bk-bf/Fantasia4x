import type { DesignationType, GameState } from '../types';

const NO_KEYS: readonly string[] = [];
const KEYS_BY_ZONE_TILES = new WeakMap<object, Map<DesignationType, readonly string[]>>();

export function zoneTileKeys(gameState: GameState, type: DesignationType): readonly string[] {
  const zt = gameState.zoneTiles;
  if (!zt) return NO_KEYS;
  let byType = KEYS_BY_ZONE_TILES.get(zt);
  if (!byType) {
    byType = new Map();
    KEYS_BY_ZONE_TILES.set(zt, byType);
  }
  let keys = byType.get(type);
  if (!keys) {
    const found: string[] = [];
    for (const k in zt) if (zt[k]?.includes(type)) found.push(k);
    keys = found;
    byType.set(type, keys);
  }
  return keys;
}
