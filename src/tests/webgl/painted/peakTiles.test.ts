import { describe, expect, it } from 'vitest';
import { GameGrid } from '$lib/webgl/game-grid';
import type { TileData } from '$lib/webgl/tile-types';
import {
  PEAK_MASS,
  PEAK_NEAR,
  PEAK_ROOF,
  PEAK_TEXEL,
  PeakTiles,
  nearestSeed,
  peakFlags
} from '$lib/webgl/painted/peakTiles';

const tile = (x: number, y: number, extra: Partial<TileData> = {}): TileData => ({
  char: ' ',
  foreground: { r: 0, g: 0, b: 0 },
  background: { r: 0, g: 0, b: 0 },
  position: { x, y },
  ...extra
});

function grids(w: number, h: number, rock: (x: number, y: number) => boolean) {
  const terrain = new GameGrid();
  const resource = new GameGrid();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      terrain.setTile(x, y, tile(x, y));
      if (rock(x, y)) resource.setTile(x, y, tile(x, y, { rock: true }));
    }
  return { terrain, resource };
}

describe('peakFlags', () => {
  it('counts a mined tile under a mountain roof as mountain mass', () => {
    expect(peakFlags(tile(0, 0, { underRock: true }), undefined)).toBe(PEAK_MASS | PEAK_ROOF);
    expect(peakFlags(tile(0, 0), tile(0, 0, { rock: true }))).toBe(PEAK_MASS);
    expect(peakFlags(tile(0, 0), tile(0, 0))).toBe(0);
  });
});

describe('nearestSeed', () => {
  it('finds the nearest seed and its distance', () => {
    const { dist, nearX, nearY } = nearestSeed((i) => i === 0, 4, 3);
    expect(dist[2 * 4 + 3]).toBeCloseTo(Math.hypot(3, 2));
    expect([nearX[11], nearY[11]]).toEqual([0, 0]);
  });
});

describe('PeakTiles', () => {
  it('keeps mined tiles as mass and marks the tiles near a roof', () => {
    const { terrain, resource } = grids(9, 9, (x) => x >= 2);
    const tiles = new PeakTiles();
    tiles.readAll(terrain, resource);
    expect(tiles.isMass(4, 4)).toBe(true);
    expect(tiles.isMass(-1, 0)).toBe(true);
    expect(tiles.isMass(0, 0)).toBe(false);

    resource.removeTile(4, 4);
    terrain.setTile(4, 4, tile(4, 4, { underRock: true }));
    const moved = tiles.read(terrain, resource, [{ x: 4, y: 4 }]);
    expect(moved).toEqual([]);
    expect(tiles.flags[4 * 9 + 4] & PEAK_ROOF).toBe(PEAK_ROOF);
    expect(tiles.flags[6 * 9 + 6] & PEAK_NEAR).toBe(PEAK_NEAR);
    expect(tiles.flags[7 * 9 + 7] & PEAK_NEAR).toBe(0);
    expect(tiles.texels[(4 * 9 + 4) * PEAK_TEXEL]).toBe(tiles.flags[4 * 9 + 4]);
  });

  it('reports a tile that stops being mass', () => {
    const { terrain, resource } = grids(5, 5, () => true);
    const tiles = new PeakTiles();
    tiles.readAll(terrain, resource);
    resource.removeTile(2, 2);
    expect(tiles.read(terrain, resource, [{ x: 2, y: 2 }])).toEqual([{ x: 2, y: 2 }]);
  });

  it('measures the far field from the nearest open tile', () => {
    const { terrain, resource } = grids(8, 1, (x) => x > 0);
    const tiles = new PeakTiles();
    tiles.readAll(terrain, resource);
    const far = tiles.farWindow(0, 0, 8, 1, 32);
    expect(far[5 * 4]).toBe(5 * 32 - 16);
    expect([far[5 * 4 + 1], far[5 * 4 + 2]]).toEqual([16, 16]);
  });
});
