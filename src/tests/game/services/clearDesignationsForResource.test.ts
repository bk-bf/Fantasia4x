import { describe, it, expect } from 'vitest';
import { designationService } from '$lib/game/services/DesignationService';
import type { GameState } from '$lib/game/core/types';

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
    expect(out.designations['2,2']).toBe('harvest');
  });

  it('is a no-op for a resource with no designated tiles', () => {
    const out = designationService.clearDesignationsForResource('iron', makeState());
    expect(Object.keys(out.designations).sort()).toEqual(['0,0', '1,1', '2,2']);
  });

  it('preserves zone membership on tiles whose action order is cancelled', () => {
    const state = makeState();
    (state.designationZoneId as Record<string, { restrict: string }>)['1,1'] = {
      restrict: 'restrict-1'
    };
    (state.zoneTiles as Record<string, string[]>)['1,1'] = ['restrict'];

    const out = designationService.clearDesignationsForResource('stone', state);
    expect(out.designations['1,1']).toBeUndefined();
    expect(out.designationZoneId?.['1,1']?.restrict).toBe('restrict-1');
    expect(out.zoneTiles?.['1,1']).toEqual(['restrict']);
  });

  it('clearActionDesignation removes only the action order, not the zone', () => {
    const state = makeState();
    (state.designationZoneId as Record<string, { restrict: string }>)['0,0'] = {
      restrict: 'restrict-1'
    };
    (state.zoneTiles as Record<string, string[]>)['0,0'] = ['restrict'];

    const out = designationService.clearActionDesignation(0, 0, state);
    expect(out.designations['0,0']).toBeUndefined();
    expect(out.designationZoneId?.['0,0']?.restrict).toBe('restrict-1');
    expect(out.zoneTiles?.['0,0']).toEqual(['restrict']);
  });
});
