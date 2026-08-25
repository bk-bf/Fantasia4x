// Economic item value (KINGDOMS-TRADE §4). Every tradeable good needs a price: an item def's
// explicit `value` wins; otherwise a heuristic over type/tier/category prices it. Effective value
// layers the same quality/Famed multiplier the combat stats use (core/itemQuality.ts), so a
// Masterwork blade is worth more than a Crude one without a second scaling system.

import type { Item, ItemQuality } from '../../types';
import { itemDefById } from '../../defs/items';
import { combinedQualityMultiplier } from './itemQuality';

/** Baseline value per item type before tier/category scaling. */
const TYPE_BASE: Record<Item['type'], number> = {
  material: 2,
  consumable: 3,
  tool: 10,
  weapon: 12,
  armor: 12,
  currency: 40,
  // `food` and `container` were missing from this table while 55 items carried those types; they
  // priced through the `?? 2` fallback below, so these two entries state what was already happening
  // rather than changing any value. Worth a deliberate balance pass, not a silent one.
  food: 2,
  container: 2,
  // A fluid is priced by the litre. Water is worth nothing on its own — what it costs a colony is the
  // trip and the vessel — while a brewed or steeped liquor carries real work; the category multiplier
  // and each fluid's authored `value` do that separating, not this baseline.
  fluid: 2
};

/** Category premiums over the type baseline (metal is scarce, food is cheap and plentiful). */
const CATEGORY_MULT: Record<string, number> = {
  metal: 3,
  gem: 6,
  cloth: 1.5,
  leather: 1.5,
  food: 0.8,
  organic: 0.5
};

/** Base value of an item DEFINITION: authored `value` if present, else the heuristic. */
export function baseItemValue(def: Item): number {
  if (typeof def.value === 'number') return def.value;
  const typeBase = TYPE_BASE[def.type] ?? 2;
  const tier = Math.max(1, def.tier ?? 1);
  const catMult = CATEGORY_MULT[def.category] ?? 1;
  return Math.max(1, Math.round(typeBase * Math.pow(tier, 1.7) * catMult));
}

/** Base value by item id (0 for unknown ids — untradeable). */
export function itemValueById(itemId: string): number {
  const def = itemDefById(itemId);
  return def ? baseItemValue(def) : 0;
}

/** Instance value: base × the quality/Famed multiplier (mirrors the combat-stat scaling). */
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
