import { describe, it, expect } from 'vitest';
import { findNearbyWalkable } from './entityHelpers';
import type { GameState } from '../../core/types';

// A mob that hunted/was chased far from its home tile must be able to walk BACK, not freeze on the
// spot. Previously the home-range filter rejected every neighbour when the mob was already outside
// the range → null → stuck (e.g. wolf #16 frozen at its kill site after eating).

function world(w = 30, h = 30): GameState {
  return {
    pawns: [],
    mobs: [],
    worldMap: Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => ({ x, y, walkable: true }))
    )
  } as unknown as GameState;
}

describe('findNearbyWalkable — home tether', () => {
  it('steps TOWARD home when stranded far outside the home range (no freeze)', () => {
    // Mob at (5,5), home at (25,25) — ~20 tiles away, well past HOME_RANGE (10).
    const tile = findNearbyWalkable(world(), 5, 5, 25, 25, 'm');
    expect(tile).not.toBeNull();
    // Closer to home than staying put (Manhattan 40 → must drop).
    const before = Math.abs(5 - 25) + Math.abs(5 - 25);
    const after = Math.abs(tile!.x - 25) + Math.abs(tile!.y - 25);
    expect(after).toBeLessThan(before);
  });

  it('stays within the home range when already home (tethered wander)', () => {
    // At home; every returned tile must remain within HOME_RANGE (10).
    for (let i = 0; i < 50; i++) {
      const tile = findNearbyWalkable(world(), 15, 15, 15, 15, 'm');
      expect(tile).not.toBeNull();
      expect(Math.abs(tile!.x - 15)).toBeLessThanOrEqual(10);
      expect(Math.abs(tile!.y - 15)).toBeLessThanOrEqual(10);
    }
  });

  it('free-wanders (any walkable neighbour) when the mob has no home', () => {
    const tile = findNearbyWalkable(world(), 5, 5, undefined, undefined, 'm');
    expect(tile).not.toBeNull();
    expect(Math.max(Math.abs(tile!.x - 5), Math.abs(tile!.y - 5))).toBe(1);
  });
});
