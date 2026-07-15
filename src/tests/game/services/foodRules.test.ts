import { describe, it, expect } from 'vitest';
import {
  edibleNutrition,
  isCarcass,
  isEdibleFood,
  isDefaultFood,
  getAllFoodIds,
  getDefaultAllowedFoodIds,
  resolveAllowedFoodIds
} from '$lib/game/services/foodRules';

describe('foodRules — colony food filter', () => {
  it('the default eat-list EXCLUDES rotten food and raw carcasses', () => {
    const def = new Set(getDefaultAllowedFoodIds());
    expect(def.has('wild_berries')).toBe(true); // normal food allowed
    expect(def.has('rotten_food')).toBe(false);
    expect(def.has('rotten_meat')).toBe(false);
    expect(def.has('rabbit_carcass')).toBe(false);
    expect(def.has('bear_carcass')).toBe(false);
  });

  it('the FULL list (panel checklist) still includes rotten food + carcasses to opt into', () => {
    const all = new Set(getAllFoodIds());
    expect(all.has('rotten_meat')).toBe(true);
    expect(all.has('rabbit_carcass')).toBe(true);
    expect(all.has('wild_berries')).toBe(true);
  });

  it('a raw carcass is edible (nutrition derived from body mass), normal food uses its own nutrition', () => {
    expect(isCarcass({ id: 'rabbit_carcass' })).toBe(true);
    expect(isCarcass({ id: 'wild_berries' })).toBe(false);
    // rabbit_carcass: weight 1.5kg × 2 = 3; bear_carcass: 60 × 2 = 120
    expect(edibleNutrition({ id: 'rabbit_carcass', weightKg: 1.5 })).toBe(3);
    expect(edibleNutrition({ id: 'bear_carcass', weightKg: 60 })).toBe(120);
    // explicit nutrition wins over the carcass derivation / default
    expect(edibleNutrition({ id: 'wild_berries', nutrition: 3 })).toBe(3);
    expect(edibleNutrition({ id: 'x', nutrition: 0 })).toBe(0);
    expect(isEdibleFood({ id: 'rabbit_carcass', category: 'food' } as never)).toBe(true);
  });

  it('rotten food + carcasses are edible but NOT default-allowed', () => {
    expect(isDefaultFood({ id: 'rotten_meat', category: 'food', nutrition: 8 } as never)).toBe(false);
    expect(isDefaultFood({ id: 'rabbit_carcass', category: 'food' } as never)).toBe(false);
    expect(isDefaultFood({ id: 'wild_berries', category: 'food', nutrition: 3 } as never)).toBe(true);
  });

  it('resolve honours an explicit list (even empty = eat nothing); undefined falls back to default', () => {
    expect(resolveAllowedFoodIds({ allowedFoodItemIds: ['wild_berries'] })).toEqual(
      new Set(['wild_berries'])
    );
    expect(resolveAllowedFoodIds({ allowedFoodItemIds: [] }).size).toBe(0); // "eat nothing"
    expect(resolveAllowedFoodIds(undefined)).toEqual(new Set(getDefaultAllowedFoodIds()));
  });
});
