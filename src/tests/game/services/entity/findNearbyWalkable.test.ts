import { describe, it, expect } from 'vitest';
import { findNearbyWalkable } from '$lib/game/services/entity/entityHelpers';
import { rng, SeededRng } from '$lib/game/core/util/rng';
import type { GameState } from '$lib/game/core/types';

function world(w = 30, h = 30, blocked: Array<[number, number]> = []): GameState {
  const set = new Set(blocked.map(([x, y]) => `${x},${y}`));
  return {
    pawns: [],
    mobs: [],
    worldMap: Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => ({ x, y, walkable: !set.has(`${x},${y}`) }))
    )
  } as unknown as GameState;
}

describe('findNearbyWalkable — no home tether', () => {
  it('returns an adjacent walkable tile regardless of how far the mob has roamed', () => {
    const tile = findNearbyWalkable(world(), 1, 1, 'm');
    expect(tile).not.toBeNull();
    expect(Math.max(Math.abs(tile!.x - 1), Math.abs(tile!.y - 1))).toBe(1);
  });

  it('returns null only when genuinely boxed in by terrain', () => {
    const walls: Array<[number, number]> = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (dx || dy) walls.push([15 + dx, 15 + dy]);
    expect(findNearbyWalkable(world(30, 30, walls), 15, 15, 'm')).toBeNull();
  });

  it('skips a neighbour occupied by another body', () => {
    const state = world();
    (state as unknown as { mobs: unknown[] }).mobs = [{ id: 'b', x: 6, y: 5, state: 'Wander' }];
    for (let i = 0; i < 30; i++) {
      const tile = findNearbyWalkable(state, 5, 5, 'm');
      expect(tile).not.toEqual({ x: 6, y: 5 });
    }
  });

  it('draws seven random numbers per call, one per shuffle swap', () => {
    rng.reseed(42);
    findNearbyWalkable(world(), 5, 5, 'm');
    const after = rng.random();
    const ref = new SeededRng(42);
    for (let i = 0; i < 7; i++) ref.random();
    expect(after).toBe(ref.random());
  });

  it('picks the same neighbour for the same seed, and every neighbour for some seed', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      rng.reseed(seed);
      const a = findNearbyWalkable(world(), 5, 5, 'm')!;
      rng.reseed(seed);
      expect(findNearbyWalkable(world(), 5, 5, 'm')).toEqual(a);
      seen.add(`${a.x - 5},${a.y - 5}`);
    }
    expect(seen.size).toBe(8);
  });
});
