import { describe, it, expect } from 'vitest';
import { occupancyService } from '$lib/game/services/OccupancyService';
import type { GameState } from '$lib/game/core/types';

function gs(over: Partial<GameState>): GameState {
  const worldMap = Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => ({ x, y, walkable: true, movementCost: 1 }))
  );
  return { pawns: [], mobs: [], worldMap, ...over } as unknown as GameState;
}

const key = (x: number, y: number) => y * 5 + x;

describe('isBlocked answers the same question blockedTiles does', () => {
  const state = gs({
    pawns: [{ id: 'p1', position: { x: 1, y: 1 } }] as never,
    mobs: [
      { id: 'm1', x: 2, y: 2, state: 'Wander' },
      { id: 'c1', x: 3, y: 3, state: 'Corpse' }
    ] as never
  });

  it('a live mob blocks its tile, except for itself', () => {
    expect(occupancyService.isBlocked(state, 2, 2)).toBe(true);
    expect(occupancyService.isBlocked(state, 2, 2, 'm1')).toBe(false);
    expect(occupancyService.isBlocked(state, 2, 2, 'p1')).toBe(true);
  });

  it('a corpse never blocks', () => {
    expect(occupancyService.isBlocked(state, 3, 3)).toBe(false);
  });

  it('a pawn blocks its tile, except for itself', () => {
    expect(occupancyService.isBlocked(state, 1, 1)).toBe(true);
    expect(occupancyService.isBlocked(state, 1, 1, 'p1')).toBe(false);
  });

  it('agrees with blockedTiles on every tile', () => {
    const set = occupancyService.blockedTiles(state);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++)
        expect(occupancyService.isBlocked(state, x, y)).toBe(set.has(key(x, y)));
  });
});

describe('blockedTiles', () => {
  const state = gs({
    pawns: [
      { id: 'p1', position: { x: 1, y: 1 } },
      { id: 'dead', position: { x: 4, y: 4 }, isAlive: false }
    ] as never,
    mobs: [
      { id: 'm1', x: 2, y: 2, state: 'Wander' },
      { id: 'c1', x: 3, y: 3, state: 'Corpse' }
    ] as never
  });

  it('leaves out the excluded mob, dead pawns and corpses', () => {
    expect([...occupancyService.blockedTiles(state, 'm1')]).toEqual([key(1, 1)]);
  });

  it('leaves out the excluded pawn', () => {
    expect([...occupancyService.blockedTiles(state, 'p1')]).toEqual([key(2, 2)]);
  });
});

describe('movingTargets', () => {
  it('counts only pawns that are moving along a path', () => {
    const state = gs({
      pawns: [
        { id: 'walker', position: { x: 0, y: 0 }, isMoving: true, path: [{ x: 1, y: 0 }] },
        { id: 'stood', position: { x: 0, y: 2 }, isMoving: false, path: [{ x: 1, y: 2 }] }
      ] as never,
      mobs: []
    });
    expect([...occupancyService.movingTargets(state).entries()]).toEqual([
      [key(0, 0), { id: 'walker', target: key(1, 0) }]
    ]);
  });
});

describe('blockedTilesShared', () => {
  it('rebuilds when the mobs array is replaced', () => {
    const pawns = [] as never;
    const first = gs({ pawns, mobs: [{ id: 'm1', x: 0, y: 0, state: 'Wander' }] as never });
    expect([...occupancyService.blockedTilesShared(first)]).toEqual([key(0, 0)]);
    const moved = gs({ pawns, mobs: [{ id: 'm1', x: 4, y: 4, state: 'Wander' }] as never });
    expect([...occupancyService.blockedTilesShared(moved)]).toEqual([key(4, 4)]);
  });
});
