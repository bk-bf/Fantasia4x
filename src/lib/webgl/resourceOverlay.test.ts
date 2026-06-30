import { describe, it, expect } from 'vitest';
import { applyResourceToGrid, buildResourceOverlay } from './fantasia-world';
import { GameGrid } from './game-grid';
import type { WorldTile } from '$lib/game/core/types';

/**
 * Resources render in a SEPARATE transparent overlay (no longer baked into the terrain grid), split
 * into a SHORT layer (drawn beneath entities) and a TALL layer (`renderScale > 1`, drawn above entities
 * so a pawn behind it is occluded). The split + per-tile `scale` are kept as infrastructure, but on
 * this branch NO resource opts into `renderScale`, so everything routes to the short layer and the tall
 * layer stays empty (trees render at their normal one-cell bitlands size). Ported from Fantasia4x-ultica
 * (ee9e77d2 + a4c89a21).
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
  it('a tree resource paints the SHORT grid with no scale (1× on this branch); tall grid stays blank', () => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, tile({ resources: { oak_tree: 3 } }), noMask);

    const shortCell = short.getTile(0, 0)!;
    expect(shortCell.char).not.toBe(' ');
    expect(shortCell.scale).toBeUndefined();
    expect(tall.getTile(0, 0)!.char).toBe(' ');
  });

  it('a grass resource paints the SHORT grid with no scale, leaving the tall grid blank', () => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, tile({ resources: { grass_patch: 1 } }), noMask);

    const shortCell = short.getTile(0, 0)!;
    expect(shortCell.char).not.toBe(' ');
    expect(shortCell.scale).toBeUndefined();
    expect(tall.getTile(0, 0)!.char).toBe(' ');
  });

  it('an ore vein (renderScale < 1) paints the SHORT grid downscaled; tall grid stays blank', () => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, tile({ resources: { hematite: 3 } }), noMask);

    const shortCell = short.getTile(0, 0)!;
    expect(shortCell.char).not.toBe(' ');
    expect(shortCell.scale).toBeGreaterThan(0);
    expect(shortCell.scale!).toBeLessThan(1);
    expect(tall.getTile(0, 0)!.char).toBe(' ');
  });

  it('a tile with no resources blanks both grids', () => {
    const short = new GameGrid();
    const tall = new GameGrid();
    applyResourceToGrid(short, tall, tile({ resources: {} }), noMask);
    expect(short.getTile(0, 0)!.char).toBe(' ');
    expect(tall.getTile(0, 0)!.char).toBe(' ');
  });

  it('buildResourceOverlay returns both grids; current resources route to short, tall stays empty', () => {
    const worldMap: WorldTile[][] = [
      [
        tile({ x: 0, y: 0, resources: { oak_tree: 3 } }),
        tile({ x: 1, y: 0, resources: { grass_patch: 1 } })
      ]
    ];
    const { short, tall } = buildResourceOverlay(worldMap, [[false, false]]);
    expect(short.getTile(0, 0)!.char).not.toBe(' ');
    expect(short.getTile(1, 0)!.char).not.toBe(' ');
    expect(tall.getTile(0, 0)?.char ?? ' ').toBe(' ');
    expect(tall.getTile(1, 0)?.char ?? ' ').toBe(' ');
  });
});
