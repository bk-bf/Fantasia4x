import type { Item, FoodSettings } from '../core/types';
import itemsData from '../database/items/items.jsonc';

const ITEMS_DB = itemsData as unknown as Item[];

const CARCASS_NUTRITION_PER_KG = 2;

export function isCarcass(item: { id?: string }): boolean {
  return (
    !!item.id &&
    item.id.endsWith('_carcass') &&
    item.id !== 'rotten_carcass' &&
    item.id !== 'pawn_carcass'
  );
}

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

export function isEdibleFood(item: Item): boolean {
  return item.category === 'food' || edibleNutrition(item) > 0;
}

function isDefaultBlockedFood(item: Item): boolean {
  return (
    item.category === 'spoiled' ||
    item.category === 'carcass' ||
    item.id.startsWith('rotten_') ||
    isCarcass(item)
  );
}

export function isDefaultFood(item: Item): boolean {
  return isEdibleFood(item) && !isDefaultBlockedFood(item);
}

let _allFoodIds: string[] | null = null;
export function getAllFoodIds(): string[] {
  if (!_allFoodIds) _allFoodIds = ITEMS_DB.filter(isEdibleFood).map((i) => i.id);
  return _allFoodIds;
}

let _defaultAllowedFoodIds: string[] | null = null;
export function getDefaultAllowedFoodIds(): string[] {
  if (!_defaultAllowedFoodIds)
    _defaultAllowedFoodIds = ITEMS_DB.filter(isDefaultFood).map((i) => i.id);
  return _defaultAllowedFoodIds;
}

export function resolveAllowedFoodIds(settings?: FoodSettings): Set<string> {
  return new Set(settings?.allowedFoodItemIds ?? getDefaultAllowedFoodIds());
}
