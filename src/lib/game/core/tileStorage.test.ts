import { describe, it, expect } from 'vitest';
import {
  BASE_TILE_CAPACITY,
  aggregateFromDrops,
  tileStoredQuantity,
  tileCapacity,
  tileFreeCapacity,
  addToStockpileZone,
  consumeFromStockpiles,
  absorbDropIfOnStockpileTile
} from './GameState';
import type { GameState, DroppedItem, PlacedBuilding } from './types';

/**
 * Stage 2 Step 1 — additive per-tile storage helpers (no behavior change yet).
 * Items physically live as `stored` DroppedItems on tiles; a tile's capacity is
 * BASE + Σ tileCapacityBonus of complete buildings on it.
 */
const drop = (p: Partial<DroppedItem>): DroppedItem =>
  ({ id: 'd', resourceId: 'granite', x: 0, y: 0, quantity: 10, stored: true, ...p }) as DroppedItem;

function state(drops: DroppedItem[], buildings: PlacedBuilding[] = []): GameState {
  return { droppedItems: drops, buildings } as unknown as GameState;
}

describe('per-tile storage helpers (Stage 2 Step 1)', () => {
  it('aggregateFromDrops sums only stored, positive-quantity drops', () => {
    const agg = aggregateFromDrops([
      drop({ resourceId: 'granite', quantity: 5 }),
      drop({ resourceId: 'granite', quantity: 3 }),
      drop({ resourceId: 'branch', quantity: 7 }),
      drop({ resourceId: 'branch', quantity: 4, stored: false }), // loose: excluded
      drop({ resourceId: 'slate', quantity: 0 }) // empty: excluded
    ]);
    expect(agg).toEqual({ granite: 8, branch: 7 });
  });

  it('tileStoredQuantity counts stored items on a specific tile', () => {
    const gs = state([
      drop({ x: 2, y: 2, quantity: 5 }),
      drop({ x: 2, y: 2, resourceId: 'branch', quantity: 4 }),
      drop({ x: 9, y: 9, quantity: 99 }),
      drop({ x: 2, y: 2, quantity: 100, stored: false }) // loose: not counted
    ]);
    expect(tileStoredQuantity(gs, 2, 2)).toBe(9);
  });

  it('tileCapacity = base + storage building bonus on that tile', () => {
    // A real storage building adds tileCapacityBonus; here use an ad-hoc def-less building → base only.
    const gs = state(
      [],
      [
        {
          id: 'b',
          type: 'nonexistent_def',
          x: 1,
          y: 1,
          status: 'complete',
          progress: 1
        } as PlacedBuilding
      ]
    );
    expect(tileCapacity(gs, 1, 1)).toBe(BASE_TILE_CAPACITY);
    expect(tileCapacity(gs, 5, 5)).toBe(BASE_TILE_CAPACITY);
  });

  it('tileFreeCapacity = capacity − stored, floored at 0', () => {
    const gs = state([drop({ x: 0, y: 0, quantity: BASE_TILE_CAPACITY + 50 })]);
    expect(tileFreeCapacity(gs, 0, 0)).toBe(0);
    const gs2 = state([drop({ x: 0, y: 0, quantity: 20 })]);
    expect(tileFreeCapacity(gs2, 0, 0)).toBe(BASE_TILE_CAPACITY - 20);
  });
});

describe('drops-authoritative storage core (Stage 2 flip)', () => {
  const withDesig = (drops: DroppedItem[], desig: Record<string, string> = {}): GameState =>
    ({
      droppedItems: drops,
      buildings: [],
      stockpileZones: [],
      designations: desig
    }) as unknown as GameState;

  it('addToStockpileZone creates a stored drop on the given tile and updates the aggregate', () => {
    const out = addToStockpileZone(withDesig([]), '3,4', { granite: 5 });
    const d = out.droppedItems!.find((x) => x.resourceId === 'granite');
    expect(d).toMatchObject({ x: 3, y: 4, quantity: 5, stored: true });
    expect(out.stockpile['granite']).toBe(5);
  });

  it('addToStockpileZone merges into an existing stored pile at the same tile', () => {
    const gs = withDesig([drop({ id: 's', resourceId: 'branch', x: 1, y: 1, quantity: 4 })]);
    const out = addToStockpileZone(gs, '1,1', { branch: 3 });
    const piles = out.droppedItems!.filter((x) => x.resourceId === 'branch');
    expect(piles).toHaveLength(1);
    expect(piles[0].quantity).toBe(7);
  });

  it('addToStockpileZone with null tile picks a stockpile-designated tile', () => {
    const gs = withDesig([], { '6,6': 'stockpile' });
    const out = addToStockpileZone(gs, null, { plant_fiber: 2 });
    const d = out.droppedItems!.find((x) => x.resourceId === 'plant_fiber');
    expect(d).toMatchObject({ x: 6, y: 6, stored: true, quantity: 2 });
  });

  it('consumeFromStockpiles deducts from stored drops and drops emptied piles', () => {
    const gs = withDesig([drop({ id: 's', resourceId: 'branch', x: 0, y: 0, quantity: 5 })]);
    const out = consumeFromStockpiles(gs, { branch: 5 });
    expect(out.droppedItems!.find((x) => x.resourceId === 'branch')).toBeUndefined();
    expect(out.stockpile['branch'] ?? 0).toBe(0);
  });

  it('absorbDropIfOnStockpileTile marks a loose drop stored when on a stockpile tile', () => {
    const gs = withDesig(
      [drop({ id: 'loose', resourceId: 'branch', x: 2, y: 2, quantity: 3, stored: false })],
      {
        '2,2': 'stockpile'
      }
    );
    const out = absorbDropIfOnStockpileTile(gs, 'loose');
    expect(out.droppedItems!.find((x) => x.id === 'loose')!.stored).toBe(true);
    expect(out.stockpile['branch']).toBe(3);
  });

  it('absorbDropIfOnStockpileTile is a no-op off a stockpile tile', () => {
    const gs = withDesig([
      drop({ id: 'loose', resourceId: 'branch', x: 2, y: 2, quantity: 3, stored: false })
    ]);
    expect(absorbDropIfOnStockpileTile(gs, 'loose')).toBe(gs);
  });
});
