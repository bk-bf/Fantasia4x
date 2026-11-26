import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldTile } from '$lib/game/core/types';
import type { TileData } from '$lib/webgl/tile-types';
import type { FontAtlas } from '$lib/webgl/types';
import type { ShaderManager } from '$lib/webgl/shaders';
import type { CharacterRenderer } from '$lib/webgl/character-renderer';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true, GROUND_BLEND: true }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true, GROUND_BLEND: true }));

const { buildTileset, parseManifest } = await import('$lib/webgl/painted/manifest');
const { setPaintedTileset } = await import('$lib/webgl/painted/tileset');
const { applyTileToGrid } = await import('$lib/webgl/fantasia-world');
const { GameGrid } = await import('$lib/webgl/game-grid');
const { GridRenderer } = await import('$lib/webgl/grid-renderer');
const { hash } = await import('$lib/pixelArt/noise');

const raw = JSON.parse(
  readFileSync(join(__dirname, '../../../../static/tilesets/painted/manifest.json'), 'utf8')
);
const { tileset } = buildTileset(parseManifest(raw));
const ground = tileset.ground!;
const GRASS = [...ground.grass];
const TUFTED = [...ground.kinds].filter(([, k]) => k.tufts).map(([id]) => id);
const ROW_FLOATS = 32;

beforeAll(() => setPaintedTileset(tileset));

function tile(over: Partial<WorldTile>): WorldTile {
  return {
    x: 5,
    y: 7,
    type: 'grassland',
    walkable: true,
    subType: 'grass',
    resources: {},
    ...over
  } as WorldTile;
}

function terrain(t: WorldTile): TileData {
  const grid = new GameGrid();
  applyTileToGrid(grid, t, []);
  return grid.getTile(t.x, t.y)!;
}

describe('grass tufts on the blended ground', () => {
  it('stand on every tile where a grass resource grows, as many as the kind scatters there', () => {
    expect(GRASS).toEqual(
      expect.arrayContaining(['grass_patch', 'tall_grass_patch', 'deep_grass_patch'])
    );
    for (const subType of TUFTED)
      for (const id of GRASS)
        for (let x = 0; x < 12; x++) {
          const density = ground.kinds.get(subType)!.tufts!.density;
          const count = Math.floor(density + hash(x, 3, 201));
          const t = terrain(tile({ x, y: 3, subType, resources: { [id]: 4 } }));
          expect([subType, id, x, t.tufts?.length ?? 0]).toEqual([subType, id, x, count]);
        }
  });

  it('stand inside their own tile and are drawn from the kind’s own tuft sprites', () => {
    const t = terrain(tile({ subType: 'deep_grass', resources: { deep_grass_patch: 5 } }));
    const own = ground.kinds.get('deep_grass')!.tufts!.sprites;
    expect(t.tufts!.length).toBeGreaterThan(0);
    for (const s of t.tufts!) {
      const base = own.find((o) => o.u1 === s.u1 && o.v1 === s.v1)!;
      expect(base).toBeDefined();
      expect(s.ox - base.ox).toBeGreaterThanOrEqual(0);
      expect(s.ox - base.ox).toBeLessThan(1);
      expect(s.oy - base.oy).toBeGreaterThanOrEqual(0);
      expect(s.oy - base.oy).toBeLessThan(1);
    }
  });

  it.each([
    ['bare ground', tile({ subType: 'deep_grass' })],
    ['a resource that is not grass', tile({ subType: 'deep_grass', resources: { berry_bush: 3 } })],
    ['grass that was cut', tile({ subType: 'deep_grass', resources: { deep_grass_patch: 0 } })],
    [
      'a floor',
      tile({
        subType: 'deep_grass',
        resources: { deep_grass_patch: 3 },
        floor: { speed: 1, dryness: 1 }
      })
    ],
    [
      'a wall',
      tile({ subType: 'deep_grass', resources: { deep_grass_patch: 3 }, walkable: false })
    ],
    ['water', tile({ subType: 'shallow_water', type: 'water', resources: { grass_patch: 3 } })],
    ['tilled soil', tile({ subType: 'tilled', resources: { grass_patch: 3 } })]
  ])('leave %s without tufts', (_, t) => {
    expect(terrain(t).tufts).toBeUndefined();
  });
});

function chunkRenderer(uploads: Float32Array[]) {
  const gl = new Proxy(
    { ARRAY_BUFFER: 0x8892, TRIANGLES: 4, FLOAT: 0x1406 },
    {
      get: (target, key) => {
        if (typeof key !== 'string') return undefined;
        if (key in target) return target[key as keyof typeof target];
        return (...args: unknown[]) => {
          if (key === 'bufferData' && args[1] instanceof Float32Array) uploads.push(args[1]);
          return {};
        };
      }
    }
  ) as unknown as WebGL2RenderingContext;
  const shaders = {
    getAttributeLocation: () => 1,
    useProgram: () => true
  } as unknown as ShaderManager;
  const atlas = { characters: new Map(), atlasWidth: 64, atlasHeight: 64 } as unknown as FontAtlas;
  const r = new GridRenderer(gl, shaders, {} as CharacterRenderer, atlas, false, true);
  r.skipBlendedGround = true;
  return r;
}

describe('tufts in the terrain chunks', () => {
  const options = {
    tileWidth: 16,
    tileHeight: 16,
    viewportX: 0,
    viewportY: 0,
    viewportWidth: 60,
    viewportHeight: 20,
    cacheVersion: 1
  };
  const grassy = (x: number, amount: number) =>
    tile({ x, y: 2, subType: 'deep_grass', resources: { deep_grass_patch: amount } });

  it('are the only quads a blended chunk draws, and a changed tile rebuilds only its own chunk', () => {
    const uploads: Float32Array[] = [];
    const r = chunkRenderer(uploads);
    const grid = new GameGrid();
    const near = grassy(3, 4);
    const far = grassy(40, 4);
    applyTileToGrid(grid, near, []);
    applyTileToGrid(grid, far, []);
    const tufts = (t: WorldTile) => terrain(t).tufts?.length ?? 0;
    r.renderGrid(grid, options);
    expect(uploads.map((u) => u.length / 6 / ROW_FLOATS)).toEqual([tufts(near), tufts(far)]);

    uploads.length = 0;
    const cut = grassy(40, 0);
    applyTileToGrid(grid, cut, []);
    r.markTerrainChunksDirty([{ x: 40, y: 2 }]);
    r.renderGrid(grid, options);
    expect(r.chunksRebuiltLastRender).toBe(1);
    expect(uploads).toEqual([]);
    expect(tufts(cut)).toBe(0);

    applyTileToGrid(grid, far, []);
    r.markTerrainChunksDirty([{ x: 40, y: 2 }]);
    r.renderGrid(grid, options);
    expect(r.chunksRebuiltLastRender).toBe(1);
    expect(uploads.map((u) => u.length / 6 / ROW_FLOATS)).toEqual([tufts(far)]);
  });
});
