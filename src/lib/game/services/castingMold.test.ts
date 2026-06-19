import { describe, it, expect } from 'vitest';
import { itemService } from './ItemService';
import type { GameState } from '../core/types';

/**
 * §5 casting molds. Smelting/casting at a forge (`moldRequired: clay_mold`) requires a clay mold
 * in stock; each cast wears it, and it cracks after maxDurability/loss = 40/4 = 10 casts.
 */
function state(stock: Record<string, number>, buildings: { type: string }[] = []): GameState {
  const zone = {
    id: 'z',
    name: 'g',
    tiles: [],
    filter: { allowedCategories: [], blockedItems: [] },
    inventory: { ...stock }
  };
  return {
    seed: 1,
    turn: 0,
    pawns: [],
    stockpile: { ...stock },
    stockpileZones: [zone],
    droppedItems: Object.entries(stock).map(([id, q]) => ({
      id: `d-${id}`,
      resourceId: id,
      x: 0,
      y: 0,
      quantity: q,
      stored: true
    })),
    buildings: buildings.map((b, i) => ({
      id: `b${i}`,
      type: b.type,
      x: 0,
      y: 0,
      status: 'complete',
      progress: 1
    })),
    completedResearch: ['copper_smelting'] // smelting is research-gated; isolate the mold variable here
  } as unknown as GameState;
}

describe('§5 casting requires a mold', () => {
  it('copper_bar is NOT craftable at a stone_forge without a clay_mold', () => {
    const gs = state({ malachite: 9 }, [{ type: 'stone_forge' }]);
    expect(itemService.canCraftItem('copper_bar', gs)).toBe(false);
  });

  it('copper_bar IS craftable once a clay_mold is in stock', () => {
    const gs = state({ malachite: 9, clay_mold: 1 }, [{ type: 'stone_forge' }]);
    expect(itemService.canCraftItem('copper_bar', gs)).toBe(true);
  });
});

describe('§5 mold wears and cracks (wearToolById)', () => {
  it('cracks the clay mold after 10 casts (40/4)', () => {
    let gs = state({ clay_mold: 1 });
    for (let i = 0; i < 9; i++) gs = itemService.wearToolById('clay_mold', gs);
    expect(gs.stockpile['clay_mold']).toBe(1); // intact at 36/40
    gs = itemService.wearToolById('clay_mold', gs); // 10th → crack
    expect(gs.stockpile['clay_mold'] ?? 0).toBe(0);
  });
});
