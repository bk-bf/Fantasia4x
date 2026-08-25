import { describe, it, expect } from 'vitest';
import { pawnService } from '$lib/game/services/PawnService';
import { ticksFromSeconds } from '$lib/game/core/util/time';
import type { GameState, Pawn } from '$lib/game/core/types';

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

const idleAt = (id: string, x: number, y: number): Pawn =>
  ({ id, name: id, position: { x, y }, isAlive: true, isMoving: false }) as unknown as Pawn;

describe('mover deadlock — blocked path is dropped, not held forever', () => {
  it('drops a path blocked by a stationary body after MAX_BLOCKED_TICKS', () => {
    let state = makeState([
      moverAt('mover', 0, 0, [
        { x: 1, y: 0 },
        { x: 2, y: 0 }
      ]),
      idleAt('blocker', 1, 0)
    ]);

    for (let i = 0; i < MAX_BLOCKED_TICKS; i++) {
      state = pawnService.processMovement(state);
    }
    let mover = state.pawns.find((p) => p.id === 'mover')!;
    expect(mover.position).toEqual({ x: 0, y: 0 });
    expect(mover.path?.length).toBeGreaterThan(0);
    expect(mover.blockedTicks).toBe(MAX_BLOCKED_TICKS);

    state = pawnService.processMovement(state);
    mover = state.pawns.find((p) => p.id === 'mover')!;
    expect(mover.path?.length ?? 0).toBe(0);
    expect(mover.isMoving).toBe(false);
    expect(mover.hasReachedDestination).toBe(false);
    expect(mover.blockedTicks).toBe(0);
  });

  it('moves normally and never accrues blockedTicks when the path is clear', () => {
    let state = makeState([moverAt('mover', 0, 0, [{ x: 1, y: 0 }])]);
    for (let i = 0; i < MAX_BLOCKED_TICKS + 5; i++) {
      state = pawnService.processMovement(state);
    }
    const mover = state.pawns.find((p) => p.id === 'mover')!;
    expect(mover.position).toEqual({ x: 1, y: 0 });
    expect(mover.blockedTicks ?? 0).toBe(0);
  });
});
