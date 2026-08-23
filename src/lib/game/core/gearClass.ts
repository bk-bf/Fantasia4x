// gearClass.ts — the one weight class every piece of worn or held gear answers to.
//
// Armour has always had light/medium/heavy. Carry aids and weapons did not, so a loadout could only be
// read a piece at a time: nothing said that a frame pack and a greatsword are the same KIND of choice
// (capacity or reach, bought with speed) while a satchel and a rapier are the other kind.
//
// Where the class comes from differs on purpose:
//   • ARMOUR authors it (`armorProperties.armorType`) — ITEM-RULES derives it from the recipe's
//     metal-to-leather ratio, which is a judgement about construction.
//   • CARRY AIDS author it too, in the same field, because a satchel and a frame pack are a deliberate
//     design axis: what the piece costs to wear against what it holds.
//   • WEAPONS DERIVE it from mass and grip. 125 weapons already state a `weightKg` and whether they
//     need both hands, and a hand-typed label over that many rows drifts the moment one number moves.

import type { Item } from './types';

export type GearClass = 'light' | 'medium' | 'heavy';

/** One-handed cuts, in kg. Below the first is a knife or a short blade, above the second is something
 *  swung with the shoulder rather than the wrist. */
const ONE_HAND_LIGHT = 1.2;
const ONE_HAND_HEAVY = 2.2;
/** Two-handed cuts. A sling or a blowgun is genuinely light despite needing both hands; past the upper
 *  cut sits the greatsword/maul band. */
const TWO_HAND_LIGHT = 1.0;
const TWO_HAND_HEAVY = 3.0;

/** A weapon's class, read off what it costs to swing. Never authored — see the note above. */
export function weaponClassOf(item: {
  weightKg?: number;
  weaponProperties?: { twoHanded?: boolean } | null;
}): GearClass {
  const kg = item.weightKg ?? 0;
  if (item.weaponProperties?.twoHanded)
    return kg < TWO_HAND_LIGHT ? 'light' : kg < TWO_HAND_HEAVY ? 'medium' : 'heavy';
  return kg < ONE_HAND_LIGHT ? 'light' : kg < ONE_HAND_HEAVY ? 'medium' : 'heavy';
}

/** True when this item is a worn carry aid: it raises what a pawn can shoulder and holds nothing
 *  itself. A cart grants the same bonus from the hand, so it counts too. */
export function isCarryAid(item: Item): boolean {
  return !!item.inventoryBonus;
}

/**
 * The weight class of any gear a pawn wears or holds — `null` for everything else (materials, food,
 * a jug). Shields keep their own label: an off-hand board is not a point on the light→heavy line, it
 * is a different job, and `Combat` already branches on it.
 */
export function gearClassOf(item: Item): GearClass | 'shield' | null {
  const authored = item.armorProperties?.armorType;
  if (authored === 'shield') return 'shield';
  if (authored === 'light' || authored === 'medium' || authored === 'heavy') return authored;
  if (item.weaponProperties) return weaponClassOf(item);
  return null;
}
