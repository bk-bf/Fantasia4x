import { describe, it, expect } from 'vitest';
import { designationService } from './DesignationService';
import type { GameState } from '../core/types';

// CANCEL on a designated resource is the symmetric inverse of MARK (bulk-designate all matching
// tiles): it must clear EVERY designated tile holding that resource, not only one.

// 3×3 world where stone sits on (0,0),(1,1) and wood on (2,2).
function makeState(): GameState {
  const tileAt = (x: number, y: number, resources: Record<string, number>) =>
    ({ x, y, walkable: true, resources }) as unknown;
  const worldMap = [
    [tileAt(0, 0, { stone: 5 }), tileAt(1, 0, {}), tileAt(2, 0, {})],
    [tileAt(0, 1, {}), tileAt(1, 1, { stone: 5 }), tileAt(2, 1, {})],
    [tileAt(0, 2, {}), tileAt(1, 2, {}), tileAt(2, 2, { wood: 5 })]
  ];
  return {
    worldMap,
    // stone mined on both stone tiles; wood harvested on its tile.
    designations: { '0,0': 'mine', '1,1': 'mine', '2,2': 'harvest' },
    designationZoneId: {},
    zoneTiles: {}
  } as unknown as GameState;
}

describe('clearDesignationsForResource (CANCEL ALL ⇆ MARK)', () => {
  it('clears every designated tile holding the resource', () => {
    const out = designationService.clearDesignationsForResource('stone', makeState());
    expect(out.designations['0,0']).toBeUndefined();
    expect(out.designations['1,1']).toBeUndefined();
    // A different resource's designation is untouched.
    expect(out.designations['2,2']).toBe('harvest');
  });

  it('is a no-op for a resource with no designated tiles', () => {
    const out = designationService.clearDesignationsForResource('iron', makeState());
    expect(Object.keys(out.designations).sort()).toEqual(['0,0', '1,1', '2,2']);
  });
});
