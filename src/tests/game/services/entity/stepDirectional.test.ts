import { describe, it, expect } from 'vitest';
import { moveToward } from '$lib/game/services/entity/entityHelpers';
import type { GameState, Mob } from '$lib/game/core/types';

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
    const m = mob(5, 5, {
      path: [{ x: 6, y: 6 }],
      pathIndex: 0,
      nextCellCostLeft: 40
    } as Partial<Mob>);
    const res = moveToward(m, { x: 9, y: 9 }, makeState());
    expect(res).toBe(m);
  });

  it('resets cost ONCE when redirected to a genuinely NEW cell (abandoning an old heading)', () => {
    const m = mob(5, 5, {
      path: [{ x: 5, y: 4 }],
      pathIndex: 0,
      nextCellCostLeft: 40
    } as Partial<Mob>);
    const res = moveToward(m, { x: 9, y: 9 }, makeState());
    expect(res).not.toBe(m);
    expect(res.path![0]).toEqual({ x: 6, y: 6 });
    expect(res.nextCellCostLeft).toBeUndefined();
  });

  it('with a BLANKED path resets cost every call — the leash anti-pattern the fix removed', () => {
    const m = mob(5, 5, { path: [], nextCellCostLeft: 40 } as Partial<Mob>);
    const res = moveToward(m, { x: 9, y: 9 }, makeState());
    expect(res.path![0]).toEqual({ x: 6, y: 6 });
    expect(res.nextCellCostLeft).toBeUndefined();
  });
});
