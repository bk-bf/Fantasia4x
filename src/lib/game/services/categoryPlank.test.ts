import { describe, it, expect } from 'vitest';
import { itemService, itemMatchesCostCategory } from './ItemService';
import type { GameState } from '../core/types';

/**
 * `category:plank` dynamic cost slot — a building cost or recipe input can ask for "any plank" instead
 * of hardcoding pine_plank. The pseudo-category matches every sawn plank (mundane + magic-wood); the
 * cost resolver expands it to concrete planks from stock.
 */
describe('category:plank dynamic slot', () => {
  it('itemMatchesCostCategory: `plank` matches any *_plank, not raw logs or other wood', () => {
    for (const id of ['pine_plank', 'oak_plank', 'heartwood_plank', 'emberwood_plank'])
      expect(itemMatchesCostCategory({ id, category: 'wood' }, 'plank')).toBe(true);
    expect(itemMatchesCostCategory({ id: 'pine_log', category: 'wood' }, 'plank')).toBe(false);
    expect(itemMatchesCostCategory({ id: 'beam', category: 'wood' }, 'plank')).toBe(false);
    // real categories still match by item.category
    expect(itemMatchesCostCategory({ id: 'granite', category: 'stone' }, 'stone')).toBe(true);
  });

  it('`log` matches any *_log; `block` resolves natively via item.category', () => {
    for (const id of ['pine_log', 'oak_log', 'heartwood_log'])
      expect(itemMatchesCostCategory({ id, category: 'wood' }, 'log')).toBe(true);
    expect(itemMatchesCostCategory({ id: 'pine_plank', category: 'wood' }, 'log')).toBe(false);
    // blocks already carry category "block" — no pseudo-slot needed
    expect(itemMatchesCostCategory({ id: 'granite_block', category: 'block' }, 'block')).toBe(true);
    expect(itemMatchesCostCategory({ id: 'marble_block', category: 'block' }, 'block')).toBe(true);
  });

  it('expandCategoryCostLoose maps category:plank → a representative concrete plank', () => {
    const out = itemService.expandCategoryCostLoose({ 'category:plank': 4, iron_nail: 2 });
    const keys = Object.keys(out);
    expect(keys).toContain('iron_nail');
    const plankKey = keys.find((k) => k.endsWith('_plank'));
    expect(plankKey, 'expected a concrete *_plank key').toBeTruthy();
    expect(out[plankKey!]).toBe(4);
    expect(keys.some((k) => k.startsWith('category:'))).toBe(false);
  });

  it('expandCategoryCost pays a category:plank slot from whatever plank is in stock', () => {
    // Stock = 6 oak_plank (no pine). A category:plank:4 slot must resolve to oak_plank.
    const gs = {
      droppedItems: [{ id: 'd1', resourceId: 'oak_plank', x: 0, y: 0, quantity: 6, stored: true }],
      stockpile: { oak_plank: 6 }
    } as unknown as GameState;
    const out = itemService.expandCategoryCost({ 'category:plank': 4 }, gs);
    expect(out).toEqual({ oak_plank: 4 });
  });

  it('expandCategoryCost returns null when no plank is in stock', () => {
    const gs = { droppedItems: [], stockpile: {} } as unknown as GameState;
    expect(itemService.expandCategoryCost({ 'category:plank': 1 }, gs)).toBeNull();
  });
});
