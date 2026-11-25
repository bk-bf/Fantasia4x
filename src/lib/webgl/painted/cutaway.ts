import type { GameGrid } from '../game-grid.js';
import { BASE_TILE_PX } from '../tile-types.js';

export const CUT_MAX = 16;
export const CUT_UNIFORM = 'u_cut[0]';
const FOLK_FOOT = 27;
const FOLK_WAIST = 16;
const CUT_REACH_TILES = 2;

export interface CutView {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function cutPoints(
  grid: GameGrid | null,
  view: CutView,
  artTile: number,
  out: Float32Array
): number {
  if (!grid) return 0;
  const perBase = artTile / BASE_TILE_PX;
  let n = 0;
  for (const tile of grid.getAllTiles()) {
    if (n >= CUT_MAX) break;
    if (!tile.painted) continue;
    const { x, y } = tile.position;
    if (
      x < view.x - CUT_REACH_TILES ||
      y < view.y - CUT_REACH_TILES ||
      x > view.x + view.w + CUT_REACH_TILES ||
      y > view.y + view.h + CUT_REACH_TILES
    )
      continue;
    const ox = tile.animationOffset?.x ?? 0;
    const oy = tile.animationOffset?.y ?? 0;
    out[n * 4] = x * artTile + artTile / 2 + ox * perBase;
    out[n * 4 + 1] = y * artTile + FOLK_FOOT - FOLK_WAIST + oy * perBase;
    out[n * 4 + 2] = y + oy / BASE_TILE_PX;
    out[n * 4 + 3] = 0;
    n++;
  }
  return n;
}
