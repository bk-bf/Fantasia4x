import { describe, it, expect } from 'vitest';
import { buildGameGrid } from './fantasia-world';
import { SUBTERRAINS } from '$lib/game/core/Terrains';
import type { WorldTile } from '$lib/game/core/types';

/**
 * Barren dirt autotiles into the surrounding grass: the terrain renderer picks a t_dirt_<variant>
 * sprite by which cardinal neighbours are also dirt, so a dirt patch feathers into grass instead of
 * a hard square boundary. These lock the bitmask→variant mapping (the part I can't eyeball).
 */
function t(x: number, y: number, sub: string): WorldTile {
  return { x, y, walkable: true, subType: sub, resources: {} as Record<string, number> } as WorldTile;
}
const AT = SUBTERRAINS['dirt'].autotile!;

describe('dirt autotile variant selection', () => {
  it('the atlas supplies the dirt autotile variants', () => {
    expect(AT?.center).toBeTruthy();
    expect(AT?.unconnected).toBeTruthy();
  });

  it('isolated dirt in grass → unconnected', () => {
    const g = buildGameGrid([
      [t(0, 0, 'grass'), t(1, 0, 'grass'), t(2, 0, 'grass')],
      [t(0, 1, 'grass'), t(1, 1, 'dirt'), t(2, 1, 'grass')],
      [t(0, 2, 'grass'), t(1, 2, 'grass'), t(2, 2, 'grass')]
    ]);
    expect(g.getTile(1, 1)!.char).toBe(AT.unconnected);
  });

  it('dirt surrounded by dirt → center', () => {
    const g = buildGameGrid([
      [t(0, 0, 'dirt'), t(1, 0, 'dirt'), t(2, 0, 'dirt')],
      [t(0, 1, 'dirt'), t(1, 1, 'dirt'), t(2, 1, 'dirt')],
      [t(0, 2, 'dirt'), t(1, 2, 'dirt'), t(2, 2, 'dirt')]
    ]);
    expect(g.getTile(1, 1)!.char).toBe(AT.center);
  });

  it('dirt with grass only to the south → t_connection_s (open/grass side = south)', () => {
    const g = buildGameGrid([
      [t(0, 0, 'dirt'), t(1, 0, 'dirt'), t(2, 0, 'dirt')],
      [t(0, 1, 'dirt'), t(1, 1, 'dirt'), t(2, 1, 'dirt')],
      [t(0, 2, 'grass'), t(1, 2, 'grass'), t(2, 2, 'grass')]
    ]);
    expect(g.getTile(1, 1)!.char).toBe(AT.t_connection_s);
  });

  it('dirt open to the NE corner (grass N+E) → corner_ne sprite', () => {
    // connected = S,W (grass on N,E) → corner_ne (named for the open/grass side)
    const g = buildGameGrid([
      [t(0, 0, 'dirt'), t(1, 0, 'grass'), t(2, 0, 'grass')],
      [t(0, 1, 'dirt'), t(1, 1, 'dirt'), t(2, 1, 'grass')],
      [t(0, 2, 'dirt'), t(1, 2, 'dirt'), t(2, 2, 'dirt')]
    ]);
    expect(g.getTile(1, 1)!.char).toBe(AT.corner_ne);
  });

  it('vertical dirt strip in grass → edge_ns', () => {
    const g = buildGameGrid([
      [t(0, 0, 'grass'), t(1, 0, 'dirt'), t(2, 0, 'grass')],
      [t(0, 1, 'grass'), t(1, 1, 'dirt'), t(2, 1, 'grass')],
      [t(0, 2, 'grass'), t(1, 2, 'dirt'), t(2, 2, 'grass')]
    ]);
    expect(g.getTile(1, 1)!.char).toBe(AT.edge_ns);
  });
});
