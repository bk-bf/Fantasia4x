import { describe, it, expect } from 'vitest';
import { itemService } from './ItemService';
import { recipeService } from './RecipeService';
import type { GameState } from '../core/types';

/**
 * §5 casting molds are single-use raw material. A *casting* recipe (bronze cast at the casting
 * hearth) lists `clay_mold` among its inputs and consumes one per craft — the mold is broken to
 * free the casting. Smelted bars and *forged* iron/steel gear use no mold at all.
 */
const moldInputs = (itemId: string) =>
  Object.keys(recipeService.getRecipeForItem(itemId)?.inputs ?? {});

function state(stock: Record<string, number>): GameState {
  return {
    seed: 1,
    turn: 0,
    pawns: [],
    stockpile: { ...stock },
    droppedItems: Object.entries(stock).map(([id, q]) => ({
      id: `d-${id}`,
      resourceId: id,
      x: 0,
      y: 0,
      quantity: q,
      stored: true
    }))
  } as unknown as GameState;
}

describe('§5 casting consumes a single-use clay mold', () => {
  it('cast metals and cast items list clay_mold as a consumed input', () => {
    // Cast bars (poured into a mold) + shaped bronze casts.
    for (const id of ['copper_bar', 'tin_bar', 'bronze_bar', 'cast_sling_bullet', 'bronze_punch_dagger', 'leaf_blade_spear'])
      expect(moldInputs(id)).toContain('clay_mold');
  });

  it('iron/steel are bloom-forged → NO mold (the age-progression speed-up)', () => {
    for (const id of ['iron_bar', 'steel_bar', 'steel_longsword', 'spatha', 'iron_mace'])
      expect(moldInputs(id)).not.toContain('clay_mold');
  });

  it('one clay lump yields a batch of molds (bulk-cheap)', () => {
    expect(recipeService.getRecipeForItem('clay_mold')?.outputs?.clay_mold).toBe(4);
  });

  it('a casting recipe is unaffordable without a clay mold in stock', () => {
    expect(itemService.hasRequiredMaterials('cast_sling_bullet', state({ copper_bar: 1 }))).toBe(false);
    expect(
      itemService.hasRequiredMaterials('cast_sling_bullet', state({ copper_bar: 1, clay_mold: 1 }))
    ).toBe(true);
  });
});
