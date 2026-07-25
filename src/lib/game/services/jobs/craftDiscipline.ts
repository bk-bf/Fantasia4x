// Crafting-discipline resolution — the SINGLE source shared by JobService (labor category routing:
// priority/speed) and jobs/craft.ts (the quality roll) so the two can't drift. Lives in a leaf
// module so both can import it without a JobService ↔ jobs/craft dependency cycle. The discipline
// TREE (parents ↔ leaves, station matchers) is authored in jobs.jsonc and parsed by disciplineTree.ts;
// this module just turns a craft order into its (leaf, parent-category) pair.
import { itemService } from '../ItemService';
import { buildingService } from '../BuildingService';
import { disciplineParent, resolveDiscipline } from './disciplineTree';

/** A craft order's LEAF discipline (leatherworking / butchery / lapidary / metalworking…), or the
 *  generic `crafting` when its station carries no discipline. A prepared meal always resolves to the
 *  `meals` leaf regardless of station. Drives the `*_speed`/`_quality`/`_yield` stat lookup + traits. */
export function craftDiscipline(
  order: { item: { id: string }; stationType?: string | null } | undefined
): string {
  if (!order) return 'crafting';
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

/**
 * The crafting DISCIPLINE labor CATEGORY (Work-tab parent) for a craft order: the parent of its leaf
 * discipline — a tannery order → tailoring, a butcher spot → cooking, an anvil → metalworking, a
 * generic bench → crafting. Labor priority + XP key on this; the leaf (`craftDiscipline`) is the
 * within-parent subjob for stats/quality.
 */
export function craftWorkCategory(
  order: { item: { id: string }; stationType?: string | null } | undefined
): string {
  return disciplineParent(craftDiscipline(order));
}

export { disciplineParent };
