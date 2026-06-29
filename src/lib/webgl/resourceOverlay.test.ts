import { describe, it, expect } from 'vitest';
import { applyResourceToGrid, buildResourceOverlay } from './fantasia-world';
import { GameGrid } from './game-grid';
import type { WorldTile } from '$lib/game/core/types';

/**
 * Resources render in a SEPARATE transparent overlay (no longer baked into the terrain grid), split
 * into a SHORT layer (grass/bushes, beneath entities) and a TALL layer (trees, `renderScale > 1`,
 * drawn above entities so a pawn behind a tree is occluded by the canopy). A tall cell carries the
 * `scale` field so the glyph is drawn larger than one cell, anchored at its base. Ported from
 * Fantasia4x-ultica (ee9e77d2 + a4c89a21).
 */
function tile(over: Partial<WorldTile>): WorldTile {
  return {
    x: 0,
    y: 0,
    walkable: true,
    subType: 'grass',
    resources: {} as Record<string, number>,
    ...over
  } as WorldTile;
}

const noMask = [[false]];

describe('resource overlay short/tall split', () => {
  it('a tree (renderScale > 1) paints the TALL grid with a scale, leaving the short grid blank', () => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, tile({ resources: { oak_tree: 3 } }), noMask);

    const tallCell = tall.getTile(0, 0)!;
    expect(tallCell.char).not.toBe(' ');
    expect(tallCell.scale).toBeGreaterThan(1);
    expect(short.getTile(0, 0)!.char).toBe(' ');
  });

  it('a short resource (grass) paints the SHORT grid with no scale, leaving the tall grid blank', () => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, tile({ resources: { grass_patch: 1 } }), noMask);

    const shortCell = short.getTile(0, 0)!;
    expect(shortCell.char).not.toBe(' ');
    expect(shortCell.scale).toBeUndefined();
    expect(tall.getTile(0, 0)!.char).toBe(' ');
  });

  it('a tile with no resources blanks both grids', () => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, tile({ resources: {} }), noMask);
    expect(short.getTile(0, 0)!.char).toBe(' ');
    expect(tall.getTile(0, 0)!.char).toBe(' ');
  });

  it('buildResourceOverlay routes a tree to tall and grass to short', () => {
    const worldMap: WorldTile[][] = [
      [
        tile({ x: 0, y: 0, resources: { oak_tree: 3 } }),
        tile({ x: 1, y: 0, resources: { grass_patch: 1 } })
      ]
    ];
    const { short, tall } = buildResourceOverlay(worldMap, [[false, false]]);
    expect(tall.getTile(0, 0)!.char).not.toBe(' ');
    expect(short.getTile(1, 0)!.char).not.toBe(' ');
  });
});
