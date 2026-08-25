import type { WorldTile } from '../types';

export interface TileDelta {
  y: number;
  x: number;
  tile: WorldTile;
  kind: 'terrain' | 'snow';
}

const dirtyTerrain = new Map<string, TileDelta>();
const dirtySnow = new Map<string, TileDelta>();

export function markTileDirty(
  y: number,
  x: number,
  tile: WorldTile,
  kind: 'terrain' | 'snow' = 'terrain'
): void {
  const key = y + ',' + x;
  if (kind === 'terrain') {
    dirtySnow.delete(key);
    dirtyTerrain.set(key, { y, x, tile, kind: 'terrain' });
  } else if (!dirtyTerrain.has(key)) {
    dirtySnow.set(key, { y, x, tile, kind: 'snow' });
  }
}

export function drainTileDeltas(): TileDelta[] | null {
  if (dirtyTerrain.size === 0 && dirtySnow.size === 0) return null;
  const out = [...dirtyTerrain.values(), ...dirtySnow.values()];
  dirtyTerrain.clear();
  dirtySnow.clear();
  return out;
}

export function drainTileDeltasBudgeted(snowBudget: number): TileDelta[] | null {
  const out: TileDelta[] = [];
  if (dirtyTerrain.size > 0) {
    for (const d of dirtyTerrain.values()) out.push(d);
    dirtyTerrain.clear();
  }
  let snow = 0;
  for (const [key, d] of dirtySnow) {
    if (snow >= snowBudget) break;
    out.push(d);
    dirtySnow.delete(key);
    snow++;
  }
  return out.length ? out : null;
}

export function clearTileDeltas(): void {
  dirtyTerrain.clear();
  dirtySnow.clear();
}
