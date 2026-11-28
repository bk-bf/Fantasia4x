import ITEMS_DATABASE from '$lib/game/database/items/items.json';
import { itemService } from '$lib/game/services/ItemService';
import { recipeService } from '$lib/game/services/RecipeService';
import { buildingService } from '$lib/game/services/BuildingService';
import { jobService } from '$lib/game/services/JobService';
import { getMaterialProperty } from '$lib/game/core/defs/materials';
import { WORK_CATEGORIES } from '$lib/game/core/defs/work';
import { categoryPath, labelFor } from '$lib/components/util/itemCategoryTree';
import type { GameState, Item } from '$lib/game/core/types';

export const recipeOf = (itemId: string) => recipeService.getRecipeForItem(itemId);

export const costOf = (itemId: string): Record<string, number> =>
  itemService.calculateCraftingCost(itemId);

export const byproductsOf = (itemId: string): [string, number][] => {
  const r = recipeOf(itemId);
  if (!r) return [];
  return Object.entries(r.outputs).filter(([id]) => id !== itemId);
};

export const primaryQtyOf = (itemId: string): number => recipeOf(itemId)?.outputs[itemId] ?? 1;

export const stationNameOf = (itemId: string): string | null => {
  const stationId = recipeOf(itemId)?.station;
  if (!stationId) return null;
  return buildingService.getBuildingById(stationId)?.name ?? stationId.replace(/_/g, ' ');
};

export function requiredToolOf(
  itemId: string,
  gs: GameState | null
): { name: string; met: boolean } | null {
  const req = recipeService.toolRequirementForRecipe(recipeOf(itemId));
  if (!req) return null;
  const toolIds = WORK_CATEGORIES.find((c) => c.id === req.workType)?.toolsRequired ?? [];
  if (toolIds.length === 0) return null;
  const minTier = req.minTier ?? 1;
  const pick =
    toolIds.find(
      (id) => ((itemService.getItemById(id) as { tier?: number })?.tier ?? 1) >= minTier
    ) ?? toolIds[0];
  const name = itemService.getItemById(pick)?.name ?? pick;
  const met =
    !!gs &&
    (jobService.colonyHasToolFor(gs, req.workType, minTier) ||
      (gs.pawns ?? []).some((p) => jobService.pawnHasToolFor(p, req.workType, minTier)));
  return { name, met };
}

const workName = (id: string): string =>
  WORK_CATEGORIES.find((c) => c.id === id)?.name ?? id.replace(/_/g, ' ');

export function jobLabelOf(item: Item): string {
  if (item.category === 'carcass') return 'Butchery';
  const req = recipeService.toolRequirementForRecipe(recipeOf(item.id));
  if (req?.workType) return workName(req.workType);
  const t = String(item.type ?? '');
  const c = item.category ?? '';
  if (t === 'food' || ['food', 'cooking', 'drink', 'meat'].includes(c)) return 'Cooking';
  return 'General Crafting';
}

export function dishSlotNote(itemId: string, slotKey: string, ingredientId: string): string | null {
  const parts: string[] = [];
  const variant = recipeOf(itemId)?.dynamicRecipe?.[slotKey]?.variants?.[ingredientId];
  const nb = variant?.nutritionBonus;
  if (nb) parts.push(`${nb > 0 ? '+' : ''}${nb} nutrition`);
  const mp = getMaterialProperty(ingredientId);
  if (mp) parts.push(`${mp.label}: ${mp.desc}`);
  return parts.length ? parts.join(' · ') : null;
}

export function craftableItems(
  gs: GameState | null,
  completedResearch: string[],
  population: number
): Item[] {
  if (!gs) return [];
  return (ITEMS_DATABASE as Item[]).filter((item) => {
    if (item.category === 'carcass') return true;
    const recipe = recipeOf(item.id);
    if (!recipe) return false;
    if (
      Object.keys(recipe.inputs ?? {}).some(
        (i) => itemService.getItemById(i)?.category === 'carcass'
      )
    )
      return false;
    if (Object.keys(recipe.outputs ?? {})[0] !== item.id) return false;
    if (
      !gs._devResearchGateOff &&
      recipe.researchRequired &&
      !completedResearch.includes(recipe.researchRequired)
    )
      return false;
    if (recipe.populationRequired && population < recipe.populationRequired) return false;
    return true;
  });
}

export const CRAFT_TAB_ORDER: string[] = [
  labelFor('tools'),
  labelFor('melee'),
  labelFor('ranged'),
  labelFor('ammunition'),
  'Armor',
  labelFor('jewelry'),
  labelFor('meat'),
  labelFor('meals'),
  labelFor('drinks'),
  labelFor('medicine'),
  labelFor('wood'),
  labelFor('stone'),
  labelFor('metals'),
  labelFor('gems'),
  labelFor('textiles'),
  labelFor('organic'),
  labelFor('soil'),
  labelFor('fuel'),
  labelFor('primitive'),
  labelFor('storage'),
  labelFor('light')
];

export function craftCategory(item: Item): string {
  if (item.category === 'jewelry') return 'Jewelry';
  if (String(item.type) === 'armor') return 'Armor';
  const path = categoryPath(item);
  if (path[0] === 'weapons') {
    if (path[1] === 'shields') return 'Armor';
    if (path[1] === 'melee') return labelFor('melee');
    if (path[1] === 'ranged') return labelFor('ranged');
    if (path[1] === 'ammunition') return labelFor('ammunition');
    return labelFor('weapons');
  }
  if (path[0] === 'tools') return labelFor('tools');
  return labelFor(path[path.length - 1]);
}

export type DishSlot = { key: string; label: string; quantity: number; options: Item[] };
export type CraftEntry = {
  key: string;
  item: Item;
  name: string;
  description: string | null;
  category: string;
  selectedIngredients?: Record<string, string>;
  dynamicCost: Record<string, number>;
  slots?: DishSlot[];
};

export function entriesFor(
  item: Item,
  amounts: Record<string, number>,
  sel: Record<string, Record<string, string>>
): CraftEntry[] {
  const cat = craftCategory(item);
  const recipe = recipeOf(item.id);
  const base = {
    key: item.id,
    item,
    name: item.name,
    description: item.description ?? null,
    category: cat,
    dynamicCost: {}
  };
  if (item.category === 'carcass' || !recipe?.dynamicRecipe) return [base];

  const slotEntries = Object.entries(recipe.dynamicRecipe);

  if (slotEntries.length > 1) {
    const slots: DishSlot[] = slotEntries.map(([key, slot]) => {
      const cats = recipeService.slotCategories(slot);
      const seen = new Set<string>();
      const options = cats
        .flatMap((c) => itemService.getItemsByCategory(c))
        .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
        .sort((a, b) => ((amounts[b.id] ?? 0) > 0 ? 1 : 0) - ((amounts[a.id] ?? 0) > 0 ? 1 : 0));
      return { key, label: cats.join('/'), quantity: slot.quantity, options };
    });
    const chosen = sel[item.id] ?? {};
    const allPicked = slotEntries.every(([key]) => chosen[key]);
    const dynamicCost: Record<string, number> = {};
    if (allPicked) {
      for (const [key, slot] of slotEntries) {
        const id = chosen[key];
        dynamicCost[id] = (dynamicCost[id] ?? 0) + slot.quantity;
      }
    }
    const composed = allPicked ? itemService.composeDynamicDishName(item.id, chosen) : undefined;
    return [
      {
        ...base,
        name: composed ?? item.name,
        selectedIngredients: allPicked ? { ...chosen } : undefined,
        dynamicCost,
        slots
      }
    ];
  }

  const [slotKey, slot] = slotEntries[0];
  const cats = recipeService.slotCategories(slot);
  const variantItems = [
    ...new Map(
      cats.flatMap((c) => itemService.getItemsByCategory(c)).map((i) => [i.id, i])
    ).values()
  ];
  const inStock = variantItems.filter((vi) => (amounts[vi.id] ?? 0) >= slot.quantity);
  if (inStock.length === 0) {
    return [
      {
        ...base,
        name: slot.default?.name ?? item.name,
        description: slot.default?.description ?? item.description ?? null
      }
    ];
  }
  return inStock.map((vi) => {
    const v = slot.variants?.[vi.id];
    return {
      ...base,
      key: `${item.id}:${vi.id}`,
      name: v?.name ?? `${slot.default?.name ?? item.name} (${vi.name})`,
      description: v?.description ?? slot.default?.description ?? item.description ?? null,
      selectedIngredients: { [slotKey]: vi.id },
      dynamicCost: { [vi.id]: slot.quantity }
    };
  });
}

type Placed = { id: string; type: string; status?: string };
type Queued = { id: string; stationType?: string | null; stationBuildingId?: string };
export type CraftLane<Q> = { id: string | null; label: string; items: Q[] };

export function craftLanes<Q extends Queued>(queue: Q[], buildings: Placed[]): CraftLane<Q>[] {
  const done = buildings.filter((b) => b.status === 'complete');
  const hostIds = new Set<string>();
  let hasHand = false;
  for (const qi of queue) {
    const need = qi.stationType;
    if (!need) {
      hasHand = true;
      continue;
    }
    const hosts = done.filter((b) => buildingService.stationFulfills(b.type, need));
    if (hosts.length === 0) hasHand = true;
    else for (const b of hosts) hostIds.add(b.id);
  }
  const lanes: CraftLane<Q>[] = [];
  const typesShown = new Set<string>();
  for (const host of buildings.filter((b) => hostIds.has(b.id))) {
    if (typesShown.has(host.type)) continue;
    typesShown.add(host.type);
    const name = buildingService.getBuildingById(host.type)?.name ?? host.type.replace(/_/g, ' ');
    const stations = done.filter((b) => b.type === host.type);
    stations.forEach((b, i) => {
      lanes.push({
        id: b.id,
        label: stations.length > 1 ? `${name} ${i + 1}` : name,
        items: queue.filter((q) => q.stationBuildingId === b.id)
      });
    });
  }
  if (hasHand)
    lanes.push({
      id: null,
      label: 'Hand Crafting',
      items: queue.filter((q) => !done.some((b) => b.id === q.stationBuildingId))
    });
  return lanes;
}
