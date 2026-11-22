import { describe, it, expect } from 'vitest';
import type { DroppedItem, GameState, Job, PlacedBuilding, ZoneInstance } from '$lib/game/core/types';
import { generate, storageAcceptsDrop, storageTileAcceptsDrop } from '$lib/game/services/jobs/haul';

const vessel = (id: string, x: number, y: number, stored: boolean): DroppedItem =>
  ({
    id,
    resourceId: 'flask',
    x,
    y,
    quantity: 1,
    ...(stored ? { stored: true } : {}),
    instance: { instanceId: `i-${id}`, itemId: 'flask', durability: 10, filter: [] }
  }) as DroppedItem;

const loose = (id: string, resourceId: string, x: number, y: number, urgent = false): DroppedItem =>
  ({ id, resourceId, x, y, quantity: 2, ...(urgent ? { urgent: true } : {}) }) as DroppedItem;

const stored = (id: string, resourceId: string, x: number, y: number): DroppedItem =>
  ({ id, resourceId, x, y, quantity: 2, stored: true }) as DroppedItem;

const zone = (id: string, containerBudget = 0): ZoneInstance =>
  ({
    id,
    type: 'stockpile',
    label: id,
    filter: { allowedCategories: [], blockedItems: [] },
    containerBudget
  }) as ZoneInstance;

function stockpile(
  tiles: Record<string, string>,
  drops: DroppedItem[],
  zones: ZoneInstance[],
  extra: Partial<GameState> = {}
): GameState {
  const zoneTiles: GameState['zoneTiles'] = {};
  const designationZoneId: GameState['designationZoneId'] = {};
  for (const [key, id] of Object.entries(tiles)) {
    zoneTiles[key] = ['stockpile'];
    designationZoneId[key] = { stockpile: id };
  }
  return {
    turn: 5,
    jobs: [],
    buildings: [],
    zoneTiles,
    designationZoneId,
    zoneInstances: zones,
    droppedItems: drops,
    ...extra
  } as unknown as GameState;
}

function square(side: number, id: string): Record<string, string> {
  const tiles: Record<string, string> = {};
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) tiles[`${x},${y}`] = id;
  return tiles;
}

const hauled = (jobs: Job[]) => jobs.filter((j) => j.type === 'haul').map((j) => j.droppedItemId);

describe('haul.generate — stockpile container budget', () => {
  it('a full budget on a large stockpile turns a loose vessel away and still takes other drops', () => {
    const gs = stockpile(
      square(30, 'sp'),
      [vessel('s0', 29, 29, true), vessel('s1', 29, 28, true), vessel('loose', 0, 32, false), loose('logs', 'branch', 1, 32)],
      [zone('sp', 2)]
    );
    expect(hauled(generate([], gs))).toEqual(['logs']);
    expect(storageAcceptsDrop(gs, 'flask')).toBe(false);
    expect(storageTileAcceptsDrop(gs, 3, 3, 'flask')).toBe(false);
  });

  it('a budget with room left takes the loose vessel', () => {
    const gs = stockpile(
      square(10, 'sp'),
      [vessel('s0', 9, 9, true), vessel('s1', 9, 8, true), vessel('loose', 0, 12, false)],
      [zone('sp', 3)]
    );
    expect(hauled(generate([], gs))).toEqual(['loose']);
  });

  it('vessels stored in another stockpile do not count toward this one', () => {
    const tiles = { ...square(4, 'full'), '10,10': 'open', '11,10': 'open' };
    const gs = stockpile(
      tiles,
      [vessel('s0', 0, 0, true), vessel('s1', 1, 0, true), vessel('loose', 20, 20, false)],
      [zone('full', 2), zone('open', 2)]
    );
    expect(storageTileAcceptsDrop(gs, 2, 2, 'flask')).toBe(false);
    expect(storageTileAcceptsDrop(gs, 10, 10, 'flask')).toBe(true);
    expect(hauled(generate([], gs))).toEqual(['loose']);
  });

  it('a vessel on a tile that only keeps a zone id, not a zone tile, does not count', () => {
    const gs = stockpile(
      square(3, 'sp'),
      [vessel('s0', 0, 0, true), vessel('stray', 7, 7, true), vessel('loose', 9, 9, false)],
      [zone('sp', 2)]
    );
    gs.designationZoneId!['7,7'] = { stockpile: 'sp' };
    expect(hauled(generate([], gs))).toEqual(['loose']);
  });
});

describe('haul.generate — room and job upkeep', () => {
  it('a drop waits once the free piles are spoken for, unless it is urgent', () => {
    const gs = stockpile(
      { '0,0': 'sp' },
      [stored('kept', 'branch', 0, 0), loose('a', 'malachite', 5, 5), loose('b', 'malachite', 6, 5), loose('c', 'malachite', 7, 5, true)],
      [zone('sp')]
    );
    const existing: Job = {
      id: 'haul-a',
      type: 'haul',
      targetX: 5,
      targetY: 5,
      droppedItemId: 'a',
      workRequired: 0.02,
      workDone: 0,
      claimedBy: null
    };
    expect(hauled(generate([existing], gs))).toEqual(['a', 'c']);
  });

  it('a storage bin adds its piles to the room the stockpile has', () => {
    const rack = { id: 'rack', type: 'larder_cupboard', x: 0, y: 0, status: 'complete' } as PlacedBuilding;
    const gs = stockpile(
      { '0,0': 'sp' },
      [stored('kept', 'branch', 0, 0), loose('a', 'rabbit_meat', 5, 5), loose('b', 'rabbit_meat', 6, 5)],
      [zone('sp')],
      { buildings: [rack] }
    );
    const existing: Job = {
      id: 'haul-a',
      type: 'haul',
      targetX: 5,
      targetY: 5,
      droppedItemId: 'a',
      workRequired: 0.02,
      workDone: 0,
      claimedBy: null
    };
    expect(hauled(generate([existing], gs))).toEqual(['a', 'b']);
  });

  it('a haul job for a drop that is gone is dropped and the urgent flag follows the drop', () => {
    const gs = stockpile({ '0,0': 'sp' }, [loose('a', 'branch', 5, 5, true)], [zone('sp')]);
    const job = (id: string, droppedItemId: string): Job => ({
      id,
      type: 'haul',
      targetX: 5,
      targetY: 5,
      droppedItemId,
      workRequired: 0.02,
      workDone: 0,
      claimedBy: null
    });
    const out = generate([job('haul-a', 'a'), job('haul-gone', 'gone')], gs);
    expect(out.map((j) => [j.id, j.urgent])).toEqual([['haul-a', true]]);
  });

  it('no loose drop leaves no haul job and keeps every other job', () => {
    const gs = stockpile(square(5, 'sp'), [stored('kept', 'branch', 0, 0)], [zone('sp')]);
    const other: Job = { id: 'build', type: 'construct', targetX: 0, targetY: 0, workRequired: 1, workDone: 0, claimedBy: null };
    const stale: Job = { ...other, id: 'haul-x', type: 'haul', droppedItemId: 'x' };
    expect(generate([other, stale], gs)).toEqual([other]);
  });
});
