import { describe, it, expect } from 'vitest';
import { GameGrid } from '$lib/webgl/game-grid';
import { applySnowToGrid } from '$lib/webgl/fantasia-world';
import type { WorldTile } from '$lib/game/core/types';

function tile(x: number, type: string, ice: number): WorldTile {
  return {
    x,
    y: 0,
    type,
    walkable: type !== 'water',
    ice,
    snow: 0,
    subType: type
  } as unknown as WorldTile;
}

describe('ice in the snow overlay', () => {
  const hidden = [[false, false, false]];

  it('marks frozen water with its ice level so the water pass can draw it', () => {
    const grid = new GameGrid();
    applySnowToGrid(grid, tile(0, 'water', 50), hidden);
    expect(grid.getTile(0, 0)?.waterIce).toBeCloseTo(0.5, 6);
  });

  it('leaves ice on land and water below the visible level unmarked', () => {
    const grid = new GameGrid();
    applySnowToGrid(grid, tile(1, 'grass', 50), hidden);
    applySnowToGrid(grid, tile(2, 'water', 4), hidden);
    expect(grid.getTile(1, 0)?.waterIce).toBeUndefined();
    expect(grid.getTile(2, 0)).toBeUndefined();
  });
});
