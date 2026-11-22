import { describe, it, expect } from 'vitest';
import {
  stepBody,
  advanceAlongPath,
  seedMidCrossClaims,
  MAX_BLOCKED_TICKS,
  type MovableBody
} from '$lib/game/services/MovementSystem';
import type { WorldTile } from '$lib/game/core/types';
import { tileKey } from '$lib/game/core/util/tileKey';

function world(w = 10, h = 10): WorldTile[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({ x, y, walkable: true, movementCost: 1 }))
  ) as unknown as WorldTile[][];
}

const body = (id: string, x: number, y: number, over: Partial<MovableBody> = {}): MovableBody => ({
  id,
  x,
  y,
  ...over
});

describe('stepBody — shared move pass', () => {
  it('idle when there is no path', () => {
    const res = stepBody(body('a', 0, 0), new Set(), new Set(), world(), 4);
    expect(res.status).toBe('idle');
    expect(res.body.x).toBe(0);
  });

  it('moves along the path, preserving mid-crossing across calls', () => {
    let b = body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0 });
    const res = stepBody(b, new Set(), new Set(), world(), 4);
    expect(res.status).toBe('moved');
    expect(res.body.x).toBe(0);
    expect(res.body.nextCellCostLeft).toBeGreaterThan(0);
    b = res.body;
    for (let i = 0; i < 60 && b.x === 0; i++) {
      b = stepBody(b, new Set(), new Set(), world(), 4).body;
    }
    expect(b.x).toBe(1);
  });

  it('holds (keeps path, increments blockedTicks) when the next tile is occupied', () => {
    const occ = new Set([tileKey(1, 0, 10)]);
    const res = stepBody(
      body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0 }),
      occ,
      new Set(),
      world(),
      4
    );
    expect(res.status).toBe('held');
    expect(res.body.blockedTicks).toBe(1);
    expect(res.body.path?.length).toBe(1);
  });

  it('drops the path after MAX_BLOCKED_TICKS so the FSM re-routes', () => {
    const occ = new Set([tileKey(1, 0, 10)]);
    let b = body('a', 0, 0, {
      path: [{ x: 1, y: 0 }],
      pathIndex: 0,
      blockedTicks: MAX_BLOCKED_TICKS
    });
    const res = stepBody(b, occ, new Set(), world(), 4);
    expect(res.status).toBe('dropped');
    expect(res.body.path?.length ?? 0).toBe(0);
    expect(res.body.blockedTicks).toBe(0);
  });

  it('preserves blockedTicks on a non-blocked tick that makes NO progress (gridlock breaker)', () => {
    const b = body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0, blockedTicks: 5 });
    const res = stepBody(b, new Set(), new Set(), world(), 4);
    expect(res.body.x).toBe(0);
    expect(res.body.blockedTicks).toBe(5);
  });

  it('clears blockedTicks once the mob actually enters a tile (real progress)', () => {
    const b = body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0, blockedTicks: 5 });
    const res = stepBody(b, new Set(), new Set(), world(), 200);
    expect(res.body.x).toBe(1);
    expect(res.body.blockedTicks).toBe(0);
  });

  it('prevents two fresh movers converging on one tile (claim set)', () => {
    const claimed = new Set<number>();
    const a = stepBody(
      body('a', 0, 0, { path: [{ x: 1, y: 1 }], pathIndex: 0 }),
      new Set(),
      claimed,
      world(),
      200
    );
    expect(a.status).toBe('moved');
    expect(claimed.has(tileKey(1, 1, 10))).toBe(true);
    const b = stepBody(
      body('b', 2, 2, { path: [{ x: 1, y: 1 }], pathIndex: 0 }),
      new Set(),
      claimed,
      world(),
      200
    );
    expect(b.status).toBe('held');
  });

  it('seedMidCrossClaims reserves a mid-crosser’s committed tile', () => {
    const claimed = new Set<number>();
    const bodies: MovableBody[] = [
      body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0, nextCellCostLeft: 30 })
    ];
    seedMidCrossClaims(bodies, claimed, 10, () => true);
    expect(claimed.has(tileKey(1, 0, 10))).toBe(true);
  });

  it('advances the body it is given in place instead of copying it', () => {
    const path = [
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ];
    const b = body('a', 0, 0, { path, pathIndex: 0, blockedTicks: 3 });
    const res = stepBody(b, new Set(), new Set(), world(), 200);
    expect(res.body).toBe(b);
    expect(res.status).toBe('moved');
    expect(b).toMatchObject({ x: 2, y: 0, pathIndex: 0, blockedTicks: 0 });
    expect(b.path).toEqual([]);
    expect(b.nextCellCostLeft).toBeUndefined();
    expect(res.done).toBe(true);
  });

  it('keeps the path array and records mid-crossing progress on the body', () => {
    const path = [
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ];
    const b = body('a', 0, 0, { path, pathIndex: 0 });
    stepBody(b, new Set(), new Set(), world(), 4);
    expect(b.path).toBe(path);
    expect(b.x).toBe(0);
    expect(b.nextCellCostLeft).toBeGreaterThan(0);
  });

  it('writes blockedTicks onto the held body and clears the path of a dropped one', () => {
    const occ = new Set([tileKey(1, 0, 10)]);
    const held = body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0 });
    expect(stepBody(held, occ, new Set(), world(), 4).body).toBe(held);
    expect(held.blockedTicks).toBe(1);
    const dropped = body('b', 0, 0, {
      path: [{ x: 1, y: 0 }],
      pathIndex: 0,
      nextCellCostLeft: 5,
      blockedTicks: MAX_BLOCKED_TICKS
    });
    expect(stepBody(dropped, occ, new Set(), world(), 4).body).toBe(dropped);
    expect(dropped).toMatchObject({ path: [], pathIndex: 0, blockedTicks: 0 });
    expect(dropped.nextCellCostLeft).toBeUndefined();
  });

  it('abandons a path whose next step is not adjacent without moving', () => {
    const b = body('a', 0, 0, { path: [{ x: 3, y: 0 }], pathIndex: 0 });
    const res = stepBody(b, new Set(), new Set(), world(), 200);
    expect(res.done).toBe(true);
    expect(b).toMatchObject({ x: 0, y: 0, path: [], pathIndex: 0 });
  });
});

describe('advanceAlongPath — the copying API', () => {
  it('returns a moved copy and leaves its input untouched', () => {
    const path = [{ x: 1, y: 0 }];
    const b = body('a', 0, 0, { path, pathIndex: 0 });
    const moved = advanceAlongPath(b, 200, world());
    expect(moved).not.toBe(b);
    expect(moved).toMatchObject({ x: 1, y: 0, path: [], pathIndex: 0 });
    expect(b).toEqual({ id: 'a', x: 0, y: 0, path, pathIndex: 0 });
  });

  it('returns the same entity when there is no path', () => {
    const b = body('a', 0, 0);
    expect(advanceAlongPath(b, 200, world())).toBe(b);
  });
});
