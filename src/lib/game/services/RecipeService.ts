import type { Item, Recipe, Building } from '../core/types';
import itemsData from '../database/items/items.jsonc';
import recipesData from '../database/items/recipes.jsonc';
import buildingsData from '../database/world/buildings.jsonc';

const ITEMS_DATABASE = itemsData as unknown as Item[];

export function recipeItemMatchesCategory(
  item: { id: string; category?: string; type?: string },
  cat: string
): boolean {
  if (cat === 'plank') return item.id.endsWith('_plank');
  if (cat === 'log') return item.id.endsWith('_log');
  if (cat === 'fastener')
    return /_nail$|_rivet$|_tack$/.test(item.id) && item.type !== 'weapon' && item.type !== 'tool';
  if (cat === 'broth') return /_stock$/.test(item.id);
  if (cat === 'thread')
    return item.category === 'binding' && !/^cordage$|^rope$|_rope$|_cordage$/.test(item.id);
  if (item.type === 'armor' || item.type === 'weapon' || item.type === 'tool') return false;
  return item.category === cat;
}
const AUTHORED_RECIPES = recipesData as unknown as Recipe[];

const STATION_TOOL_REQ = new Map<string, { workType: string; minTier: number }>(
  (buildingsData as unknown as Building[])
    .filter((b) => b.toolRequirement)
    .map((b) => [b.id, b.toolRequirement as { workType: string; minTier: number }])
);

const PASSIVE_STATIONS = new Set(
  (buildingsData as unknown as Building[]).filter((b) => b.passive).map((b) => b.id)
);

export interface RecipeService {
  getAllRecipes(): Recipe[];
  getRecipeById(id: string): Recipe | undefined;
  getRecipesProducing(itemId: string): Recipe[];
  getRecipesUsing(itemId: string): Recipe[];
  getRecipeForItem(itemId: string): Recipe | undefined;
  isPassive(recipe: Recipe | undefined): boolean;
  isPassiveStation(stationType: string | null | undefined): boolean;
  toolRequirementForRecipe(
    recipe: Recipe | undefined
  ): { workType: string; minTier: number } | null;
}

function synthesizeFromItem(item: Item): Recipe | null {
  const hasCost = item.craftingCost && Object.keys(item.craftingCost).length > 0;
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
    researchRequired: null,
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
    const authoredOutputs = new Set<string>();
    for (const r of AUTHORED_RECIPES) {
      for (const out of Object.keys(r.outputs ?? {})) authoredOutputs.add(out);
    }

    const synthesised: Recipe[] = [];
    for (const item of ITEMS_DATABASE) {
      if (authoredOutputs.has(item.id)) continue;
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
        if (k.startsWith('category:')) {
          const cat = k.slice('category:'.length);
          for (const it of ITEMS_DATABASE) {
            if (!recipeItemMatchesCategory(it, cat)) continue;
            const arr = this.usedIn.get(it.id) ?? this.usedIn.set(it.id, []).get(it.id)!;
            if (!arr.includes(r)) arr.push(r);
          }
        }
      }
      for (const slot of Object.values(r.dynamicRecipe ?? {})) {
        for (const cat of this.slotCategories(slot)) {
          for (const it of ITEMS_DATABASE) {
            if (!recipeItemMatchesCategory(it, cat)) continue;
            if (!this.slotAccepts(slot, it)) continue;
            const arr = this.usedIn.get(it.id) ?? this.usedIn.set(it.id, []).get(it.id)!;
            if (!arr.includes(r)) arr.push(r);
          }
        }
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

  slotCategories(slot: { acceptsCategory?: string; acceptsCategories?: string[] }): string[] {
    return slot.acceptsCategories ?? (slot.acceptsCategory ? [slot.acceptsCategory] : []);
  }

  slotAccepts(
    slot: {
      acceptsCategory?: string;
      acceptsCategories?: string[];
      excludes?: string[];
    },
    item: { id: string; category?: string; type?: string }
  ): boolean {
    if (!this.slotCategories(slot).some((c) => recipeItemMatchesCategory(item, c))) return false;
    const ex = slot.excludes;
    if (!ex?.length) return true;
    return !ex.some((x) => x === item.id || x === item.category);
  }

  isPassive(recipe: Recipe | undefined): boolean {
    if (!recipe) return false;
    return recipe.passive ?? this.isPassiveStation(recipe.station);
  }

  isPassiveStation(stationType: string | null | undefined): boolean {
    return stationType ? PASSIVE_STATIONS.has(stationType) : false;
  }

  toolRequirementForRecipe(
    recipe: Recipe | undefined
  ): { workType: string; minTier: number } | null {
    if (!recipe) return null;
    if (recipe.toolRequirement) return recipe.toolRequirement;
    return (recipe.station && STATION_TOOL_REQ.get(recipe.station)) || null;
  }
}

export const recipeService = new RecipeServiceImpl();
