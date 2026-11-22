import { describe, it, expect } from 'vitest';
import { advanceMobMovement } from '$lib/game/services/entity/entityHelpers';
import type { GameState, Mob } from '$lib/game/core/types';

function state(mobs: Mob[]): GameState {
  return {
    turn: 1,
    pawns: [],
    mobs,
    worldMap: Array.from({ length: 10 }, (_, y) =>
      Array.from({ length: 10 }, (_, x) => ({ x, y, walkable: true, movementCost: 1 }))
    )
  } as unknown as GameState;
}

const mob = (id: string, x: number, y: number, over: Partial<Mob> = {}): Mob =>
  ({ id, creatureId: 'boar', state: 'Wander', x, y, ...over }) as unknown as Mob;

describe('advanceMobMovement — mobs walk their paths in place', () => {
  it('returns the same state when no mob has a path', () => {
    const s = state([mob('a', 1, 1), mob('b', 5, 5)]);
    expect(advanceMobMovement(s)).toBe(s);
  });

  it('gives a new mobs array when a mob moves, holding the same mob objects', () => {
    const walker = mob('a', 1, 1, { path: [{ x: 2, y: 1 }], pathIndex: 0 });
    const idle = mob('b', 5, 5);
    const s = state([walker, idle]);
    let next = s;
    for (let i = 0; i < 300 && walker.x === 1; i++) next = advanceMobMovement(next);
    expect(next.mobs).not.toBe(s.mobs);
    expect(next.mobs![0]).toBe(walker);
    expect(next.mobs![1]).toBe(idle);
    expect(walker).toMatchObject({ x: 2, y: 1, path: [] });
  });

  it('gives a new mobs array when a mob is held behind another', () => {
    const blocked = mob('a', 1, 1, { path: [{ x: 2, y: 1 }], pathIndex: 0 });
    const s = state([blocked, mob('b', 2, 1)]);
    const next = advanceMobMovement(s);
    expect(next.mobs).not.toBe(s.mobs);
    expect(blocked.blockedTicks).toBe(1);
    expect(blocked.x).toBe(1);
  });
});
