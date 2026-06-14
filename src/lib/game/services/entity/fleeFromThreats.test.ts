import { describe, it, expect } from 'vitest';
import { fleeFromThreats, fleeToSafety } from './entityHelpers';
import type { GameState, Mob } from '../../core/types';

// FLEE-1: prey boxed between two threats used to ping-pong because it backed away from the single
// CLOSEST threat each tick (which flips side to side). fleeFromThreats maximises the MIN distance to
// the whole threat set, so it commits to the gap (perpendicular escape) or holds when cornered.

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
    expect(res.path![0].x).toBeLessThan(5); // moved west, away from the eastern threat
  });

  it('escapes PERPENDICULAR when boxed between two opposite threats (no ping-pong)', () => {
    // Threats due east and due west — every E/W step gets closer to one, so the prey must slip
    // north/south through the gap rather than oscillate toward whichever is nearest.
    const res = fleeFromThreats(mob(5, 5), [
      { x: 9, y: 5 },
      { x: 1, y: 5 }
    ], makeState());
    expect(res.path?.length).toBe(1);
    expect(res.path![0].x).toBe(5); // did NOT move toward either threat
    expect(Math.abs(res.path![0].y - 5)).toBe(1); // slipped perpendicular (north/south)
  });

  it('commits to its current heading on a tie (does not reverse every tick)', () => {
    // Already heading north; the tie between N and S must resolve to N (the same-step guard also
    // returns the mob unchanged so the in-progress crossing — and render — is preserved).
    const m = mob(5, 5, { path: [{ x: 5, y: 4 }], pathIndex: 0, nextCellCostLeft: 30 } as Partial<Mob>);
    const res = fleeFromThreats(m, [
      { x: 9, y: 5 },
      { x: 1, y: 5 }
    ], makeState());
    expect(res).toBe(m); // unchanged — keeps heading + crossing
  });

  it('holds in place when truly cornered (gap blocked by terrain) instead of thrashing', () => {
    // E/W threats, and the perpendicular escape (N/S, incl. diagonals) walled off → no neighbour
    // keeps the closest threat as far as standing still → stand fast (empty path), no ping-pong.
    const walls: Array<[number, number]> = [
      [4, 4], [5, 4], [6, 4],
      [4, 6], [5, 6], [6, 6]
    ];
    const res = fleeFromThreats(mob(5, 5), [
      { x: 9, y: 5 },
      { x: 1, y: 5 }
    ], makeState(walls));
    expect(res.path?.length ?? 0).toBe(0);
  });
});

describe('fleeToSafety — distant-destination flee', () => {
  it('commits to its current run (does not recompute while a route to its locked dest is in progress)', () => {
    // A live, un-exhausted route toward a locked fleeDest → returned unchanged so the mover advances
    // it. Recomputing the destination mid-run is what flipped the direction and yoyo'd at big range.
    const m = mob(5, 5, {
      path: [{ x: 6, y: 5 }, { x: 7, y: 5 }],
      pathIndex: 0,
      fleeDest: { x: 9, y: 5 }
    } as Partial<Mob>);
    expect(fleeToSafety(m, [{ x: 1, y: 5 }], makeState())).toBe(m);
  });

  it('falls back to a local maximin step when no distant point is reachable (pathfinder down)', () => {
    // The WASM pathfinder isn't initialised under vitest, so pathTo returns [] for every candidate
    // → fleeToSafety degrades to the local fleeFromThreats step rather than freezing.
    const res = fleeToSafety(mob(5, 5), [{ x: 8, y: 5 }], makeState());
    expect(res.path?.length).toBe(1);
    expect(res.path![0].x).toBeLessThan(5); // still moved away from the eastern threat
  });
});
