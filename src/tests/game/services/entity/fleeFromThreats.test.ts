import { describe, it, expect } from 'vitest';
import { fleeFromThreats, fleeToSafety } from '$lib/game/services/entity/entityHelpers';
import type { GameState, Mob } from '$lib/game/core/types';

function makeState(blocked: Array<[number, number]> = []): GameState {
  const set = new Set(blocked.map(([x, y]) => `${x},${y}`));
  return {
    pawns: [],
    mobs: [],
    worldMap: Array.from({ length: 12 }, (_, y) =>
      Array.from({ length: 12 }, (_, x) => ({ x, y, walkable: !set.has(`${x},${y}`) }))
    )
  } as unknown as GameState;
}

const mob = (x: number, y: number, over: Partial<Mob> = {}): Mob =>
  ({ id: 'm', x, y, ...over }) as unknown as Mob;

describe('fleeFromThreats — maximin flee', () => {
  it('flees directly away from a single threat', () => {
    const res = fleeFromThreats(mob(5, 5), [{ x: 8, y: 5 }], makeState());
    expect(res.path?.length).toBe(1);
    expect(res.path![0].x).toBeLessThan(5);
  });

  it('escapes PERPENDICULAR when boxed between two opposite threats (no ping-pong)', () => {
    const res = fleeFromThreats(
      mob(5, 5),
      [
        { x: 9, y: 5 },
        { x: 1, y: 5 }
      ],
      makeState()
    );
    expect(res.path?.length).toBe(1);
    expect(res.path![0].x).toBe(5);
    expect(Math.abs(res.path![0].y - 5)).toBe(1);
  });

  it('commits to its current heading on a tie (does not reverse every tick)', () => {
    const m = mob(5, 5, {
      path: [{ x: 5, y: 4 }],
      pathIndex: 0,
      nextCellCostLeft: 30
    } as Partial<Mob>);
    const res = fleeFromThreats(
      m,
      [
        { x: 9, y: 5 },
        { x: 1, y: 5 }
      ],
      makeState()
    );
    expect(res).toBe(m);
  });

  it('holds in place when truly cornered (gap blocked by terrain) instead of thrashing', () => {
    const walls: Array<[number, number]> = [
      [4, 4],
      [5, 4],
      [6, 4],
      [4, 6],
      [5, 6],
      [6, 6]
    ];
    const res = fleeFromThreats(
      mob(5, 5),
      [
        { x: 9, y: 5 },
        { x: 1, y: 5 }
      ],
      makeState(walls)
    );
    expect(res.path?.length ?? 0).toBe(0);
  });
});

describe('fleeToSafety — distant-destination flee', () => {
  it('commits to its current run (does not recompute while a route to its locked dest is in progress)', () => {
    const m = mob(5, 5, {
      path: [
        { x: 6, y: 5 },
        { x: 7, y: 5 }
      ],
      pathIndex: 0,
      fleeDest: { x: 9, y: 5 }
    } as Partial<Mob>);
    expect(fleeToSafety(m, [{ x: 1, y: 5 }], makeState())).toBe(m);
  });

  it('falls back to a local maximin step when no distant point is reachable (pathfinder down)', () => {
    const res = fleeToSafety(mob(5, 5), [{ x: 8, y: 5 }], makeState());
    expect(res.path?.length).toBe(1);
    expect(res.path![0].x).toBeLessThan(5);
  });
});
