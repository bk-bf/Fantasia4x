import { describe, it, expect } from 'vitest';
import { findNearestDepositPoint } from '$lib/game/systems/pawn/pawnHauling';
import type { GameState, Pawn } from '$lib/game/core/types';

function makeWorld(
  w: number,
  h: number,
  blocked: Array<[number, number]> = []
): GameState['worldMap'] {
  const set = new Set(blocked.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({ x, y, walkable: !set.has(`${x},${y}`) }))
  ) as unknown as GameState['worldMap'];
}

function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    turn: 0,
    pawns: [],
    mobs: [],
    buildings: [],
    designations: {},
    droppedItems: [],
    worldMap: makeWorld(10, 10),
    ...partial
  } as unknown as GameState;
}

const haulerAt = (x: number, y: number): Pawn =>
  ({ id: 'hauler', name: 'H', position: { x, y }, isAlive: true }) as unknown as Pawn;

describe('PT-1 findNearestDepositPoint — standable selection', () => {
  it('returns the nearest stockpile tile when it is standable', () => {
    const pawn = haulerAt(0, 0);
    const state = makeState({
      pawns: [pawn],
      zoneTiles: { '2,0': ['stockpile'], '5,0': ['stockpile'] }
    });
    expect(findNearestDepositPoint(pawn, state)).toEqual({ x: 2, y: 0 });
  });

  it('skips the nearest stockpile tile when another body occupies it, choosing a standable one', () => {
    const pawn = haulerAt(0, 0);
    const blocker = {
      id: 'b',
      name: 'B',
      position: { x: 2, y: 0 },
      isAlive: true
    } as unknown as Pawn;
    const state = makeState({
      pawns: [pawn, blocker],
      zoneTiles: { '2,0': ['stockpile'], '4,0': ['stockpile'] }
    });
    expect(findNearestDepositPoint(pawn, state)).toEqual({ x: 4, y: 0 });
  });

  it('skips a non-walkable nearest stockpile tile', () => {
    const pawn = haulerAt(0, 0);
    const state = makeState({
      pawns: [pawn],
      worldMap: makeWorld(10, 10, [[2, 0]]),
      zoneTiles: { '2,0': ['stockpile'], '4,0': ['stockpile'] }
    });
    expect(findNearestDepositPoint(pawn, state)).toEqual({ x: 4, y: 0 });
  });

  it('falls back to the nearest stockpile tile (deposit-in-place) when none are standable', () => {
    const pawn = haulerAt(0, 0);
    const state = makeState({
      pawns: [pawn],
      worldMap: makeWorld(10, 10, [[2, 0]]),
      zoneTiles: { '2,0': ['stockpile'] }
    });
    expect(findNearestDepositPoint(pawn, state)).toEqual({ x: 2, y: 0 });
  });

  it('targets a standable tile ADJACENT to a storage building when no stockpile zone exists', () => {
    const pawn = haulerAt(0, 0);
    const state = makeState({
      pawns: [pawn],
      buildings: [{ id: 's', type: 'storage_rack', x: 5, y: 5, status: 'complete' }] as any
    });
    const pt = findNearestDepositPoint(pawn, state)!;
    expect(pt).not.toBeNull();
    expect(Math.max(Math.abs(pt.x - 5), Math.abs(pt.y - 5))).toBe(1);
  });
});
