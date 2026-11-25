import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { WorldTile } from '$lib/game/core/types';
import manifestJson from '../../../../static/tilesets/painted/manifest.json';
import swayJson from '../../../../static/tilesets/painted/sway.json';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true }));

const { buildTileset, parseManifest, resolveVariant } = await import('$lib/webgl/painted/manifest');
const { setPaintedTileset } = await import('$lib/webgl/painted/tileset');
const { swayTable } = await import('$lib/webgl/painted/wind');
const { buildResourceOverlay } = await import('$lib/webgl/fantasia-world');
const { chamferDistance } = await import('$lib/game/world/chamfer');
const { isWet } = await import('$lib/game/world/shores');

const manifest = parseManifest(manifestJson);
const wind = swayTable(swayJson, Object.keys(manifest.sprites));
const SIZE = 120;

const spritesOf = (prefix: string) =>
  new Map(
    Object.keys(manifest.sprites)
      .filter((id) => id.startsWith(prefix))
      .map((id) => [resolveVariant(manifest, manifest.sprites[id]).cells[0].u1, id])
  );
const lilies = spritesOf('plant/lilies/');
const reedBeds = spritesOf('plant/reedbed/');

function waters(radii: Array<[number, number, number]>): WorldTile[][] {
  return Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      const wet = radii.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) < r);
      return {
        x,
        y,
        walkable: true,
        terrainType: 'plains',
        subType: wet ? 'shallow_water' : 'grass',
        resources: {}
      } as unknown as WorldTile;
    })
  );
}

function plants(map: WorldTile[][]) {
  const { short } = buildResourceOverlay(
    map,
    map.map((row) => row.map(() => false))
  );
  const toLand = chamferDistance(SIZE, SIZE, (i) => !isWet(map[(i / SIZE) | 0][i % SIZE]));
  return short
    .getAllTiles()
    .filter((t) => t.scenery && isWet(map[t.position.y][t.position.x]))
    .map((t) => ({
      ...t.position,
      shore: toLand[t.position.y * SIZE + t.position.x],
      lily: lilies.has(t.painted!.u1),
      reed: reedBeds.get(t.painted!.u1),
      sway: t.painted!.sway
    }));
}

beforeAll(() => setPaintedTileset(buildTileset(manifest, wind).tileset));

describe('plants in the shallows', () => {
  const pondMap = waters(
    Array.from({ length: 16 }, (_, k) => [15 + (k % 4) * 30, 15 + Math.floor(k / 4) * 30, 10])
  );
  const lakeMap = waters([[60, 60, 50]]);

  it('float lilies on ponds, away from the bank and short of the middle', () => {
    const found = plants(pondMap).filter((p) => p.lily);
    expect(found.length).toBeGreaterThan(0);
    for (const p of found) {
      expect(p.shore).toBeGreaterThan(1.6);
      expect(p.shore).toBeLessThan(5.5);
    }
  });

  it('keep lilies off a lake', () => {
    expect(plants(lakeMap).filter((p) => p.lily)).toEqual([]);
  });

  it('stand reed beds close to the land, swaying in the wind', () => {
    const found = [...plants(pondMap), ...plants(lakeMap)].filter((p) => p.reed);
    expect(found.length).toBeGreaterThan(0);
    for (const p of found) {
      expect(p.shore).toBeLessThanOrEqual(2.2);
      expect(p.sway).toBe(wind.sway[p.reed!]);
      expect(p.sway).toBeGreaterThan(0);
    }
    expect(new Set(found.map((p) => p.reed!.split('/')[2]))).toEqual(new Set(['1', '2', '3']));
  });

  it('draw nothing but lilies and reed beds on the water', () => {
    for (const p of [...plants(pondMap), ...plants(lakeMap)]) expect(p.lily || !!p.reed).toBe(true);
  });
});
