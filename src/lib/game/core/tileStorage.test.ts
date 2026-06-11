import { describe, it, expect } from 'vitest';
import {
  BASE_TILE_CAPACITY,
  aggregateFromDrops,
  tileStoredQuantity,
  tileCapacity,
  tileFreeCapacity
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
    // hay_store gives +250 (added later); use an ad-hoc def-less building → base only here.
    const gs = state([], [
      { id: 'b', type: 'nonexistent_def', x: 1, y: 1, status: 'complete', progress: 1 } as PlacedBuilding
    ]);
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
