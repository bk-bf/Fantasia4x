import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldTile } from '$lib/game/core/types';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true, GROUND_BLEND: true }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true, GROUND_BLEND: true }));

const { buildTileset, parseManifest } = await import('$lib/webgl/painted/manifest');
const { setPaintedTileset, paintedGroundKind, paintedGroundIds } =
  await import('$lib/webgl/painted/tileset');
const { applyTileToGrid } = await import('$lib/webgl/fantasia-world');
const { GameGrid } = await import('$lib/webgl/game-grid');
const { groundKindTable, lightRect } = await import('$lib/webgl/painted/groundBlend');
const { readGroundBlendFlag } =
  await vi.importActual<typeof import('$lib/webgl/painted/flag')>('$lib/webgl/painted/flag');

const raw = JSON.parse(readFileSync(join(__dirname, 'fixture', 'manifest.json'), 'utf8'));
const tileset = buildTileset(parseManifest(raw)).tileset;

function tile(over: Partial<WorldTile>): WorldTile {
  return { x: 2, y: 3, walkable: true, subType: 'grass', resources: {}, ...over } as WorldTile;
}

beforeAll(() => setPaintedTileset(tileset));

describe('the ground blend switch', () => {
  it('reads ?blend=1 or the stored switch', () => {
    expect(readGroundBlendFlag('?blend=1', null)).toBe(true);
    expect(readGroundBlendFlag('?painted=1', '1')).toBe(true);
    expect(readGroundBlendFlag('?painted=1', null)).toBe(false);
    expect(readGroundBlendFlag('?blend=0', '0')).toBe(false);
  });
});

describe('ground kinds reach the terrain grid', () => {
  it('gives painted ground its kind index, starting at 1', () => {
    const grid = new GameGrid();
    applyTileToGrid(grid, tile({}), []);
    const kind = grid.getTile(2, 3)!.ground;
    expect(kind).toBe(paintedGroundKind('grass'));
    expect(paintedGroundIds()[kind! - 1]).toBe('grass');
  });

  it('leaves unpainted and hidden tiles to their per-tile quads', () => {
    const grid = new GameGrid();
    applyTileToGrid(grid, tile({ x: 3, subType: 'cave' }), []);
    const hidden: boolean[][] = [];
    hidden[3] = [];
    hidden[3][4] = true;
    applyTileToGrid(grid, tile({ x: 4 }), hidden);
    expect(grid.getTile(3, 3)!.ground).toBeUndefined();
    expect(grid.getTile(4, 3)!.ground).toBeUndefined();
  });
});

describe('the blend pass tables', () => {
  it('points each kind at its patch in atlas pixels with its level', () => {
    const { patch, layer } = groundKindTable({ tileset, texture: {} as WebGLTexture });
    const k = paintedGroundKind('grass');
    const cell = tileset.lookup.get('subterrain')!.get('grass')![0];
    expect(patch[k * 4]).toBe(Math.round(cell.cells[0].u1 * tileset.atlasW));
    expect(patch[k * 4 + 1]).toBe(Math.round(cell.cells[0].v1 * tileset.atlasH));
    expect(patch[k * 4 + 2]).toBe(cell.patch * tileset.tile);
    expect([layer[k * 2], layer[k * 2 + 1]]).toEqual([5, 0]);
    expect([...patch.slice(0, 4), ...layer.slice(0, 2)]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('covers the lit corners one past the bounds, clamped to the map', () => {
    expect(lightRect({ minX: 10.5, minY: 3, maxX: 12.2, maxY: 4 }, 500, 500)).toEqual({
      x: 9,
      y: 2,
      w: 6,
      h: 4
    });
    expect(lightRect({ minX: -4, minY: -4, maxX: 600, maxY: 2 }, 500, 500)).toEqual({
      x: 0,
      y: 0,
      w: 501,
      h: 4
    });
  });
});
