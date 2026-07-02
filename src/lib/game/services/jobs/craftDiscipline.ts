// Crafting-discipline resolution — the SINGLE source shared by JobService (labor category routing:
// priority/speed) and jobs/craft.ts (the quality roll) so the two can't drift. Lives in a leaf
// module so both can import it without a JobService ↔ jobs/craft dependency cycle.
import { itemService } from '../ItemService';
import { buildingService } from '../BuildingService';

// Crafting DISCIPLINES — the work categories a `craft` job can route to (instead of the generic
// `crafting`), based on its station. Each has its own `*_speed`/`_quality` stats + tools + racial
// traits, so a smith ≠ tanner ≠ brewer ≠ butcher ≠ generalist. Cooking is included (a prepared meal
// always routes here regardless of station). Guards `toolRequirement.workType` routing.
export const CRAFT_DISCIPLINES = new Set([
  'metalworking',
  'leatherworking',
  'butchery',
  'alchemy',
  'cooking'
]);

/** A station building's crafting discipline (or undefined for a generic crafting station). */
function stationDiscipline(stationType: string): string | undefined {
  const def = buildingService.getBuildingById(stationType);
  if (!def) return undefined;
  const tw = def.toolRequirement?.workType;
  if (tw && CRAFT_DISCIPLINES.has(tw)) return tw;
  const e = (def.effects ?? {}) as Record<string, number>;
  if (e.smithingEnabled || e.smeltingEnabled) return 'metalworking';
  if (e.leatherworkingEnabled) return 'leatherworking';
  if (e.butcheringEnabled) return 'butchery';
  if (e.alchemyEnabled || e.arcane) return 'alchemy';
  if (e.cooking) return 'cooking';
  return undefined;
}

/**
 * The crafting DISCIPLINE work-category for a craft order: a prepared meal/food → cooking; else the
 * station's discipline (its `toolRequirement.workType` if it's a known discipline, else its
 * capability flag — smithing/smelting→metalworking, leatherworking, butchering, arcane→alchemy,
 * cooking); else generic `crafting`.
 */
export function craftWorkCategory(
  order: { item: { id: string }; stationType?: string | null } | undefined
): string {
  if (!order) return 'crafting';
  const outCat = itemService.getItemById(order.item.id)?.category;
  if (outCat === 'meal' || outCat === 'food') return 'cooking';
  return (order.stationType ? stationDiscipline(order.stationType) : undefined) ?? 'crafting';
}
