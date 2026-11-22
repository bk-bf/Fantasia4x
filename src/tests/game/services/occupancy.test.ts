import { describe, it, expect } from 'vitest';
import { occupancyService } from '$lib/game/services/OccupancyService';
import type { GameState } from '$lib/game/core/types';

function gs(over: Partial<GameState>): GameState {
  const worldMap = Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => ({ x, y, walkable: true, movementCost: 1 }))
  );
  return { pawns: [], mobs: [], worldMap, ...over } as unknown as GameState;
}

describe('isBlocked answers the same question blockedTiles does', () => {
  const state = gs({
    pawns: [{ id: 'p1', position: { x: 1, y: 1 } }, { id: 'p2' }] as never,
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

  it('a body on the tile blocks even when the excluded body shares it', () => {
    const shared = gs({
      pawns: [{ id: 'p1', position: { x: 1, y: 1 } }] as never,
      mobs: [{ id: 'm1', x: 1, y: 1, state: 'Wander' }] as never
    });
    expect(occupancyService.isBlocked(shared, 1, 1, 'p1')).toBe(true);
    expect(occupancyService.isBlocked(shared, 1, 1, 'm1')).toBe(true);
  });

  it('agrees with blockedTiles on every tile', () => {
    const set = occupancyService.blockedTiles(state);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++)
        expect(occupancyService.isBlocked(state, x, y)).toBe(set.has(y * 5 + x));
  });

  it('a state without mobs is blocked only by pawns', () => {
    const noMobs = gs({
      pawns: [{ id: 'p1', position: { x: 4, y: 0 } }] as never,
      mobs: undefined
    });
    expect(occupancyService.isBlocked(noMobs, 4, 0)).toBe(true);
    expect(occupancyService.isBlocked(noMobs, 0, 4)).toBe(false);
  });

  it('a dead pawn still holds its tile for isBlocked, while blockedTiles leaves it out', () => {
    const s2 = gs({
      pawns: [
        { id: 'p1', position: { x: 1, y: 1 } },
        { id: 'dead', position: { x: 4, y: 4 }, isAlive: false }
      ] as never,
      mobs: [{ id: 'm1', x: 2, y: 2, state: 'Wander' }] as never
    });
    const set = occupancyService.blockedTiles(s2, 'm1');
    expect(set.has(2 * 5 + 2)).toBe(false);
    expect(set.has(4 * 5 + 4)).toBe(false);
    expect(set.has(1 * 5 + 1)).toBe(true);
    expect(occupancyService.isBlocked(s2, 4, 4)).toBe(true);
  });
});
