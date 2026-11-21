import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldTile, PlacedBuilding } from '$lib/game/core/types';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true }));

const { buildTileset, parseManifest } = await import('$lib/webgl/painted/manifest');
const { setPaintedTileset, paintedEntity } = await import('$lib/webgl/painted/tileset');
const { applyResourceToGrid, applyTileToGrid } = await import('$lib/webgl/fantasia-world');
const { overlayBuildings } = await import('$lib/components/UI/canvas/overlay');
const { GameGrid } = await import('$lib/webgl/game-grid');

const raw = JSON.parse(readFileSync(join(__dirname, 'fixture', 'manifest.json'), 'utf8'));

function tile(over: Partial<WorldTile>): WorldTile {
  return { x: 2, y: 3, walkable: true, subType: 'grass', resources: {}, ...over } as WorldTile;
}

const noMask: boolean[][] = [];

beforeAll(() => setPaintedTileset(buildTileset(parseManifest(raw)).tileset));

describe('painted sprites reach the grids when the flag is on', () => {
  it('paints mapped ground and leaves unmapped ground on the glyph path', () => {
    const grid = new GameGrid();
    applyTileToGrid(grid, tile({}), noMask);
    applyTileToGrid(grid, tile({ x: 3, subType: 'cave' }), noMask);
    expect(grid.getTile(2, 3)!.painted).toBeDefined();
    expect(grid.getTile(3, 3)!.painted).toBeUndefined();
  });

  it('keeps painted ground under a resource that hides the ground glyph', () => {
    const grid = new GameGrid();
    applyTileToGrid(grid, tile({ resources: { oak_tree: 3 } }), noMask);
    expect(grid.getTile(2, 3)!.painted).toBeDefined();
  });

  it('keeps a painted tree in the layer its glyph would draw in', () => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, tile({ resources: { pine_tree: 3 } }), noMask);
    expect(short.getTile(2, 3)!.painted?.h).toBe(2.5);
    expect(tall.getTile(2, 3)!.painted).toBeUndefined();
  });

  it('leaves an unmapped resource exactly as the glyph path draws it', () => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, tile({ resources: { stone_outcrop: 3 } }), noMask);
    expect(short.getTile(2, 3)!.painted).toBeUndefined();
  });

  it('gives an unmapped building no painted sprite', () => {
    const grid = new GameGrid();
    const b = { id: 'b1', type: 'campfire', x: 1, y: 1, status: 'complete' } as PlacedBuilding;
    overlayBuildings(grid, [b]);
    expect(grid.getTile(1, 1)!.painted).toBeUndefined();
  });

  it('paints a mapped creature and clears its glyph scale, and skips an unmapped one', () => {
    expect(paintedEntity('creature', 'deer', 'mob-1')).toMatchObject({ scale: undefined });
    expect(paintedEntity('creature', 'deer', 'mob-1')).toHaveProperty('painted');
    expect(paintedEntity('creature', 'dragon', 'mob-1')).toEqual({});
    expect(paintedEntity('pawn', undefined, 'pawn-1')).toEqual({});
  });

  it('falls back to the catch-all entry of a kind for an id the map does not name', () => {
    const withAny = structuredClone(raw);
    withAny.map.pawn['*'] = ['pawn_blue'];
    setPaintedTileset(buildTileset(parseManifest(withAny)).tileset);
    expect(paintedEntity('pawn', 'no_such_culture', 'pawn-1')).toHaveProperty('painted');
    expect(paintedEntity('pawn', undefined, 'pawn-1')).toHaveProperty('painted');
    expect(paintedEntity('creature', 'dragon', 'mob-1')).toEqual({});
    setPaintedTileset(buildTileset(parseManifest(raw)).tileset);
  });
});
