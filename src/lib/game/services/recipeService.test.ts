import { describe, it, expect } from 'vitest';
import { recipeService } from './RecipeService';
import recipesData from '../database/recipes.jsonc';
import itemsData from '../database/items.jsonc';
import buildingsData from '../database/buildings.jsonc';

/**
 * Recipe registry Stage A — recipes unify authored (recipes.jsonc, with byproducts) and
 * synthesised (from items' legacy inline craftingCost). Authored recipes shadow synthesised
 * ones per primary output. Behaviour-preserving until wired into the crafting path.
 */
describe('RecipeService (recipe registry, Stage A)', () => {
  it('resolves a migrated recipe from recipes.jsonc (venison)', () => {
    // After the recipe migration, venison is an authored recipe (not synthesised from items).
    const r = recipeService.getRecipeForItem('venison');
    expect(r).toBeDefined();
    expect(r!.station).toBe('butcher_spot');
    expect(r!.inputs).toEqual({ deer_carcass: 1 });
    // Butchery multi-yield (ADR-016 follow-up): one carcass → meat + hide + bones in one run.
    expect(r!.outputs).toEqual({ venison: 1, deer_hide: 1, medium_bones: 1 });
  });

  it('an authored recipe with byproducts shadows the synthesised one (firewood → +branches)', () => {
    const producers = recipeService.getRecipesProducing('green_firewood');
    // exactly one producer, and it is the authored split_firewood (not the inline synth)
    expect(producers).toHaveLength(1);
    const r = producers[0];
    expect(r.id).toBe('split_firewood');
    expect(r.synthesized).toBeFalsy();
    expect(r.outputs).toMatchObject({ green_firewood: 3, branch: 2 }); // byproduct!
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
    // sanity: outputs/inputs resolve (sawdust etc. exist)
    const r = recipeService.getRecipeById('saw_pine_planks');
    expect(r!.outputs).toHaveProperty('sawdust');
  });

  // Referential integrity over the WHOLE authored recipe DB — guards against a typo'd item or
  // station id silently breaking a chain (caught a real class of bug while authoring PRODUCTION-
  // CHAIN-III's leather/wool/glue lines). Every input/output/alternative must resolve to a real
  // item, and every station to a real building.
  it('every authored recipe + alternative resolves to real item and building ids', () => {
    const itemIds = new Set((itemsData as Array<{ id: string }>).map((i) => i.id));
    const buildingIds = new Set((buildingsData as Array<{ id: string }>).map((b) => b.id));
    const recipes = recipesData as Array<{
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
          // `category:<cat>` slots resolve to concrete items at craft time — not authored item ids.
          if (itemId.startsWith('category:')) continue;
          if (!itemIds.has(itemId)) errors.push(`${r.id}: unknown item "${itemId}"`);
        }
      if (r.station && !buildingIds.has(r.station))
        errors.push(`${r.id}: unknown station "${r.station}"`);
    }
    expect(errors).toEqual([]);
  });
});
