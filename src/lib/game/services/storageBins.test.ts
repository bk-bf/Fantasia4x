import { describe, it, expect } from 'vitest';
import type { GameState, DroppedItem, PlacedBuilding } from '../core/types';
import {
  tilePileCapacity,
  tileStoredPileCount,
  storageTileKeys,
  isStorageTile,
  isFilteredBinTile,
  binFilterAt,
  absorbDropIfOnStockpileTile
} from '../core/GameState';
import { storageTileAcceptsDrop, storageAcceptsDrop } from './jobs/haul';

/**
 * §F storage bins — a building with `effects.storageStacks` is a STANDALONE dense store (its tile
 * accepts hauled goods with no drawn stockpile zone and holds several distinct piles); a `storageFilter`
 * additionally restricts WHAT it takes (categories or explicit item ids). Tests pin both behaviours to
 * the real building defs (wicker_basket general, meat_larder/hay_rack specialized).
 */
const bin = (type: string, x: number, y: number): PlacedBuilding =>
  ({ id: `${type}-${x}-${y}`, type, x, y, status: 'complete', progress: 1 }) as PlacedBuilding;

const stored = (resourceId: string, x: number, y: number, quantity = 1): DroppedItem =>
  ({ id: `${resourceId}-${x}-${y}`, resourceId, x, y, quantity, stored: true }) as DroppedItem;

function state(buildings: PlacedBuilding[], drops: DroppedItem[] = []): GameState {
  return { buildings, droppedItems: drops, zoneTiles: {} } as unknown as GameState;
}

describe('storage bins — capacity', () => {
  it('a wicker basket tile holds 4 distinct piles; a bare tile holds 1', () => {
    const gs = state([bin('wicker_basket', 3, 3)]);
    expect(tilePileCapacity(gs, 3, 3)).toBe(4);
    expect(tilePileCapacity(gs, 9, 9)).toBe(1);
  });

  it('tileStoredPileCount counts distinct stored piles on the tile', () => {
    const gs = state(
      [bin('wicker_basket', 0, 0)],
      [stored('branch', 0, 0), stored('cordage', 0, 0), stored('branch', 5, 5)]
    );
    expect(tileStoredPileCount(gs, 0, 0)).toBe(2);
  });

  it('a bin tile is a storage tile and appears in storageTileKeys with no zone drawn', () => {
    const gs = state([bin('wicker_basket', 2, 4)]);
    expect(storageTileKeys(gs)).toEqual(['2,4']);
    expect(isStorageTile(gs, 2, 4)).toBe(true);
  });

  it('absorbDropIfOnStockpileTile stores a loose drop sitting on a standalone bin tile', () => {
    const gs = state([bin('wicker_basket', 1, 1)], [stored('branch', 1, 1, 3)]);
    // re-mark it loose to exercise the absorb path
    gs.droppedItems![0].stored = false;
    const out = absorbDropIfOnStockpileTile(gs, gs.droppedItems![0].id);
    expect(out.droppedItems!.find((d) => d.id === gs.droppedItems![0].id)!.stored).toBe(true);
  });
});

describe('storage bins — specialized filter', () => {
  it('binFilterAt returns the allow-list for a filtered bin, null for a general one', () => {
    const gs = state([bin('meat_larder', 0, 0), bin('wicker_basket', 1, 1)]);
    expect(binFilterAt(gs, 0, 0)).toContain('meat');
    expect(isFilteredBinTile(gs, 0, 0)).toBe(true);
    expect(binFilterAt(gs, 1, 1)).toBeNull();
    expect(isFilteredBinTile(gs, 1, 1)).toBe(false);
  });

  it('a meat larder accepts meat, rejects grain/stone', () => {
    const gs = state([bin('meat_larder', 0, 0)]);
    expect(storageTileAcceptsDrop(gs, 0, 0, 'goat_meat')).toBe(true); // category meat
    expect(storageTileAcceptsDrop(gs, 0, 0, 'wheat')).toBe(false); // category grain
    expect(storageTileAcceptsDrop(gs, 0, 0, 'granite')).toBe(false); // category stone
  });

  it('a hay rack accepts hay by item id even though hay is categorised "primitive"', () => {
    const gs = state([bin('hay_rack', 0, 0)]);
    expect(storageTileAcceptsDrop(gs, 0, 0, 'hay')).toBe(true);
    expect(storageTileAcceptsDrop(gs, 0, 0, 'goat_meat')).toBe(false);
  });

  it('a general bin (wicker basket) accepts anything', () => {
    const gs = state([bin('wicker_basket', 0, 0)]);
    expect(storageTileAcceptsDrop(gs, 0, 0, 'goat_meat')).toBe(true);
    expect(storageTileAcceptsDrop(gs, 0, 0, 'wheat')).toBe(true);
  });

  it('a per-building override (FILTER fly-out) wins over the static default', () => {
    // A general basket restricted by the player to hay only.
    const basket = bin('wicker_basket', 0, 0);
    (basket as { storageSettings?: { allowedItemIds: string[] } }).storageSettings = {
      allowedItemIds: ['hay']
    };
    const gs = state([basket]);
    expect(storageTileAcceptsDrop(gs, 0, 0, 'hay')).toBe(true);
    expect(storageTileAcceptsDrop(gs, 0, 0, 'goat_meat')).toBe(false);
  });

  it('an empty override means the store takes nothing', () => {
    const larder = bin('meat_larder', 0, 0);
    (larder as { storageSettings?: { allowedItemIds: string[] } }).storageSettings = {
      allowedItemIds: []
    };
    const gs = state([larder]);
    expect(storageTileAcceptsDrop(gs, 0, 0, 'goat_meat')).toBe(false);
  });

  it('storageAcceptsDrop is true only when SOME store admits the resource', () => {
    const meatOnly = state([bin('meat_larder', 0, 0)]);
    expect(storageAcceptsDrop(meatOnly, 'goat_meat')).toBe(true);
    expect(storageAcceptsDrop(meatOnly, 'wheat')).toBe(false); // meat larder won't take grain
    const withGeneral = state([bin('meat_larder', 0, 0), bin('wicker_basket', 1, 1)]);
    expect(storageAcceptsDrop(withGeneral, 'wheat')).toBe(true); // basket takes it
  });
});
