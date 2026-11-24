import type { WorldTile } from '../types';
import { SNOW_DELTA_STRIDE, packSnowDelta } from './snowDeltaPack';

export interface TileDelta {
  y: number;
  x: number;
  tile: WorldTile;
  kind: 'terrain' | 'snow';
}

const KEY_STRIDE = 65536;

const dirtyTerrain = new Map<number, TileDelta>();
const dirtySnow = new Map<number, WorldTile>();

const terrainWatches: Map<string, WorldTile>[] = [];

export function watchTerrainTiles(): Map<string, WorldTile> {
  const watch = new Map<string, WorldTile>();
  terrainWatches.push(watch);
  return watch;
}

export function markTileDirty(
  y: number,
  x: number,
  tile: WorldTile,
  kind: 'terrain' | 'snow' = 'terrain'
): void {
  const key = y * KEY_STRIDE + x;
  if (kind === 'terrain') {
    dirtySnow.delete(key);
    dirtyTerrain.set(key, { y, x, tile, kind: 'terrain' });
    if (terrainWatches.length === 0) return;
    const watchKey = y + ',' + x;
    for (let i = 0; i < terrainWatches.length; i++) terrainWatches[i].set(watchKey, tile);
  } else if (!dirtyTerrain.has(key)) {
    dirtySnow.set(key, tile);
  }
}

export function drainTileDeltas(): TileDelta[] | null {
  if (dirtyTerrain.size === 0 && dirtySnow.size === 0) return null;
  const out = [...dirtyTerrain.values()];
  for (const [key, tile] of dirtySnow)
    out.push({ y: Math.floor(key / KEY_STRIDE), x: key % KEY_STRIDE, tile, kind: 'snow' });
  dirtyTerrain.clear();
  dirtySnow.clear();
  return out;
}

export function drainTerrainDeltas(): TileDelta[] | null {
  if (dirtyTerrain.size === 0) return null;
  const out = [...dirtyTerrain.values()];
  dirtyTerrain.clear();
  return out;
}

export function drainSnowDeltas(budget: number): Float64Array | null {
  const count = Math.min(budget, dirtySnow.size);
  if (count <= 0) return null;
  const out = new Float64Array(count * SNOW_DELTA_STRIDE);
  let at = 0;
  for (const [key, tile] of dirtySnow) {
    if (at >= out.length) break;
    packSnowDelta(out, at, Math.floor(key / KEY_STRIDE), key % KEY_STRIDE, tile);
    dirtySnow.delete(key);
    at += SNOW_DELTA_STRIDE;
  }
  return out;
}

export function clearTileDeltas(): void {
  dirtyTerrain.clear();
  dirtySnow.clear();
}
