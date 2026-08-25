import { describe, it, expect } from 'vitest';
import { computeHiddenMaskState, updateHiddenMaskAt } from '$lib/webgl/fantasia-world';
import type { WorldTile } from '$lib/game/core/types';

function grid(rows: string[]): WorldTile[][] {
  return rows.map((row, y) =>
    [...row].map(
      (ch, x) =>
        ({
          x,
          y,
          walkable: ch !== '#',
          subType: ch === '#' ? 'cave' : 'grass',
          resources: ch === '#' ? { stone: 5 } : {}
        }) as WorldTile
    )
  );
}

const mine = (m: WorldTile[][], x: number, y: number) => {
  m[y][x] = { ...m[y][x], subType: 'cave', resources: {}, walkable: true };
};
const wall = (m: WorldTile[][], x: number, y: number) => {
  m[y][x] = { ...m[y][x], subType: 'cave', resources: { stone: 5 }, walkable: false };
};

const sameMask = (a: boolean[][], b: boolean[][]) =>
  a.length === b.length && a.every((row, y) => row.every((v, x) => v === b[y][x]));

describe('ADR-026 incremental hidden mask', () => {
  it('no-ops (returns []) when a delta does not change solid topology', () => {
    const m = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
    const state = computeHiddenMaskState(m);
    const before = state.mask.map((r) => [...r]);
    m[0][0] = { ...m[0][0], resources: { berries: 3 } };
    const touched = updateHiddenMaskAt(state, m, [{ y: 0, x: 0 }]);
    expect(touched).toEqual([]);
    expect(sameMask(state.mask, before)).toBe(true);
  });

  it('mining a wall opens a sealed pocket — local update matches a fresh full BFS', () => {
    const m = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
    const state = computeHiddenMaskState(m);
    expect(state.mask[2][2]).toBe(true);

    mine(m, 2, 1);
    const touched = updateHiddenMaskAt(state, m, [{ y: 1, x: 2 }]);

    expect(state.mask[2][2]).toBe(false);
    expect(state.mask[1][2]).toBe(false);
    expect(touched.length).toBeGreaterThan(0);
    expect(sameMask(state.mask, computeHiddenMaskState(m).mask)).toBe(true);
  });

  it('terraforming a wall seals an open pocket — local update matches a fresh full BFS', () => {
    const m = grid(['.....', '.#.#.', '.#.#.', '.###.', '.....']);
    const state = computeHiddenMaskState(m);
    expect(state.mask[2][2]).toBe(false);

    wall(m, 2, 1);
    updateHiddenMaskAt(state, m, [{ y: 1, x: 2 }]);

    expect(state.mask[2][2]).toBe(true);
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
