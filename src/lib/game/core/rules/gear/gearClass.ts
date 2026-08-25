import type { Item } from '../../types';

export type GearClass = 'light' | 'medium' | 'heavy';

const ONE_HAND_LIGHT = 1.2;
const ONE_HAND_HEAVY = 2.2;
const TWO_HAND_LIGHT = 1.0;
const TWO_HAND_HEAVY = 3.0;

export function weaponClassOf(item: {
  weightKg?: number;
  weaponProperties?: { twoHanded?: boolean } | null;
}): GearClass {
  const kg = item.weightKg ?? 0;
  if (item.weaponProperties?.twoHanded)
    return kg < TWO_HAND_LIGHT ? 'light' : kg < TWO_HAND_HEAVY ? 'medium' : 'heavy';
  return kg < ONE_HAND_LIGHT ? 'light' : kg < ONE_HAND_HEAVY ? 'medium' : 'heavy';
}

export function isCarryAid(item: Item): boolean {
  return !!item.inventoryBonus;
}

export function gearClassOf(item: Item): GearClass | 'shield' | null {
  const authored = item.armorProperties?.armorType;
  if (authored === 'shield') return 'shield';
  if (authored === 'light' || authored === 'medium' || authored === 'heavy') return authored;
  if (item.weaponProperties) return weaponClassOf(item);
  return null;
}
