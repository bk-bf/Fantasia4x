import type { Item, Recipe } from '../core/types';
import itemsData from '../database/items.jsonc';
import recipesData from '../database/recipes.jsonc';

const ITEMS_DATABASE = itemsData as unknown as Item[];
const AUTHORED_RECIPES = recipesData as unknown as Recipe[];

/**
 * RecipeService — the single source of truth for "how is X made" (PRODUCTION-CHAIN-EXPANSION
 * recipe-registry refactor). Recipes are first-class: items are pure materials.
 *
 * Two sources, unified behind one accessor:
 *   1. Authored recipes in recipes.jsonc — can express byproducts (multiple outputs) and
 *      multiple recipes per product.
 *   2. Synthesised recipes from an item's legacy inline craftingCost/workshopType fields, so
 *      the ~97 not-yet-migrated recipes keep working. An authored recipe for an output
 *      SHADOWS the synthesised one (migration is therefore safe and gradual).
 *
 * Build-time only (static DBs) → indexes are computed once at module load.
 */
export interface RecipeService {
  /** All recipes (authored + synthesised), authored shadowing synthesised per primary output. */
  getAllRecipes(): Recipe[];
  getRecipeById(id: string): Recipe | undefined;
  /** Recipes whose `outputs` include `itemId` (what makes X). */
  getRecipesProducing(itemId: string): Recipe[];
  /** Recipes whose `inputs`/alternatives include `itemId` (what uses X). */
  getRecipesUsing(itemId: string): Recipe[];
  /** The canonical recipe used to craft `itemId` (first producer; authored beats synthesised). */
  getRecipeForItem(itemId: string): Recipe | undefined;
}

/** Synthesise a Recipe from an item that carries legacy inline crafting fields. */
function synthesizeFromItem(item: Item): Recipe | null {
  const hasCost = item.craftingCost && Object.keys(item.craftingCost).length > 0;
  // An item with a workshop + dynamicRecipe (e.g. spit_meat) or a craftingCost is craftable.
  if (!hasCost && !item.dynamicRecipe) return null;
  return {
    id: `make_${item.id}`,
    station: item.workshopType ?? null,
    inputs: { ...(item.craftingCost ?? {}) },
    inputAlternatives: item.craftingCostAlternatives
      ? item.craftingCostAlternatives.map((s) => ({ ...s }))
      : undefined,
    outputs: { [item.id]: 1 },
    workAmount: item.craftingTime ?? 1,
    toolTierRequired: item.toolTierRequired,
    researchRequired: item.researchRequired ?? null,
    populationRequired: item.populationRequired,
    buildingRequired: item.buildingRequired ?? null,
    dynamicRecipe: item.dynamicRecipe,
    synthesized: true
  };
}

export class RecipeServiceImpl implements RecipeService {
  private all: Recipe[];
  private byId = new Map<string, Recipe>();
  private producedBy = new Map<string, Recipe[]>();
  private usedIn = new Map<string, Recipe[]>();

  constructor() {
    // Outputs claimed by an authored recipe: their synthesised inline recipe is shadowed.
    const authoredOutputs = new Set<string>();
    for (const r of AUTHORED_RECIPES) {
      for (const out of Object.keys(r.outputs ?? {})) authoredOutputs.add(out);
    }

    const synthesised: Recipe[] = [];
    for (const item of ITEMS_DATABASE) {
      if (authoredOutputs.has(item.id)) continue; // authored recipe wins for this output
      const r = synthesizeFromItem(item);
      if (r) synthesised.push(r);
    }

    this.all = [...AUTHORED_RECIPES, ...synthesised];
    for (const r of this.all) {
      this.byId.set(r.id, r);
      for (const out of Object.keys(r.outputs ?? {})) {
        (this.producedBy.get(out) ?? this.producedBy.set(out, []).get(out)!).push(r);
      }
      const inputItems = new Set<string>();
      for (const k of Object.keys(r.inputs ?? {})) inputItems.add(k);
      for (const alt of r.inputAlternatives ?? []) {
        for (const k of Object.keys(alt)) inputItems.add(k);
      }
      for (const k of inputItems) {
        (this.usedIn.get(k) ?? this.usedIn.set(k, []).get(k)!).push(r);
      }
    }
  }

  getAllRecipes(): Recipe[] {
    return this.all;
  }
  getRecipeById(id: string): Recipe | undefined {
    return this.byId.get(id);
  }
  getRecipesProducing(itemId: string): Recipe[] {
    return this.producedBy.get(itemId) ?? [];
  }
  getRecipesUsing(itemId: string): Recipe[] {
    return this.usedIn.get(itemId) ?? [];
  }
  getRecipeForItem(itemId: string): Recipe | undefined {
    return this.producedBy.get(itemId)?.[0];
  }
}

export const recipeService = new RecipeServiceImpl();
