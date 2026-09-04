import { describe, it, expect } from 'vitest';
import { recipeService } from '$lib/game/services/RecipeService';
import recipesData from '$lib/game/database/items/recipes.json';
import itemsData from '$lib/game/database/items/items.json';
import buildingsData from '$lib/game/database/world/buildings.json';

describe('RecipeService (recipe registry, Stage A)', () => {
  it('resolves a migrated recipe from recipes.json (venison)', () => {
    const r = recipeService.getRecipeForItem('venison');
    expect(r).toBeDefined();
    expect(r!.station).toBe('butcher_spot');
    expect(r!.inputs).toEqual({ deer_carcass: 1 });
    expect(r!.outputs).toEqual({
      venison: 10,
      deer_hide: 3,
      medium_bones: 12,
      raw_sinew: 9,
      antler_rack: 1
    });
  });

  it('an authored recipe with byproducts shadows the synthesised one (firewood → +branches)', () => {
    const producers = recipeService.getRecipesProducing('green_firewood');
    expect(producers).toHaveLength(1);
    const r = producers[0];
    expect(r.id).toBe('split_firewood');
    expect(r.synthesized).toBeFalsy();
    expect(r.outputs).toMatchObject({ green_firewood: 6, branch: 2 });
  });

  it('reverse lookup: what uses pine_log includes the byproduct recipes', () => {
    const ids = recipeService.getRecipesUsing('pine_log').map((r) => r.id);
    expect(ids).toContain('split_firewood');
    expect(ids).toContain('saw_pine_planks');
    expect(ids).toContain('burn_charcoal');
  });

  it('charcoal recipe emits ash as a byproduct', () => {
    const r = recipeService.getRecipeById('burn_charcoal');
    expect(r!.outputs).toMatchObject({ charcoal: 2, ash: 1 });
  });

  it('every authored recipe references real item ids for inputs and outputs', () => {
    const r = recipeService.getRecipeById('saw_pine_planks');
    expect(r!.outputs).toHaveProperty('sawdust');
  });

  it('every authored recipe + alternative resolves to real item and building ids', () => {
    const itemIds = new Set((itemsData as Array<{ id: string }>).map((i) => i.id));
    const buildingIds = new Set((buildingsData as unknown as Array<{ id: string }>).map((b) => b.id));
    const recipes = recipesData as unknown as Array<{
      id: string;
      station?: string;
      inputs?: Record<string, number>;
      outputs?: Record<string, number>;
      inputAlternatives?: Array<Record<string, number>>;
    }>;
    const errors: string[] = [];
    for (const r of recipes) {
      const ingredientSets = [r.inputs, r.outputs, ...(r.inputAlternatives ?? [])].filter(
        Boolean
      ) as Array<Record<string, number>>;
      for (const set of ingredientSets)
        for (const itemId of Object.keys(set)) {
          if (itemId.startsWith('category:')) continue;
          if (!itemIds.has(itemId)) errors.push(`${r.id}: unknown item "${itemId}"`);
        }
      if (r.station && !buildingIds.has(r.station))
        errors.push(`${r.id}: unknown station "${r.station}"`);
    }
    expect(errors).toEqual([]);
  });
});
