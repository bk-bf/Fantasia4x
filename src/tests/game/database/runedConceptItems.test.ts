import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.json';
import recipesData from '$lib/game/database/items/recipes.json';
import {
  RUNED_CONCEPT_BRANCH,
  RUNED_CONCEPT_ITEMS,
  waitsOnRunedConstruction
} from './runedConceptItems';

const ITEM_IDS = new Set((itemsData as unknown as { id: string }[]).map((i) => i.id));
const CRAFTABLE = new Set(
  (recipesData as unknown as { outputs?: Record<string, number> }[]).flatMap((r) =>
    Object.keys(r.outputs ?? {})
  )
);

describe(`runed concept items, whose stations live on ${RUNED_CONCEPT_BRANCH}`, () => {
  it('every entry is a real item', () => {
    const unknown = [...RUNED_CONCEPT_ITEMS].filter((id) => !ITEM_IDS.has(id));
    expect(unknown, `not in items.json: ${unknown.join(', ')}`).toEqual([]);
  });

  it('the list has no stale entries', () => {
    const craftable = [...RUNED_CONCEPT_ITEMS].filter((id) => CRAFTABLE.has(id));
    expect(
      craftable,
      `has a recipe again — drop from RUNED_CONCEPT_ITEMS: ${craftable.join(', ')}`
    ).toEqual([]);
  });

  it('an item waits on the runed stations when every recipe for it takes a concept item', () => {
    expect(waitsOnRunedConstruction('gem_dust')).toBe(true);
    expect(waitsOnRunedConstruction('emberbloom_draught')).toBe(true);
    expect(waitsOnRunedConstruction('bronze_torc')).toBe(false);
    expect(waitsOnRunedConstruction('greater_potion_of_might')).toBe(false);
    expect(waitsOnRunedConstruction('not_a_real_item_id')).toBe(false);
  });
});
