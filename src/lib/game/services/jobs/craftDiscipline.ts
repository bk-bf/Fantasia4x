import { itemService } from '../ItemService';
import { buildingService } from '../BuildingService';
import { recipeService } from '../RecipeService';
import { disciplineParent, isDiscipline, STATION_MATCHES } from '../../core/defs/disciplines';

function resolveDiscipline(opts: {
  effects: Record<string, number>;
  toolWorkType?: string;
  isFood: boolean;
}): string | undefined {
  if (opts.toolWorkType && isDiscipline(opts.toolWorkType)) return opts.toolWorkType;
  for (const m of STATION_MATCHES) {
    if (m.foodOutput) continue;
    if (m.flags.some((f) => opts.effects[f])) return m.id;
  }
  if (opts.isFood) return STATION_MATCHES.find((m) => m.foodOutput)?.id ?? 'meals';
  return undefined;
}

export function craftDiscipline(
  order: { item: { id: string }; stationType?: string | null; recipeId?: string } | undefined
): string {
  if (!order) return 'crafting';
  const recipe = order.recipeId
    ? recipeService.getRecipeById(order.recipeId)
    : recipeService.getRecipeForItem(order.item.id);
  if (recipe?.discipline && isDiscipline(recipe.discipline)) return recipe.discipline;

  const outCat = itemService.getItemById(order.item.id)?.category;
  const isFood = outCat === 'meal' || outCat === 'food';
  const def = order.stationType ? buildingService.getBuildingById(order.stationType) : undefined;
  return (
    resolveDiscipline({
      effects: (def?.effects ?? {}) as Record<string, number>,
      toolWorkType: def?.toolRequirement?.workType,
      isFood
    }) ?? 'crafting'
  );
}

export function craftWorkCategory(
  order: { item: { id: string }; stationType?: string | null } | undefined
): string {
  return disciplineParent(craftDiscipline(order));
}

export { disciplineParent };
