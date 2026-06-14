import { describe, it, expect } from 'vitest';
import { pawnService } from './PawnService';
import { ticksFromSeconds } from '../core/time';
import type { GameState, Pawn } from '../core/types';

// Regression: a pawn whose next path tile is held by a STATIONARY body must not wait forever.
// The mover holds politely for a moment (transient traffic), but after MAX_BLOCKED_TICKS it
// drops the stale path so the FSM re-routes around the obstruction — mirroring the mob mover.
//
// Root cause this guards: idle pawns parked on a build-site approach tile froze the claimant
// (and any haulers) indefinitely, so the building never accumulated work (.debug/pawns.log).

const MAX_BLOCKED_TICKS = ticksFromSeconds(1.5);

function makeWorld(w: number, h: number): GameState['worldMap'] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({ x, y, walkable: true, movementCost: 1 }))
  ) as unknown as GameState['worldMap'];
}

function makeState(pawns: Pawn[]): GameState {
  return {
    turn: 0,
    pawns,
    mobs: [],
    buildings: [],
    worldMap: makeWorld(10, 10)
  } as unknown as GameState;
}

/** Mover at (x,y) following `path`, currently moving. */
const moverAt = (id: string, x: number, y: number, path: { x: number; y: number }[]): Pawn =>
  ({
    id,
    name: id,
    position: { x, y },
    path,
    pathIndex: 0,
    isMoving: true,
    isAlive: true
  }) as unknown as Pawn;

/** Stationary body occupying (x,y). */
const idleAt = (id: string, x: number, y: number): Pawn =>
  ({ id, name: id, position: { x, y }, isAlive: true, isMoving: false }) as unknown as Pawn;

describe('mover deadlock — blocked path is dropped, not held forever', () => {
  it('drops a path blocked by a stationary body after MAX_BLOCKED_TICKS', () => {
    // Mover at (0,0) wants to step into (1,0), but an idle pawn sits there permanently.
    let state = makeState([
      moverAt('mover', 0, 0, [
        { x: 1, y: 0 },
        { x: 2, y: 0 }
      ]),
      idleAt('blocker', 1, 0)
    ]);

    // Up to the threshold it WAITS: path kept, isMoving true, blockedTicks climbing.
    for (let i = 0; i < MAX_BLOCKED_TICKS; i++) {
      state = pawnService.processMovement(state);
    }
    let mover = state.pawns.find((p) => p.id === 'mover')!;
    expect(mover.position).toEqual({ x: 0, y: 0 }); // never moved (blocker in the way)
    expect(mover.path?.length).toBeGreaterThan(0); // still holding the path
    expect(mover.blockedTicks).toBe(MAX_BLOCKED_TICKS);

    // One more tick crosses the threshold → path dropped so the FSM re-routes next tick.
    state = pawnService.processMovement(state);
    mover = state.pawns.find((p) => p.id === 'mover')!;
    expect(mover.path?.length ?? 0).toBe(0);
    expect(mover.isMoving).toBe(false);
    expect(mover.hasReachedDestination).toBe(false); // did NOT arrive — must re-path
    expect(mover.blockedTicks).toBe(0);
  });

  it('moves normally and never accrues blockedTicks when the path is clear', () => {
    let state = makeState([moverAt('mover', 0, 0, [{ x: 1, y: 0 }])]);
    for (let i = 0; i < MAX_BLOCKED_TICKS + 5; i++) {
      state = pawnService.processMovement(state);
    }
    const mover = state.pawns.find((p) => p.id === 'mover')!;
    expect(mover.position).toEqual({ x: 1, y: 0 }); // reached the next tile
    expect(mover.blockedTicks ?? 0).toBe(0);
  });
});
