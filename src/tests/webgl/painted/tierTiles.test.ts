import { describe, expect, it } from 'vitest';
import { GameGrid } from '$lib/webgl/game-grid';
import type { TileData } from '$lib/webgl/tile-types';
import {
  TIER_FIELDS,
  TIER_MASS,
  TIER_NEAR,
  TIER_REACH,
  TIER_ROOF,
  TIER_TEXEL,
  TierTiles,
  nearestSeed,
  tierFields,
  tierFlags,
  tierShape
} from '$lib/webgl/painted/tierTiles';
import { NOISE_SIZE, tierNoiseTexels } from '$lib/webgl/painted/tierNoise';

const TILE = 32;

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

const field = (t: TierTiles, x: number, y: number, k: number) =>
  t.fields[(y * t.w + x) * TIER_FIELDS + k];

describe('tierFlags', () => {
  it('counts a mined tile under a mountain roof as mountain mass', () => {
    expect(tierFlags(tile(0, 0, { underRock: true }), undefined)).toBe(TIER_MASS | TIER_ROOF);
    expect(tierFlags(tile(0, 0), tile(0, 0, { rock: true }))).toBe(TIER_MASS);
    expect(tierFlags(tile(0, 0), tile(0, 0))).toBe(0);
  });
});

describe('nearestSeed', () => {
  it('measures the distance to the nearest seed', () => {
    const dist = nearestSeed((i) => i === 0, 4, 3);
    expect(dist[2 * 4 + 3]).toBeCloseTo(Math.hypot(3, 2));
  });
});

describe('tierFields', () => {
  it('raises no tier within a tier step of open ground', () => {
    const shape = tierShape(1000, 1000);
    expect(tierFields(shape, 16).every((f) => f === 0)).toBe(true);
  });

  it('never lets a higher tier stand closer to open ground than its cap', () => {
    const shape = { crest: 1.5, body: 2, set: 30, tiers: [0.5, 0.5, 0.5] };
    const [, , , fourth] = tierFields(shape, 100);
    expect(fourth).toBeLessThan(0.5);
    expect(tierFields(shape, 300)[3]).toBeGreaterThan(0.5);
  });
});

describe('TierTiles', () => {
  it('keeps mined tiles as mass and marks the tiles near a roof', () => {
    const { terrain, resource } = grids(9, 9, (x) => x >= 2);
    const tiles = new TierTiles();
    tiles.readAll(terrain, resource, TILE);
    expect(tiles.isMass(4, 4)).toBe(true);
    expect(tiles.isMass(-1, 0)).toBe(true);
    expect(tiles.isMass(0, 0)).toBe(false);

    resource.removeTile(4, 4);
    terrain.setTile(4, 4, tile(4, 4, { underRock: true }));
    expect(tiles.read(terrain, resource, [{ x: 4, y: 4 }])).toBe(false);
    expect(tiles.flags[4 * 9 + 4] & TIER_ROOF).toBe(TIER_ROOF);
    expect(tiles.flags[6 * 9 + 6] & TIER_NEAR).toBe(TIER_NEAR);
    expect(tiles.flags[7 * 9 + 7] & TIER_NEAR).toBe(0);
    expect(tiles.texels[(4 * 9 + 4) * TIER_TEXEL]).toBe(tiles.flags[4 * 9 + 4]);
  });

  it('reports a tile that stops being mass', () => {
    const { terrain, resource } = grids(5, 5, () => true);
    const tiles = new TierTiles();
    tiles.readAll(terrain, resource, TILE);
    resource.removeTile(2, 2);
    expect(tiles.read(terrain, resource, [{ x: 2, y: 2 }])).toBe(true);
  });

  it('raises tiers deep in a massif and none at its rim', () => {
    const { terrain, resource } = grids(40, 40, (x, y) => x >= 4 && x < 36 && y >= 4 && y < 36);
    const tiles = new TierTiles();
    tiles.readAll(terrain, resource, TILE);
    expect(field(tiles, 4, 20, 0)).toBe(0);
    expect(field(tiles, 2, 20, 0)).toBe(0);
    expect(field(tiles, 20, 20, 0)).toBeGreaterThan(128);
    expect(tiles.flags[20 * 40 + 20] & TIER_REACH).toBe(TIER_REACH);
    expect(tiles.flags[0] & TIER_REACH).toBe(0);
  });

  it('lowers the tiers when the massif is cut open', () => {
    const { terrain, resource } = grids(40, 40, (x, y) => x >= 4 && x < 36 && y >= 4 && y < 36);
    const tiles = new TierTiles();
    tiles.readAll(terrain, resource, TILE);
    const before = field(tiles, 20, 20, 0);
    for (let x = 4; x < 36; x++) resource.removeTile(x, 20);
    const dirty = Array.from({ length: 32 }, (_, i) => ({ x: 4 + i, y: 20 }));
    expect(tiles.read(terrain, resource, dirty)).toBe(true);
    expect(field(tiles, 20, 21, 0)).toBeLessThan(before);
    expect(field(tiles, 20, 20, 0)).toBe(0);
  });
});

describe('tierNoiseTexels', () => {
  it('tiles without a seam', () => {
    const t = tierNoiseTexels();
    const at = (x: number, y: number, c: number) => t[(y * NOISE_SIZE + x) * 4 + c];
    for (let c = 0; c < 4; c++)
      for (const y of [0, 100, 300]) {
        expect(Math.abs(at(NOISE_SIZE - 1, y, c) - at(0, y, c))).toBeLessThan(40);
        expect(Math.abs(at(y, NOISE_SIZE - 1, c) - at(y, 0, c))).toBeLessThan(40);
      }
  });
});
