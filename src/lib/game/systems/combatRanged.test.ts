import { describe, it, expect } from 'vitest';
import { combatService } from './Combat';
import {
  getRangedWeapon,
  pickAmmo,
  rangedDistancePenalty,
  pawnVisionRange,
  isRangedWeaponProps
} from './rangedCombat';
import { itemService } from '../services/ItemService';
import type { GameState, Mob, Pawn } from '../core/types';

/**
 * RANGED-COMBAT headless suite — drives the REAL combatService.tickCombat to prove a bow-armed pawn
 * strikes a mob beyond melee reach, consumes ammo, holds fire without ammo, and bow-butts in contact.
 */
const stats = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  perception: 10,
  charisma: 10
};

const limbs = () => [
  { id: 'head', health: 100, bleedRate: 0, parts: [] },
  { id: 'torso', health: 100, bleedRate: 0, parts: [] },
  { id: 'left_arm', health: 100, bleedRate: 0, parts: [] },
  { id: 'right_arm', health: 100, bleedRate: 0, parts: [] },
  { id: 'left_leg', health: 100, bleedRate: 0, parts: [] },
  { id: 'right_leg', health: 100, bleedRate: 0, parts: [] }
];

function makeArcher(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Wren',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Fighting',
    combatStance: 'defensive',
    stats: { ...stats, dexterity: 20 },
    racialTraits: [],
    equipment: { mainHand: { itemId: 'self_bow', durability: 80 } },
    inventory: {
      items: { flint_arrow: 20 },
      instances: [],
      weightKg: 0,
      maxWeightKg: 50,
      volumeL: 0,
      maxVolumeL: 50
    },
    limbs: limbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    ...(over as object)
  } as unknown as Pawn;
}

function makeGoblin(over: Partial<Mob> = {}): Mob {
  return {
    id: 'g1',
    creatureId: 'goblin',
    entityClass: 'mob',
    state: 'Wander', // passive: never swings back, so only the archer acts
    stateSince: 0,
    isAlive: true,
    x: 5,
    y: 8, // 3 tiles south — beyond melee reach (1), inside self_bow range (6)
    health: 35,
    maxHealth: 35,
    stats: { ...stats, dexterity: 2 }, // low dodge → shots land
    racialTraits: [],
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    limbs: limbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    needs: { hunger: 0, fatigue: 0 },
    ...(over as object)
  } as unknown as Mob;
}

function makeState(pawns: Pawn[], mobs: Mob[]): GameState {
  return { turn: 0, pawns, mobs, worldMap: [], droppedItems: [] } as unknown as GameState;
}

describe('rangedCombat helpers', () => {
  it('classifies the self_bow as ranged and melee weapons as not', () => {
    expect(isRangedWeaponProps(itemService.getItemById('self_bow')?.weaponProperties)).toBe(true);
    expect(getRangedWeapon(makeArcher())?.itemId).toBe('self_bow');
    // A pawn holding a melee weapon (or nothing) has no ranged weapon.
    expect(getRangedWeapon(makeArcher({ equipment: {} } as Partial<Pawn>))).toBeNull();
  });

  it('picks matching ammo from inventory and ignores the wrong category', () => {
    const archer = makeArcher();
    expect(pickAmmo(archer, 'arrow')?.itemId).toBe('flint_arrow');
    expect(pickAmmo(archer, 'bolt')).toBeNull();
  });

  it('distance penalty is 0 at the optimal band and climbs toward the range edge', () => {
    // self_bow range 6 → optimal = ceil(3) = 3.
    expect(rangedDistancePenalty(3, 6)).toBe(0);
    expect(rangedDistancePenalty(6, 6)).toBeGreaterThan(rangedDistancePenalty(4, 6));
    expect(rangedDistancePenalty(100, 6)).toBeLessThanOrEqual(0.4);
  });

  it('vision range follows perception (not the evaluateStat 1.0 fallback)', () => {
    expect(pawnVisionRange(makeArcher())).toBe(10);
    expect(pawnVisionRange(makeArcher({ stats: { ...stats, perception: 20 } } as Partial<Pawn>))).toBe(15);
  });
});

describe('ranged combat (headless tickCombat)', () => {
  it('a bow-armed pawn wounds a mob 3 tiles away and spends arrows', () => {
    let state = makeState([makeArcher()], [makeGoblin()]);
    let injured = false;
    for (let t = 0; t < 2000 && !injured; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      if ((state.mobs![0].injuries?.length ?? 0) > 0) injured = true;
    }
    expect(injured).toBe(true);
    expect(state.pawns[0].inventory.items.flint_arrow).toBeLessThan(20); // ammo consumed
  });

  it('an archer with no ammo cannot wound a mob at range', () => {
    const archer = makeArcher({
      inventory: {
        items: {},
        instances: [],
        weightKg: 0,
        maxWeightKg: 50,
        volumeL: 0,
        maxVolumeL: 50
      }
    } as Partial<Pawn>);
    let state = makeState([archer], [makeGoblin()]);
    for (let t = 0; t < 2000; t++) state = combatService.tickCombat({ ...state, turn: t }, 16);
    expect(state.mobs![0].injuries?.length ?? 0).toBe(0);
  });

  it('recovers spent arrows onto the target tile (haulable drops)', () => {
    let state = makeState([makeArcher()], [makeGoblin()]);
    for (let t = 0; t < 4000; t++) state = combatService.tickCombat({ ...state, turn: t }, 16);
    const drops = (state.droppedItems ?? []).filter((d) => d.resourceId === 'flint_arrow');
    expect(drops.length).toBeGreaterThan(0);
    expect(drops[0]).toMatchObject({ x: 5, y: 8, quantity: 1 });
  });

  it('bow-butts (blunt) a mob that closes into melee instead of firing piercing', () => {
    // Goblin adjacent (5,6): the archer cannot fire into contact → weak blunt stave strike.
    let state = makeState([makeArcher()], [makeGoblin({ y: 6 })]);
    let bluntWound = false;
    for (let t = 0; t < 2000 && !bluntWound; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      const wounds = state.mobs![0].injuries ?? [];
      if (wounds.some((w) => w.type === 'crush')) bluntWound = true; // blunt → crush wound
    }
    expect(bluntWound).toBe(true);
  });
});
