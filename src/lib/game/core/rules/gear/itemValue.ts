import type { Item, ItemQuality } from '../../types';
import { itemDefById } from '../../defs/items';
import { combinedQualityMultiplier } from './itemQuality';

const TYPE_BASE: Record<Item['type'], number> = {
  material: 2,
  consumable: 3,
  tool: 10,
  weapon: 12,
  armor: 12,
  currency: 40,
  food: 2,
  container: 2,
  fluid: 2
};

const CATEGORY_MULT: Record<string, number> = {
  metal: 3,
  gem: 6,
  cloth: 1.5,
  leather: 1.5,
  food: 0.8,
  organic: 0.5
};

export function baseItemValue(def: Item): number {
  if (typeof def.value === 'number') return def.value;
  const typeBase = TYPE_BASE[def.type] ?? 2;
  const tier = Math.max(1, def.tier ?? 1);
  const catMult = CATEGORY_MULT[def.category] ?? 1;
  return Math.max(1, Math.round(typeBase * Math.pow(tier, 1.7) * catMult));
}

export function itemValueById(itemId: string): number {
  const def = itemDefById(itemId);
  return def ? baseItemValue(def) : 0;
}

export function effectiveItemValue(
  def: Item,
  quality?: ItemQuality,
  famedStatMult?: number
): number {
  return Math.max(
    1,
    Math.round(baseItemValue(def) * combinedQualityMultiplier(quality, famedStatMult))
  );
}
