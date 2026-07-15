import { describe, it, expect } from 'vitest';
import { findNearbyWalkable } from '$lib/game/services/entity/entityHelpers';
import type { GameState } from '$lib/game/core/types';

// Entities roam freely — no home tether. findNearbyWalkable returns any walkable, unoccupied
// neighbour from WHEREVER the mob currently is, so a predator stranded at a distant kill site can
// always step (regression: the old HOME_RANGE filter returned null when far from spawn → frozen).

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
    // Far corner of the map — would have been rejected by the old home-range filter.
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
    // Only (6,5) is occupied; the returned tile must not be it.
    for (let i = 0; i < 30; i++) {
      const tile = findNearbyWalkable(state, 5, 5, 'm');
      expect(tile).not.toEqual({ x: 6, y: 5 });
    }
  });
});
