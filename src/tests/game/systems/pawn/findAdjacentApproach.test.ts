import { describe, it, expect } from 'vitest';
import type { WorldTile } from '$lib/game/core/types';
import { findAdjacentApproach } from '$lib/game/systems/pawn/pawnQueries';

describe('findAdjacentApproach', () => {
  const map = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({ walkable: true, movementCost: 1 }) as unknown as WorldTile)
  ) as WorldTile[][];
  const TX = 2;
  const TY = 2;

  it('returns a walkable neighbour of the target when unconstrained', () => {
    const approach = findAdjacentApproach(TX, TY, map, new Set(), TX - 1, TY);
    expect(approach).not.toBeNull();
    expect(Math.abs(approach!.x - TX) <= 1 && Math.abs(approach!.y - TY) <= 1).toBe(true);
    expect(approach!.x === TX && approach!.y === TY).toBe(false);
  });

  it('with an `allowed` set, only returns an in-zone neighbour', () => {
    const allowed = new Set(['1,2']);
    const approach = findAdjacentApproach(TX, TY, map, new Set(), 0, 2, allowed);
    expect(approach).toEqual({ x: 1, y: 2 });
  });

  it('returns null when no neighbour of the target is in the allowed zone', () => {
    const allowed = new Set(['0,0', '4,4']);
    expect(findAdjacentApproach(TX, TY, map, new Set(), 0, 2, allowed)).toBeNull();
  });

  it('skips occupied tiles even when they are in the allowed zone', () => {
    const allowed = new Set(['1,2', '3,2']);
    const occupied = new Set(['1,2']);
    expect(findAdjacentApproach(TX, TY, map, occupied, 0, 2, allowed)).toEqual({ x: 3, y: 2 });
  });
});
