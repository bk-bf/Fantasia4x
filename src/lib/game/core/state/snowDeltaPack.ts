import type { WorldTile } from '../types';

export const SNOW_DELTA_STRIDE = 6;

const pack = (v: number | boolean | undefined): number =>
  v === undefined ? NaN : typeof v === 'boolean' ? (v ? 1 : 0) : v;

export function packSnowDelta(
  out: Float64Array,
  at: number,
  y: number,
  x: number,
  tile: WorldTile
): void {
  out[at] = y;
  out[at + 1] = x;
  out[at + 2] = pack(tile.snow);
  out[at + 3] = pack(tile.ice);
  out[at + 4] = pack(tile.walkable);
  out[at + 5] = pack(tile.movementCost);
}

export function applySnowDeltas(
  worldMap: WorldTile[][],
  packed: Float64Array,
  onTile: (y: number, x: number) => void
): void {
  for (let at = 0; at < packed.length; at += SNOW_DELTA_STRIDE) {
    const y = packed[at];
    const x = packed[at + 1];
    const tile = worldMap[y]?.[x];
    if (!tile) continue;
    const snow = packed[at + 2];
    const ice = packed[at + 3];
    const walkable = packed[at + 4];
    const movementCost = packed[at + 5];
    if (!Number.isNaN(snow)) tile.snow = snow;
    if (!Number.isNaN(ice)) tile.ice = ice;
    if (!Number.isNaN(walkable)) tile.walkable = walkable === 1;
    if (!Number.isNaN(movementCost)) tile.movementCost = movementCost;
    onTile(y, x);
  }
}
