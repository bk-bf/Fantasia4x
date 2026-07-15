import { describe, it, expect } from 'vitest';
import { stepBody, seedMidCrossClaims, MAX_BLOCKED_TICKS, type MovableBody } from '$lib/game/services/MovementSystem';
import type { WorldTile } from '$lib/game/core/types';

// MOVE-1: the shared per-tick move step used by BOTH the pawn (PawnService.processMovement) and mob
// (entityHelpers.advanceMobMovement) passes — so the two can't drift (the hunt-yoyo regression came
// from exactly such a divergence). These assert the rules every consumer now inherits.

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
    // One tick of a slow mover: cannot fully cross a cost-60 tile, so it stays at (0,0) with a
    // partial nextCellCostLeft — the sub-tile progress the renderer reads.
    const res = stepBody(b, new Set(), new Set(), world(), 4);
    expect(res.status).toBe('moved');
    expect(res.body.x).toBe(0); // not yet fully entered
    expect(res.body.nextCellCostLeft).toBeGreaterThan(0);
    // Keep stepping → eventually arrives at (1,0).
    b = res.body;
    for (let i = 0; i < 60 && b.x === 0; i++) {
      b = stepBody(b, new Set(), new Set(), world(), 4).body;
    }
    expect(b.x).toBe(1);
  });

  it('holds (keeps path, increments blockedTicks) when the next tile is occupied', () => {
    const occ = new Set(['1,0']);
    const res = stepBody(
      body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0 }),
      occ,
      new Set(),
      world(),
      4
    );
    expect(res.status).toBe('held');
    expect(res.body.blockedTicks).toBe(1);
    expect(res.body.path?.length).toBe(1); // path retained
  });

  it('drops the path after MAX_BLOCKED_TICKS so the FSM re-routes', () => {
    const occ = new Set(['1,0']);
    let b = body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0, blockedTicks: MAX_BLOCKED_TICKS });
    const res = stepBody(b, occ, new Set(), world(), 4);
    expect(res.status).toBe('dropped');
    expect(res.body.path?.length ?? 0).toBe(0);
    expect(res.body.blockedTicks).toBe(0);
  });

  it('preserves blockedTicks on a non-blocked tick that makes NO progress (gridlock breaker)', () => {
    // A mob that was blocked (counter climbing) gets a momentarily-free target tile but is too slow to
    // fully enter it this tick (cost-60 tile, speed 4 → no position change). The counter must be KEPT,
    // not reset to 0 — else an intermittently-blocked mob (a dense pack whose target tiles flicker
    // occupied/free) never reaches MAX_BLOCKED_TICKS and the drop-and-reroute breaker never fires, so
    // the whole pack freezes in Wander on stale paths forever.
    const b = body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0, blockedTicks: 5 });
    const res = stepBody(b, new Set(), new Set(), world(), 4);
    expect(res.body.x).toBe(0); // did not actually enter the tile
    expect(res.body.blockedTicks).toBe(5); // counter preserved (was wrongly reset to 0 before the fix)
  });

  it('clears blockedTicks once the mob actually enters a tile (real progress)', () => {
    const b = body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0, blockedTicks: 5 });
    const res = stepBody(b, new Set(), new Set(), world(), 200); // fast enough to cross in one tick
    expect(res.body.x).toBe(1); // entered the tile
    expect(res.body.blockedTicks).toBe(0); // real progress clears the counter
  });

  it('prevents two fresh movers converging on one tile (claim set)', () => {
    const claimed = new Set<string>();
    const a = stepBody(body('a', 0, 0, { path: [{ x: 1, y: 1 }], pathIndex: 0 }), new Set(), claimed, world(), 200);
    expect(a.status).toBe('moved');
    expect(claimed.has('1,1')).toBe(true);
    // Second mover targeting the same tile this tick is blocked by the claim.
    const b = stepBody(body('b', 2, 2, { path: [{ x: 1, y: 1 }], pathIndex: 0 }), new Set(), claimed, world(), 200);
    expect(b.status).toBe('held');
  });

  it('seedMidCrossClaims reserves a mid-crosser’s committed tile', () => {
    const claimed = new Set<string>();
    const bodies: MovableBody[] = [
      body('a', 0, 0, { path: [{ x: 1, y: 0 }], pathIndex: 0, nextCellCostLeft: 30 }) // mid-crossing
    ];
    seedMidCrossClaims(bodies, claimed, () => true);
    expect(claimed.has('1,0')).toBe(true);
  });
});
