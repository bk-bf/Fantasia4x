import { describe, it, expect } from 'vitest';
import {
  effectiveRangedRange,
  getRangedWeapon,
  isRangedWeaponProps,
  pawnVisionRange,
  pickAmmo
} from '$lib/game/systems/rangedCombat';
import { itemService } from '$lib/game/services/ItemService';
import type { Pawn } from '$lib/game/core/types';

const stats = {
  strength: 10,
  dexterity: 30,
  constitution: 10,
  intelligence: 10,
  perception: 2,
  charisma: 10
};

describe('ranged weapon rules', () => {
  it('a reach-1 melee weapon is not a ranged weapon, so a pawn holding one has no ranged weapon', () => {
    expect(isRangedWeaponProps(itemService.getItemById('stone_spear')!.weaponProperties)).toBe(
      false
    );
    const p = {
      id: 'p',
      stats: {},
      equipment: { mainHand: { itemId: 'stone_spear' } }
    } as unknown as Pawn;
    expect(getRangedWeapon(p)).toBeNull();
  });

  it('a ranged weapon never reaches past the shooter’s sight', () => {
    const p = { id: 'p', stats, traits: [], equipment: {}, limbs: [] } as unknown as Pawn;
    const r = effectiveRangedRange(p, {
      itemId: 'x',
      itemName: 'x',
      range: 40,
      reach: 0,
      reload: 0,
      strScaled: false,
      slot: 'mainHand'
    } as unknown as Parameters<typeof effectiveRangedRange>[1]);
    expect(r).toBe(pawnVisionRange(p));
    expect(r).toBe(6);
  });

  it('pickAmmo prefers the armour-piercing arrow and skips an empty stack', () => {
    const p = {
      id: 'p',
      inventory: { items: { broadhead_arrow: 5, steel_bodkin_arrow: 3, iron_arrow: 0 } }
    } as unknown as Pawn;
    expect(pickAmmo(p, 'arrow')?.itemId).toBe('steel_bodkin_arrow');
    const q = {
      id: 'q',
      inventory: { items: { steel_bodkin_arrow: 0, flint_arrow: 2 } }
    } as unknown as Pawn;
    expect(pickAmmo(q, 'arrow')?.itemId).toBe('flint_arrow');
  });
});
