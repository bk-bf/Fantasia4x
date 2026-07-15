// Food rules — what the colony's pawns may eat, and how much hunger an item restores. Mirrors fuelRules
// (free functions for a colony-wide policy, not a service). The food filter panel writes
// `gs.foodSettings.allowedFoodItemIds`; the meal selector (pawnQueries.selectFoodForMeal) resolves the
// effective eat-list through here, and the per-item nutrition (incl. raw carcasses) comes from here too.
import type { Item, FoodSettings } from '../core/types';
import itemsData from '../database/items/items.jsonc';

const ITEMS_DB = itemsData as unknown as Item[];

/** Eating a carcass RAW (unbutchered) is crude and wasteful — its hunger value is derived from body mass
 *  here; butchering then cooking the meat yields far more. Tuned low so raw carcass-eating is a fallback. */
const CARCASS_NUTRITION_PER_KG = 2;

/** True for a whole-animal carcass item (edible raw as a last resort; normally butchered into meat).
 *  `rotten_carcass` (decomposed → fertiliser) and `pawn_carcass` (a dead colonist — no cannibalism) are
 *  carcass-shaped ids that are NOT food, so they're excluded from the raw-eat derivation. */
export function isCarcass(item: { id?: string }): boolean {
  return (
    !!item.id &&
    item.id.endsWith('_carcass') &&
    item.id !== 'rotten_carcass' &&
    item.id !== 'pawn_carcass'
  );
}

/** Hunger one UNIT of an item restores. Carcasses carry no explicit `nutrition` (they're meant to be
 *  butchered), so eating one raw derives a body-mass value here — the SINGLE source the meal selector,
 *  the consume step and the poison roll all read, so they can't drift. */
export function edibleNutrition(item?: {
  nutrition?: number;
  weightKg?: number;
  id?: string;
}): number {
  if (!item) return 0;
  if (item.nutrition != null) return item.nutrition;
  if (isCarcass(item)) return Math.round((item.weightKg ?? 0) * CARCASS_NUTRITION_PER_KG);
  return 0;
}

/** Anything a pawn can eat for HUNGER — the set the food filter governs (matches selectFoodForMeal). */
export function isEdibleFood(item: Item): boolean {
  return item.category === 'food' || edibleNutrition(item) > 0;
}

// Rotten food (category `spoiled`) and raw carcasses (category `carcass`) are edible but a last resort —
// left OUT of the default allow-list so pawns won't gnaw a putrid haunch or an unbutchered body unless
// the player ticks them on in the panel.
function isDefaultBlockedFood(item: Item): boolean {
  return (
    item.category === 'spoiled' ||
    item.category === 'carcass' ||
    item.id.startsWith('rotten_') ||
    isCarcass(item)
  );
}

/** Whether an item is in the sensible out-of-the-box eat list (excludes rotten food + raw carcasses). */
export function isDefaultFood(item: Item): boolean {
  return isEdibleFood(item) && !isDefaultBlockedFood(item);
}

let _allFoodIds: string[] | null = null;
/** Every edible item id — the full checklist the food panel shows. */
export function getAllFoodIds(): string[] {
  if (!_allFoodIds) _allFoodIds = ITEMS_DB.filter(isEdibleFood).map((i) => i.id);
  return _allFoodIds;
}

let _defaultAllowedFoodIds: string[] | null = null;
/** The default eat-list: every edible item minus rotten food + raw carcasses. */
export function getDefaultAllowedFoodIds(): string[] {
  if (!_defaultAllowedFoodIds)
    _defaultAllowedFoodIds = ITEMS_DB.filter(isDefaultFood).map((i) => i.id);
  return _defaultAllowedFoodIds;
}

/**
 * Resolve the set of food ids pawns may eat. An explicit `allowedFoodItemIds` (set in the food panel —
 * even an empty array, meaning "eat nothing") is honoured verbatim; only an unconfigured policy
 * (`undefined`) falls back to the default eat-list (everything bar rotten food + raw carcasses).
 */
export function resolveAllowedFoodIds(settings?: FoodSettings): Set<string> {
  return new Set(settings?.allowedFoodItemIds ?? getDefaultAllowedFoodIds());
}
