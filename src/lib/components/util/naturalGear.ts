// naturalGear.ts — single source for turning a trait's §3 natural weapon/armor (resolved via its
// `selfCondition` grants) into a real `Item`, so the SAME `ItemStatTooltip` the gear tab uses on hover
// can render it. Used by EquipmentDoll (the gear doll) AND TraitCards (the trait card), so the natural
// weapon/armor breakdown is built ONCE, never re-derived per screen.
import type { Item, Trait } from '$lib/game/core/types';
import { getTransientConditionDef } from '$lib/game/core/needs';
import { gameCoordinator } from '$lib/game/systems/GameCoordinator';

/** The natural-gear-only extras rendered in `ItemStatTooltip`'s NATURAL block — facts that aren't part
 *  of a normal item: it's innate, its carry cost, and where it sits in its 3-stage evolution line. */
export interface NaturalGearMeta {
  /** Natural gear is always innate — it can't be unequipped. */
  innate: true;
  /** Position in the 3-stage evolution line (§3 natural-gear traits). */
  stage?: 1 | 2 | 3;
  /** True when it grows into a further stage with age; false when it's the apex of its line. */
  evolves: boolean;
  /** Fraction (0–1) of carry capacity this gear consumes. */
  carryPenalty?: number;
}

export interface NaturalGear {
  /** Display name (weapon name, or the trait name for an armour covering). */
  name: string;
  /** Short one-line summary (used under a gear slot). */
  sub: string;
  /** The item fed to `ItemStatTooltip` — the weapon's real def, or a synthesised armour def. */
  item: Item;
  kind: 'weapon' | 'armor';
  /** Natural-gear extras (innate / evolution stage / carry cost) for the tooltip's NATURAL block. */
  natural: NaturalGearMeta;
}

// Trait resistance effects → the armour-tooltip fields ItemStatTooltip already renders, so a covering's
// cold/heat/physical resistance shows in the ONE gear tooltip instead of as separate pills.
const RES_TO_ARMOR: Record<string, string> = {
  coldResistance: 'coldResistance',
  fireResistance: 'heatResistance',
  cutting_resistance: 'slashResistance',
  piercing_resistance: 'pierceResistance',
  blunt_resistance: 'crushResistance'
};

/** The natural weapon/armor a trait grants (via its `selfCondition`), as a tooltip-ready `Item`, or null
 *  if the trait grants no natural gear. Weapons win when a trait grants both (rare). */
export function naturalGearForTrait(t: Trait): NaturalGear | null {
  const cond = t.selfCondition ? getTransientConditionDef(t.selfCondition) : undefined;
  if (!cond) return null;

  const natural: NaturalGearMeta = {
    innate: true,
    stage: t.stage,
    evolves: !!t.evolvesTo,
    carryPenalty: cond.carryPenalty
  };

  const weaponDefs = (cond.grantsNaturalWeapon ?? [])
    .map((id) => gameCoordinator.getItemById(id))
    .filter((d): d is Item => !!d);
  if (weaponDefs.length) {
    return {
      name: weaponDefs.map((d) => d.name).join(', '),
      sub: 'natural weapon',
      item: weaponDefs[0],
      kind: 'weapon',
      natural
    };
  }

  const armor = cond.grantsNaturalArmor ?? 0;
  if (!armor) return null;
  const ap: Record<string, unknown> = {
    defense: armor,
    armorType: 'natural',
    // The slot the covering occupies (e.g. "bodyMid") — surfaces as the tooltip's "Slot" row.
    slot: t.blocksSlots?.[0],
    armorLayer: cond.mode === 'replace' ? 'replaces the slot' : 'stacks with worn gear'
  };
  // Fold the covering's resistances into the armour def so the ONE tooltip shows them.
  for (const [k, v] of Object.entries(t.effects ?? {})) {
    const ak = RES_TO_ARMOR[k];
    if (ak && typeof v === 'number' && v !== 0) ap[ak] = v;
  }
  return {
    name: t.name,
    sub: `+${armor} def${cond.carryPenalty ? ` · −${Math.round(cond.carryPenalty * 100)}% carry` : ''}`,
    item: {
      id: `natural-armor:${t.id}`,
      name: cond.name,
      type: 'armor',
      description: cond.description,
      armorProperties: ap
    } as unknown as Item,
    kind: 'armor',
    natural
  };
}
