import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.json';
import recipesData from '$lib/game/database/items/recipes.json';
import {
  ingredientsOf,
  hasRecipe,
  usesBossPart,
  chainAgeOf,
  blameStation,
  BOSS_PARTS
} from '$lib/dev/chainAge';

const items = itemsData as any[];
const recipes = recipesData as any[];

describe('ingredientsOf', () => {
  it('includes both the plain `inputs` keys and one `category:<acceptsCategory>` key per dynamicRecipe slot', () => {
    const r = recipes.find((x) => x.id === 'make_rawhide_round_shield');
    expect(r).toBeDefined();
    expect(ingredientsOf(r)).toEqual(['category:binding', 'category:wood', 'category:cured_hide']);
  });

  it('returns only the plain inputs when there is no dynamicRecipe', () => {
    const r = recipes.find((x) => x.id === 'make_bronze_torc');
    expect(r).toBeDefined();
    expect(ingredientsOf(r)).toEqual(['molten_bronze', 'clay_mold']);
  });
});

describe('hasRecipe', () => {
  it('is true exactly for an id that is a recipe output', () => {
    expect(hasRecipe('bronze_torc')).toBe(true);
  });

  it('is false for an id with no recipe, real or invented', () => {
    expect(hasRecipe('water')).toBe(false);
    expect(hasRecipe('not_a_real_item_id')).toBe(false);
  });
});

describe('usesBossPart', () => {
  it('is true for an item whose recipe takes a boss part as a direct ingredient', () => {
    expect(usesBossPart('great_bone_cuirass')).toBe(true);
  });

  it('is false for an item whose chain never touches a boss part', () => {
    expect(usesBossPart('bronze_torc')).toBe(false);
  });

  it('BOSS_PARTS names the exact set the function checks against', () => {
    for (const id of BOSS_PARTS) expect(usesBossPart(id)).toBe(true);
  });
});

describe('chainAgeOf', () => {
  it('returns the correct fixpoint age for a known multi-step chain', () => {
    expect(chainAgeOf('steel_axe')).toBe(3);
  });

  it('returns 0 for an id absent from the chain, including an unknown id', () => {
    expect(chainAgeOf('water')).toBe(0);
    expect(chainAgeOf('not_a_real_item_id')).toBe(0);
  });

  it('stays within the documented 0..5 bound for every real item', () => {
    for (const i of items) {
      const age = chainAgeOf(i.id);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(5);
    }
  });
});

describe('blameStation', () => {
  it('names the station whose age matches the item\'s chain age', () => {
    expect(blameStation('steel_axe')).toBe('anvil');
  });

  it('returns the empty string for an id with no recipe', () => {
    expect(blameStation('water')).toBe('');
    expect(blameStation('not_a_real_item_id')).toBe('');
  });
});
