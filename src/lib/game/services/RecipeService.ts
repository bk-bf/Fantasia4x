import type { Item, Recipe, Building } from '../core/types';
import itemsData from '../database/items/items.jsonc';
import recipesData from '../database/items/recipes.jsonc';
import buildingsData from '../database/world/buildings.jsonc';

const ITEMS_DATABASE = itemsData as unknown as Item[];

// `category:<cat>` slot match (local copy of ItemService.itemMatchesCostCategory to avoid a
// RecipeService↔ItemService import cycle): `plank`/`log` match any *_plank / *_log; else item.category.
function recipeItemMatchesCategory(item: { id: string; category?: string }, cat: string): boolean {
  if (cat === 'plank') return item.id.endsWith('_plank');
  if (cat === 'log') return item.id.endsWith('_log');
  return item.category === cat;
}
const AUTHORED_RECIPES = recipesData as unknown as Recipe[];

/** ADR-009 step 2: station id → its craft-tool requirement (data-driven, mirrors resources.jsonc).
 *  Imported as raw data (not buildingService) to keep RecipeService free of service cycles. */
const STATION_TOOL_REQ = new Map<string, { workType: string; minTier: number }>(
  (buildingsData as unknown as Building[])
    .filter((b) => b.toolRequirement)
    .map((b) => [b.id, b.toolRequirement as { workType: string; minTier: number }])
);

/**
 * ADR-016 passive furnaces: a station whose building def carries `passive: true` transforms
 * loaded inputs over time without a pawn working it (gated by fuel/heat). Data-driven — set the
 * flag on the building in buildings.jsonc, not in a hardcoded list here. A mixed/active station
 * (stone_forge, casting_hearth) is NOT flagged; its individual passive recipes opt in via
 * `Recipe.passive` so its pawn-worked recipes (shaping/casting) stay active.
 */
const PASSIVE_STATIONS = new Set(
  (buildingsData as unknown as Building[]).filter((b) => b.passive).map((b) => b.id)
);

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
  /**
   * ADR-016: is this recipe produced passively (loaded furnace transforms it over time, no pawn
   * working it)? `recipe.passive` wins; otherwise derived from the station being a known furnace.
   */
  isPassive(recipe: Recipe | undefined): boolean;
  /** ADR-016: is `stationType` a passive furnace (bloomery/kiln/charcoal pit, …)? */
  isPassiveStation(stationType: string | null | undefined): boolean;
  /** ADR-009 step 2 — the craft-tool requirement for a recipe: the per-recipe `toolRequirement`
   *  override if present, else the recipe's station's `toolRequirement`. null = no tool needed. */
  toolRequirementForRecipe(
    recipe: Recipe | undefined
  ): { workType: string; minTier: number } | null;
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
        // A `category:<cat>` slot (e.g. category:log) is "used by" every concrete item that satisfies
        // it — index it under each so getRecipesUsing('pine_log') still finds the dynamic recipe.
        if (k.startsWith('category:')) {
          const cat = k.slice('category:'.length);
          for (const it of ITEMS_DATABASE) {
            if (!recipeItemMatchesCategory(it, cat)) continue;
            const arr = this.usedIn.get(it.id) ?? this.usedIn.set(it.id, []).get(it.id)!;
            if (!arr.includes(r)) arr.push(r);
          }
        }
      }
      // A `dynamicRecipe` slot (e.g. the firewood log slot accepting any `log`) is likewise "used by"
      // every concrete item that fills it — index each so getRecipesUsing('pine_log') finds it too.
      for (const slot of Object.values(r.dynamicRecipe ?? {})) {
        for (const cat of this.slotCategories(slot)) {
          for (const it of ITEMS_DATABASE) {
            if (!recipeItemMatchesCategory(it, cat)) continue;
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

  /** The categories a dynamic slot accepts — unifies the `acceptsCategories[]` (mixed) and the
   *  `acceptsCategory` single-category shorthand so callers never branch on which was authored. */
  slotCategories(slot: { acceptsCategory?: string; acceptsCategories?: string[] }): string[] {
    return slot.acceptsCategories ?? (slot.acceptsCategory ? [slot.acceptsCategory] : []);
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
