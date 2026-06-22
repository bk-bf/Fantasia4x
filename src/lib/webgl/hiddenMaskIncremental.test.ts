import { describe, it, expect } from 'vitest';
import { computeHiddenMaskState, updateHiddenMaskAt } from './fantasia-world';
import type { WorldTile } from '$lib/game/core/types';

/**
 * ADR-026: the hidden-mask (interior-mountain fog) must update INCREMENTALLY from a worldMap delta —
 * never a whole-map BFS on a per-tick change. These regressions pin that `updateHiddenMaskAt` (a) is a
 * zero-cost no-op when no tile's SOLID topology flipped (harvest/regrowth), and (b) for a real flip
 * (mining opens a pocket / terraform seals one) produces EXACTLY the mask a fresh full BFS would — so the
 * local re-flood can't drift from the ground truth.
 */

// '#' = solid wall (rocky + ore), '.' = open grass. Each tile carries its real x/y.
function grid(rows: string[]): WorldTile[][] {
  return rows.map((row, y) =>
    [...row].map(
      (ch, x) =>
        ({
          x,
          y,
          walkable: ch !== '#',
          subType: ch === '#' ? 'rocky' : 'grass',
          resources: ch === '#' ? { stone: 5 } : {}
        }) as WorldTile
    )
  );
}

const mine = (m: WorldTile[][], x: number, y: number) => {
  m[y][x] = { ...m[y][x], subType: 'grass', resources: {} }; // mining clears the wall → non-solid
};
const wall = (m: WorldTile[][], x: number, y: number) => {
  m[y][x] = { ...m[y][x], subType: 'rocky', resources: { stone: 5 }, walkable: false };
};

/** Deep-equality of two boolean masks. */
const sameMask = (a: boolean[][], b: boolean[][]) =>
  a.length === b.length && a.every((row, y) => row.every((v, x) => v === b[y][x]));

describe('ADR-026 incremental hidden mask', () => {
  it('no-ops (returns []) when a delta does not change solid topology', () => {
    const m = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
    const state = computeHiddenMaskState(m);
    const before = state.mask.map((r) => [...r]);
    // A non-solid tile gains a resource (berries regrew) — solidness unchanged.
    m[0][0] = { ...m[0][0], resources: { berries: 3 } };
    const touched = updateHiddenMaskAt(state, m, [{ y: 0, x: 0 }]);
    expect(touched).toEqual([]);
    expect(sameMask(state.mask, before)).toBe(true);
  });

  it('mining a wall opens a sealed pocket — local update matches a fresh full BFS', () => {
    // Center (2,2) is an open tile fully ringed by walls → an enclosed (hidden) pocket.
    const m = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
    const state = computeHiddenMaskState(m);
    expect(state.mask[2][2]).toBe(true); // sealed pocket → hidden

    // Mine the top wall of the ring (2,1): the pocket now reaches the border through it.
    mine(m, 2, 1);
    const touched = updateHiddenMaskAt(state, m, [{ y: 1, x: 2 }]);

    expect(state.mask[2][2]).toBe(false); // pocket revealed
    expect(state.mask[1][2]).toBe(false); // mined tile is now open ground
    expect(touched.length).toBeGreaterThan(0);
    // Ground truth: a full rebuild of the mutated map must agree everywhere.
    expect(sameMask(state.mask, computeHiddenMaskState(m).mask)).toBe(true);
  });

  it('terraforming a wall seals an open pocket — local update matches a fresh full BFS', () => {
    // Same ring but with a gap at (2,1): the centre is connected to the border → visible.
    const m = grid(['.....', '.#.#.', '.#.#.', '.###.', '.....']);
    const state = computeHiddenMaskState(m);
    expect(state.mask[2][2]).toBe(false); // open, reachable → visible

    // Build a wall in the gap (2,1): the centre is now sealed.
    wall(m, 2, 1);
    updateHiddenMaskAt(state, m, [{ y: 1, x: 2 }]);

    expect(state.mask[2][2]).toBe(true); // newly enclosed → hidden
    expect(sameMask(state.mask, computeHiddenMaskState(m).mask)).toBe(true);
  });

  it('handles several flips in one delta batch (consistent with a full rebuild)', () => {
    const m = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
    const state = computeHiddenMaskState(m);
    mine(m, 2, 1);
    mine(m, 1, 2);
    const touched = updateHiddenMaskAt(state, m, [
      { y: 1, x: 2 },
      { y: 2, x: 1 }
    ]);
    expect(touched.length).toBeGreaterThan(0);
    expect(sameMask(state.mask, computeHiddenMaskState(m).mask)).toBe(true);
  });
});
