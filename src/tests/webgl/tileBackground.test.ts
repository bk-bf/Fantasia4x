import { describe, it, expect } from 'vitest';
import { buildGameGrid } from '$lib/webgl/fantasia-world';
import { SUBTERRAINS } from '$lib/game/core/defs/terrains';
import type { WorldTile } from '$lib/game/core/types';

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

describe('tilemap background uniformity', () => {
  const grassBg = SUBTERRAINS['grass'].bg;

  it('an active tree resource renders over the subterrain background, not the tree green bg', () => {
    const grid = buildGameGrid([[tile({ subType: 'grass', resources: { oak_tree: 3 } })]]);
    const bg = grid.getTile(0, 0)!.background;
    expect([bg.r, bg.g, bg.b]).toEqual([grassBg[0], grassBg[1], grassBg[2]]);
  });

  it('a harvested (depleted + on cooldown) tree keeps the subterrain background', () => {
    const grid = buildGameGrid([
      [
        tile({
          subType: 'grass',
          resources: { oak_tree: 0 },
          resourceCooldowns: { oak_tree: 9999 }
        })
      ]
    ]);
    const bg = grid.getTile(0, 0)!.background;
    expect([bg.r, bg.g, bg.b]).toEqual([grassBg[0], grassBg[1], grassBg[2]]);
  });

  it('a bare subterrain tile uses the subterrain background', () => {
    const grid = buildGameGrid([[tile({ subType: 'grass' })]]);
    const bg = grid.getTile(0, 0)!.background;
    expect([bg.r, bg.g, bg.b]).toEqual([grassBg[0], grassBg[1], grassBg[2]]);
  });
});

describe('layered terrain ground suppression', () => {
  it('an opaque resource (grass patch) blanks the terrain ground glyph', () => {
    const grid = buildGameGrid([[tile({ subType: 'grass', resources: { grass_patch: 1 } })]]);
    expect(grid.getTile(0, 0)!.char).toBe(' ');
  });

  it('a bare tile keeps its subterrain ground glyph', () => {
    const grid = buildGameGrid([[tile({ subType: 'grass' })]]);
    expect(grid.getTile(0, 0)!.char).not.toBe(' ');
  });

  it('an ore vein (showGroundBelow) keeps the grey rock-wall base glyph beneath it', () => {
    const grid = buildGameGrid(
      [[tile({ subType: 'mineral_deposit', resources: { hematite: 3 } })]],
      undefined,
      [[false]]
    );
    expect(grid.getTile(0, 0)!.char).not.toBe(' ');
  });
});
