import { describe, it, expect } from 'vitest';
import { designationService } from '$lib/game/services/DesignationService';
import { itemMatchesFilter, resourceMatchesFilter } from '$lib/game/services/jobs/filters';
import type { GameState, WorldTile } from '$lib/game/core/types';

const tile = (walkable = true): WorldTile => ({ walkable, resources: {} }) as unknown as WorldTile;

const world = (row: WorldTile[]): GameState =>
  ({
    turn: 1,
    pawns: [],
    worldMap: [row],
    designations: {},
    zoneTiles: {},
    designationZoneId: {},
    zoneInstances: [],
    droppedItems: [],
    buildings: []
  }) as unknown as GameState;

describe('stockpile zone bookkeeping', () => {
  const painted = () => {
    const gs = designationService.createZoneInstanceWithId(
      'stockpile',
      'Store',
      'z1',
      world([tile(), tile(), tile()])
    );
    return designationService.designateRect(0, 0, 1, 0, 'stockpile', gs, 'z1');
  };

  it('removing a zone clears every tile it painted', () => {
    const gs = painted();
    expect(Object.keys(gs.zoneTiles ?? {}).sort()).toEqual(['0,0', '1,0']);
    const out = designationService.removeZoneInstance('z1', gs);
    expect(out.zoneTiles).toEqual({});
    expect(out.designationZoneId).toEqual({});
    expect(out.zoneInstances).toEqual([]);
  });

  it('clearing a tile removes its zone layer', () => {
    const out = designationService.clearDesignation(0, 0, painted());
    expect(Object.keys(out.zoneTiles ?? {})).toEqual(['1,0']);
    expect(designationService.hasDesignation(0, 0, out)).toBe(false);
  });

  it('will not put a stockpile on an impassable tile', () => {
    const gs = world([tile(false)]);
    expect(designationService.designate(0, 0, 'stockpile', gs)).toBe(gs);
  });

  it('collapses a category list that names every category back to allow-all', () => {
    const gs = designationService.createZoneInstanceWithId(
      'stockpile',
      'Store',
      'z1',
      world([tile()])
    );
    const one = designationService.toggleInstanceCategory('z1', 'metal', ['metal', 'stone'], gs);
    expect(one.zoneInstances![0].filter.allowedCategories).toEqual(['stone']);
    const all = designationService.toggleInstanceCategory('z1', 'metal', ['metal', 'stone'], one);
    expect(all.zoneInstances![0].filter.allowedCategories).toEqual([]);
  });
});

describe('zone filters', () => {
  it('rejects a blocked item even when its category is allowed', () => {
    const filter = { allowedCategories: ['metal'], blockedItems: ['copper_bar'] };
    expect(itemMatchesFilter('copper_bar', filter)).toBe(false);
    expect(itemMatchesFilter('iron_bar', { ...filter, allowedCategories: ['iron'] })).toBe(true);
  });

  it('lets every resource through a filter with no categories chosen', () => {
    const gs = {
      ...world([tile()]),
      zoneFilters: { woodcut: { allowedCategories: [], blockedItems: [] } }
    } as unknown as GameState;
    expect(resourceMatchesFilter('woodcut', 'heartwood_grove', gs)).toBe(true);
  });
});
