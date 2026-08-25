import type { Item, Trait } from '$lib/game/core/types';
import { gameCoordinator } from '$lib/game/systems/GameCoordinator';

export interface NaturalGearMeta {
  innate: true;
  stage?: 1 | 2 | 3;
  evolves: boolean;
  carryPenalty?: number;
}

export interface NaturalGear {
  name: string;
  sub: string;
  item: Item;
  kind: 'weapon' | 'armor';
  natural: NaturalGearMeta;
}

const RES_TO_ARMOR: Record<string, string> = {
  coldResistance: 'coldResistance',
  fireResistance: 'heatResistance',
  cutting_resistance: 'slashResistance',
  piercing_resistance: 'pierceResistance',
  blunt_resistance: 'crushResistance'
};

export function naturalGearForTrait(t: Trait): NaturalGear | null {
  const natural: NaturalGearMeta = {
    innate: true,
    stage: t.stage,
    evolves: !!t.evolvesTo,
    carryPenalty: t.carryPenalty
  };

  const weaponDefs = (t.naturalWeapons ?? [])
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

  const armor = t.naturalArmor ?? Math.max(0, ...(t.armorMods ?? []).map((m) => m.defense));
  if (!armor) return null;
  const ap: Record<string, unknown> = {
    defense: armor,
    armorType: 'natural',
    slot: t.blocksSlots?.[0],
    armorLayer: 'innermost natural layer'
  };
  for (const [k, v] of Object.entries(t.effects ?? {})) {
    const ak = RES_TO_ARMOR[k];
    if (ak && typeof v === 'number' && v !== 0) ap[ak] = v;
  }
  return {
    name: t.name,
    sub: `+${armor} def${t.carryPenalty ? ` · −${Math.round(t.carryPenalty * 100)}% carry` : ''}`,
    item: {
      id: `natural-armor:${t.id}`,
      name: t.name,
      type: 'armor',
      description: t.description,
      armorProperties: ap
    } as unknown as Item,
    kind: 'armor',
    natural
  };
}
