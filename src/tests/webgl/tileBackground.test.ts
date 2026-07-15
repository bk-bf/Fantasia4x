import { describe, it, expect } from 'vitest';
import { buildGameGrid } from '$lib/webgl/fantasia-world';
import { SUBTERRAINS } from '$lib/game/core/Terrains';
import type { WorldTile } from '$lib/game/core/types';

/**
 * The map background must be uniform: a resource is a glyph drawn over the terrain, never its own
 * background block. Regression for trees leaking green ([0.07,0.1,0.03]) into the tile background —
 * which lingered after harvest while the tile sat on cooldown. The tile background must always equal
 * the subterrain background regardless of resource presence / depletion state.
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

describe('tilemap background uniformity', () => {
  const grassBg = SUBTERRAINS['grass'].bg; // dirt-brown [0.08, 0.06, 0.03]

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

/**
 * Ground-layer suppression: a resource that does NOT set `showGroundBelow` (the default) blanks the
 * terrain ground glyph so the resource (in the overlay) reads over the flat background — no dirt
 * showing through. `showGroundBelow` resources (ore veins) keep the ground glyph so the grey rock-wall
 * base composites beneath the coloured vein. See fantasia-world.applyTileToGrid / resolveActiveResource.
 */
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
    // Explicit all-visible mask: the lone non-walkable ore tile would otherwise read as enclosed
    // interior rock (hidden → blank) under the flood-fill.
    const grid = buildGameGrid(
      [[tile({ subType: 'mineral_deposit', resources: { hematite: 3 } })]],
      undefined,
      [[false]]
    );
    expect(grid.getTile(0, 0)!.char).not.toBe(' ');
  });
});
