import { describe, it, expect } from 'vitest';
import { moveToward } from './entityHelpers';
import type { GameState, Mob } from '../../core/types';

// Regression (#1816–1821 column freeze): a laired mob pulled home by the territory leash froze on the
// leash boundary because the leash blanked `path: []` every tick before calling moveToward. That
// defeated stepDirectional's anti-reset guard (it only preserves nextCellCostLeft when the re-issued
// step matches the CURRENT path's next cell), so the sub-tile cost budget was wiped every tick and a
// mob whose per-tile cost exceeds one tick's movement budget (any normal/diagonal tile) could never
// finish crossing — frozen, costLeft pinned at the full tile cost. These lock the guard the fix relies
// on: continuing toward the same cell preserves the accrued cost; only a genuinely new step resets it.

function makeState(): GameState {
  return {
    pawns: [],
    mobs: [],
    worldMap: Array.from({ length: 12 }, (_, y) =>
      Array.from({ length: 12 }, (_, x) => ({ x, y, walkable: true }))
    )
  } as unknown as GameState;
}

const mob = (x: number, y: number, over: Partial<Mob> = {}): Mob =>
  ({ id: 'm', x, y, ...over }) as unknown as Mob;

describe('moveToward — preserves sub-tile cost when continuing the same step', () => {
  it('returns the mob UNCHANGED when re-targeting the cell it is already pathing to', () => {
    // Heading toward a lair at (9,9); current path already points to the diagonal step (6,6) with cost
    // accrued. Re-issuing moveToward(lair) must NOT reset that cost — else it never finishes the tile.
    const m = mob(5, 5, {
      path: [{ x: 6, y: 6 }],
      pathIndex: 0,
      nextCellCostLeft: 40
    } as Partial<Mob>);
    const res = moveToward(m, { x: 9, y: 9 }, makeState());
    expect(res).toBe(m); // unchanged → nextCellCostLeft (40) preserved, cost keeps accumulating
  });

  it('resets cost ONCE when redirected to a genuinely NEW cell (abandoning an old heading)', () => {
    // Was heading north (5,4) but home is now southeast — a different tile, so the budget resets once.
    const m = mob(5, 5, {
      path: [{ x: 5, y: 4 }],
      pathIndex: 0,
      nextCellCostLeft: 40
    } as Partial<Mob>);
    const res = moveToward(m, { x: 9, y: 9 }, makeState());
    expect(res).not.toBe(m);
    expect(res.path![0]).toEqual({ x: 6, y: 6 }); // re-aimed toward home
    expect(res.nextCellCostLeft).toBeUndefined(); // fresh tile → cost reset (once, correctly)
  });

  it('with a BLANKED path resets cost every call — the leash anti-pattern the fix removed', () => {
    // The bug: clearing path before moveToward leaves no currentNext to match, so the guard always
    // misses and cost is wiped. Asserting it documents WHY the leash must not blank `path`.
    const m = mob(5, 5, { path: [], nextCellCostLeft: 40 } as Partial<Mob>);
    const res = moveToward(m, { x: 9, y: 9 }, makeState());
    expect(res.path![0]).toEqual({ x: 6, y: 6 });
    expect(res.nextCellCostLeft).toBeUndefined();
  });
});
