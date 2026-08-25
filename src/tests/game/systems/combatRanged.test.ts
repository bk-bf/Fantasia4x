import { describe, it, expect } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { rng } from '$lib/game/core/util/rng';
import {
  getRangedWeapon,
  pickAmmo,
  pawnVisionRange,
  isRangedWeaponProps,
  isThrownWeaponProps,
  effectiveRangedRange,
  rangedAccuracyMod,
  aimIntervalTicks,
  drawSpeedModifier,
  sumAimBonuses,
  hasMeleeMainHand,
  getGrip,
  hasLineOfSight
} from '$lib/game/systems/rangedCombat';
import { getEquipmentSlot } from '$lib/game/core/rules/gear/equipment';
import { itemService } from '$lib/game/services/ItemService';
import { recipeService } from '$lib/game/services/RecipeService';
import type { GameState, Mob, Pawn } from '$lib/game/core/types';

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
    traits: [],
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
    state: 'Wander',
    stateSince: 0,
    isAlive: true,
    x: 5,
    y: 8,
    health: 35,
    maxHealth: 35,
    stats: { ...stats, dexterity: 2 },
    traits: [],
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

function makeArmored(id: string): Pawn {
  return makeArcher({
    id,
    position: { x: 5, y: 5 },
    currentState: 'Idle',
    combatStance: 'defensive',
    drafted: false,
    stats: { ...stats, dexterity: 2, constitution: 16 },
    equipment: { bodyMid: { itemId: 'mail_hauberk', durability: 100 } }
  } as unknown as Partial<Pawn>);
}

function makeMeleeAttacker(id: string, weapon: string, targetId: string): Pawn {
  return makeArcher({
    id,
    position: { x: 5, y: 6 },
    currentState: 'Idle',
    drafted: true,
    draftTarget: { type: 'attack', targetType: 'pawn', targetId },
    stats: { ...stats, strength: 16, dexterity: 16 },
    equipment: { mainHand: { itemId: weapon } }
  } as unknown as Partial<Pawn>);
}

function makeState(pawns: Pawn[], mobs: Mob[]): GameState {
  return { turn: 0, pawns, mobs, worldMap: [], droppedItems: [] } as unknown as GameState;
}

describe('rangedCombat helpers', () => {
  it('classifies the self_bow as ranged and melee weapons as not', () => {
    expect(isRangedWeaponProps(itemService.getItemById('self_bow')?.weaponProperties)).toBe(true);
    expect(getRangedWeapon(makeArcher())?.itemId).toBe('self_bow');
    expect(getRangedWeapon(makeArcher({ equipment: {} } as Partial<Pawn>))).toBeNull();
  });

  it('picks matching ammo from inventory and ignores the wrong category', () => {
    const archer = makeArcher();
    expect(pickAmmo(archer, 'arrow')?.itemId).toBe('flint_arrow');
    expect(pickAmmo(archer, 'bolt')).toBeNull();
  });

  it('vision range follows perception (not the evaluateStat 1.0 fallback)', () => {
    expect(pawnVisionRange(makeArcher())).toBe(10);
    expect(
      pawnVisionRange(makeArcher({ stats: { ...stats, perception: 20 } } as Partial<Pawn>))
    ).toBe(15);
  });

  it('accuracy falls off LINEARLY with distance and rewards the aim stat', () => {
    const near = rangedAccuracyMod(1.0, 0, 0, 2, 0);
    const far = rangedAccuracyMod(1.0, 0, 0, 8, 0);
    expect(near).toBeGreaterThan(far);
    expect(near - far).toBeCloseTo((8 - 2) * 2.5, 5);
    expect(rangedAccuracyMod(1.4, 0, 0, 4, 0)).toBeGreaterThan(rangedAccuracyMod(1.0, 0, 0, 4, 0));
    expect(rangedAccuracyMod(1.0, 0, 0, 4, 0.2)).toBeLessThan(rangedAccuracyMod(1.0, 0, 0, 4, 0));
  });

  it('aim interval lengthens with distance and shortens with aim_speed', () => {
    expect(aimIntervalTicks(90, 1, 8, 1.0, 0, 1.0)).toBeGreaterThan(
      aimIntervalTicks(90, 1, 2, 1.0, 0, 1.0)
    );
    expect(aimIntervalTicks(90, 1, 4, 1.5, 0, 1.0)).toBeLessThan(
      aimIntervalTicks(90, 1, 4, 1.0, 0, 1.0)
    );
    expect(aimIntervalTicks(90, 3, 4, 1.0, 0, 1.0)).toBeGreaterThan(
      aimIntervalTicks(90, 1, 4, 1.0, 0, 1.0)
    );
  });

  it('shot cadence is floored at the melee cap (72) and averages near melee — never tick-rate', () => {
    expect(aimIntervalTicks(75, 1, 2, 1.8, 0.8, 1.0)).toBe(72);
    const typical = aimIntervalTicks(104, 1, 4, 1.2, 0, 1.2);
    expect(typical).toBeGreaterThanOrEqual(72);
    expect(typical).toBeLessThan(160);
    expect(aimIntervalTicks(104, 3, 4, 1.2, 0, 1.0)).toBeGreaterThan(200);
  });

  it('reload_speed (DEXTERITY) shortens only a crossbow span — bows ignore it (the build fork)', () => {
    expect(aimIntervalTicks(90, 3, 4, 1.0, 0, 1.4)).toBeLessThan(
      aimIntervalTicks(90, 3, 4, 1.0, 0, 0.8)
    );
    expect(aimIntervalTicks(90, 1, 4, 1.0, 0, 1.4)).toBe(aimIntervalTicks(90, 1, 4, 1.0, 0, 0.8));
    expect(aimIntervalTicks(90, 3, 4, 1.5, 0, 1.0)).toBeLessThan(
      aimIntervalTicks(90, 3, 4, 1.0, 0, 1.0)
    );
  });

  it('effective range scales weapon range by PERCEPTION (aim_range), capped by vision', () => {
    const low = makeArcher({ stats: { ...stats, perception: 10 } } as Partial<Pawn>);
    const sharp = makeArcher({ stats: { ...stats, perception: 22 } } as Partial<Pawn>);
    const rw = getRangedWeapon(low)!;
    expect(effectiveRangedRange(sharp, rw)).toBeGreaterThan(effectiveRangedRange(low, rw));
    expect(effectiveRangedRange(sharp, rw)).toBeLessThanOrEqual(pawnVisionRange(sharp));
  });

  it('sums aimBonuses across equipped gear', () => {
    const geared = makeArcher({
      equipment: {
        mainHand: { itemId: 'self_bow', durability: 80 },
        gloves: { itemId: 'leather_vambraces', durability: 50 },
        back: { itemId: 'leather_cloak', durability: 60 }
      }
    } as Partial<Pawn>);
    const b = sumAimBonuses(geared);
    expect(b.speed).toBeGreaterThan(0);
    expect(b.range).toBeGreaterThanOrEqual(2);
    expect(b.accuracy).toBeGreaterThanOrEqual(5);
  });

  it('routes thrown weapons to the OFF hand and bows to the main hand (one-handed hybrid)', () => {
    expect(isThrownWeaponProps(itemService.getItemById('throwing_spear')?.weaponProperties)).toBe(
      true
    );
    expect(getEquipmentSlot(itemService.getItemById('throwing_spear')!)).toBe('offHand');
    expect(getEquipmentSlot(itemService.getItemById('self_bow')!)).toBe('mainHand');
  });

  it('the SHOT damage comes from ammo × drawPower; the bow’s own damage is only its weak melee stave', () => {
    const bow = itemService.getItemById('self_bow')!.weaponProperties!;
    const warBow = itemService.getItemById('war_bow')!.weaponProperties!;
    expect(bow.damageType).toBe('blunt');
    expect(bow.damage).toBeLessThanOrEqual(6);
    expect(warBow.drawPower!).toBeGreaterThan(bow.drawPower!);
    expect(itemService.getItemById('flint_arrow')!.ammoProperties!.damage!).toBeGreaterThan(0);
  });

  it('quivers route by ammo: arrows to the BACK LOAD slot (blocks a pack), bolts to the BELT (keeps it)', () => {
    expect(getEquipmentSlot(itemService.getItemById('leather_back_quiver')!)).toBe('back2');
    expect(getEquipmentSlot(itemService.getItemById('linen_snapsack')!)).toBe('back2');
    expect(getEquipmentSlot(itemService.getItemById('leather_cloak')!)).toBe('back');
    expect(getEquipmentSlot(itemService.getItemById('leather_bolt_case')!)).toBe('belt');
    expect(itemService.getItemById('leather_back_quiver')!.quiver?.ammoCategory).toBe('arrow');
    expect(itemService.getItemById('leather_bolt_case')!.quiver?.ammoCategory).toBe('bolt');
    expect(itemService.getItemById('stiffened_war_quiver')!.quiver!.drawSpeed).toBeGreaterThan(
      itemService.getItemById('hide_arrow_sheath')!.quiver!.drawSpeed
    );
  });

  it('draw speed: a matching quiver is fast, a pack (no quiver) fumbles, slings never care', () => {
    const quivered = makeArcher({
      equipment: { mainHand: { itemId: 'self_bow' }, back: { itemId: 'leather_back_quiver' } }
    } as unknown as Partial<Pawn>);
    const packed = makeArcher({
      equipment: { mainHand: { itemId: 'self_bow' }, back: { itemId: 'wicker_frame' } }
    } as unknown as Partial<Pawn>);
    const bare = makeArcher({
      equipment: { mainHand: { itemId: 'self_bow' } }
    } as unknown as Partial<Pawn>);

    expect(drawSpeedModifier(quivered, 'arrow')).toBeCloseTo(0.25, 5);
    expect(drawSpeedModifier(packed, 'arrow')).toBeLessThan(0);
    expect(drawSpeedModifier(bare, 'arrow')).toBe(0);
    expect(drawSpeedModifier(packed, 'sling_stone')).toBe(0);
    expect(drawSpeedModifier(packed, undefined)).toBe(0);
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
    expect(state.pawns[0].inventory.items.flint_arrow).toBeLessThan(20);
  });

  it('auto-engage: a DRAFTED ranged pawn with ammo looses arrows at its target', () => {
    const archer = makeArcher({
      drafted: true,
      currentState: 'Idle',
      draftTarget: { type: 'attack', targetType: 'mob', targetId: 'g1' }
    } as unknown as Partial<Pawn>);
    let state = makeState([archer], [makeGoblin()]);
    for (let t = 0; t < 400; t++) state = combatService.tickCombat({ ...state, turn: t }, 16);
    expect(state.pawns[0].inventory.items.flint_arrow).toBeLessThan(20);
  });

  it('force-melee: a DRAFTED ranged pawn told to melee does NOT loose arrows at range', () => {
    const archer = makeArcher({
      drafted: true,
      currentState: 'Idle',
      draftTarget: { type: 'attack', targetType: 'mob', targetId: 'g1', mode: 'melee' }
    } as unknown as Partial<Pawn>);
    let state = makeState([archer], [makeGoblin()]);
    for (let t = 0; t < 400; t++) state = combatService.tickCombat({ ...state, turn: t }, 16);
    expect(state.pawns[0].inventory.items.flint_arrow).toBe(20);
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

  it('an OUT-OF-AMMO ranged pawn in contact does NOT auto-melee (engaging is opt-in)', () => {
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
    let state = makeState([archer], [makeGoblin({ y: 6 })]);
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

  it('a bow in contact melees with its own (weak, blunt) stave profile — not the piercing shot', () => {
    let state = makeState([makeArcher()], [makeGoblin({ y: 6 })]);
    let bluntWound = false;
    for (let t = 0; t < 2000 && !bluntWound; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      const wounds = state.mobs![0].injuries ?? [];
      if (wounds.some((w) => w.type === 'crush')) bluntWound = true;
    }
    expect(bluntWound).toBe(true);
  });

  it('armorDamage differentiates the archetypes: hammer ≫ mace ≫ … ≫ cleaver', () => {
    const ad = (id: string) => itemService.getItemById(id)!.weaponProperties!.armorDamage;
    expect(ad('steel_warhammer')!).toBeGreaterThan(ad('steel_mace')!);
    expect(ad('steel_mace')!).toBeGreaterThan(ad('steel_cleaver')!);
    expect(ad('steel_cleaver')!).toBeLessThanOrEqual(2);
  });

  it('a hammer strips a foe’s armour far faster than a cleaver (armour damage ≠ flesh damage)', () => {
    const armored = (id: string) => {
      const p = makeArmored(id);
      p.equipment.bodyMid!.durability = 100_000;
      p.bloodVolume = 1e7;
      p.maxBloodVolume = 1e7;
      for (const limb of p.limbs ?? []) {
        limb.health = 1e7;
        for (const part of limb.parts ?? []) {
          part.health = 1e7;
          part.maxHp = 1e7;
        }
      }
      return p;
    };
    const attacker = (id: string, weapon: string, targetId: string) => {
      const p = makeMeleeAttacker(id, weapon, targetId);
      p.equipment.mainHand!.durability = 100_000;
      return p;
    };
    rng.reseed(20260627);
    let h = makeState([attacker('ha', 'steel_warhammer', 'hd'), armored('hd')], []);
    for (let t = 0; t < 3000; t++) h = combatService.tickCombat({ ...h, turn: t }, 16);
    const hammerArmor = h.pawns.find((p) => p.id === 'hd')!.equipment.bodyMid!.durability!;

    rng.reseed(20260627);
    let c = makeState([attacker('ca', 'steel_cleaver', 'cd'), armored('cd')], []);
    for (let t = 0; t < 3000; t++) c = combatService.tickCombat({ ...c, turn: t }, 16);
    const cleaverArmor = c.pawns.find((p) => p.id === 'cd')!.equipment.bodyMid!.durability!;

    expect(hammerArmor).toBeLessThan(cleaverArmor);
  });

  it('POWER STAT: a rapier scales melee damage with PERCEPTION, a one-handed sword with DEXTERITY', () => {
    const empty = makeState([], []);
    const defender = makeGoblin({ stats: { ...stats, dexterity: 2 } });
    const avgDmg = (weapon: string, st: Partial<typeof stats>) => {
      const atk = makeArcher({
        equipment: { mainHand: { itemId: weapon } },
        stats: { ...stats, ...st }
      } as unknown as Partial<Pawn>);
      let total = 0;
      let hits = 0;
      for (let i = 0; i < 600; i++) {
        const r = combatService.resolveHit(atk, defender, empty);
        if (r.hit) {
          total += r.damage;
          hits++;
        }
      }
      return hits ? total / hits : 0;
    };
    expect(avgDmg('steel_rapier', { strength: 10, perception: 20 })).toBeGreaterThan(
      avgDmg('steel_rapier', { strength: 10, perception: 4 }) * 1.4
    );
    const swHiPer = avgDmg('steel_longsword', { dexterity: 10, perception: 20 });
    const swLoPer = avgDmg('steel_longsword', { dexterity: 10, perception: 4 });
    expect(Math.abs(swHiPer - swLoPer) / swHiPer).toBeLessThan(0.2);
    expect(avgDmg('steel_longsword', { dexterity: 20 })).toBeGreaterThan(
      avgDmg('steel_longsword', { dexterity: 4 }) * 1.4
    );
    const swHiStr = avgDmg('steel_longsword', { dexterity: 10, strength: 20 });
    const swLoStr = avgDmg('steel_longsword', { dexterity: 10, strength: 5 });
    expect(Math.abs(swHiStr - swLoStr) / swHiStr).toBeLessThan(0.2);
  });

  it('daggers are fast, crit-heavy and accurate; specialists are iron+ gated', () => {
    const wp = (id: string) => itemService.getItemById(id)!.weaponProperties!;
    expect(wp('steel_stiletto').attackSpeed).toBeGreaterThan(1.3);
    expect(wp('steel_stiletto').critMod!).toBeGreaterThan(0.1);
    expect(wp('iron_rondel').accuracy!).toBeGreaterThan(0);
    expect(wp('steel_stiletto').accuracy!).toBeGreaterThan(0);
    expect(wp('steel_stiletto').accuracy!).toBeLessThan(wp('steel_rapier').accuracy!);
    const research = (id: string) => recipeService.getRecipeForItem(id)?.researchRequired;
    for (const id of ['iron_warhammer', 'iron_greatsword', 'iron_estoc'])
      expect(research(id)).toBe('iron_working');
    for (const id of ['steel_cleaver', 'steel_flail', 'steel_rapier'])
      expect(research(id)).toBe('steel_making');
  });

  it('classifies the melee GRIP from the hands (2H / shield / duelist / one-handed)', () => {
    const twoH = makeArcher();
    const duelist = makeArcher({
      equipment: { mainHand: { itemId: 'bone_knife' } }
    } as unknown as Partial<Pawn>);
    const shield = makeArcher({
      equipment: { mainHand: { itemId: 'bone_knife' }, offHand: { itemId: 'rawhide_round_shield' } }
    } as unknown as Partial<Pawn>);
    const dualWield = makeArcher({
      equipment: { mainHand: { itemId: 'bone_knife' }, offHand: { itemId: 'bone_knife' } }
    } as unknown as Partial<Pawn>);
    const trained = makeArcher({
      equipment: { mainHand: { itemId: 'bone_knife' } },
      traits: [{ id: 'duelist', name: 'Duelist', effects: {} }]
    } as unknown as Partial<Pawn>);
    expect(getGrip(twoH)).toBe('twoHanded');
    expect(getGrip(duelist)).toBe('oneHanded');
    expect(getGrip(trained)).toBe('duelist');
    expect(getGrip(shield)).toBe('shield');
    expect(getGrip(dualWield)).toBe('dualWield');
  });

  it('combat wears equipment: a weapon loses condition as it lands blows', () => {
    const fighter = makeArcher({
      equipment: { mainHand: { itemId: 'bone_knife', durability: 60 } }
    } as unknown as Partial<Pawn>);
    let state = makeState([fighter], [makeGoblin({ y: 6 })]);
    for (let t = 0; t < 2000; t++) state = combatService.tickCombat({ ...state, turn: t }, 16);
    expect(state.pawns[0].equipment.mainHand!.durability).toBeLessThan(60);
  });

  it('the arrowhead picks the wound type — a broadhead cuts (bleeds), not pierces', () => {
    const archer = makeArcher({
      inventory: {
        items: { broadhead_arrow: 20 },
        instances: [],
        weightKg: 0,
        maxWeightKg: 50,
        volumeL: 0,
        maxVolumeL: 50
      }
    } as unknown as Partial<Pawn>);
    let state = makeState([archer], [makeGoblin()]);
    let cut = false;
    for (let t = 0; t < 2000 && !cut; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      if ((state.mobs![0].injuries ?? []).some((w) => w.type === 'cut')) cut = true;
    }
    expect(cut).toBe(true);
  });

  it('hybrid: a melee main-hand + off-hand throwing spear throws at range, melees up close', () => {
    const hybrid = makeArcher({
      equipment: {
        mainHand: { itemId: 'bone_knife', durability: 60 },
        offHand: { itemId: 'throwing_spear', durability: 20 }
      },
      inventory: {
        items: {},
        instances: [],
        weightKg: 0,
        maxWeightKg: 50,
        volumeL: 0,
        maxVolumeL: 50
      }
    } as unknown as Partial<Pawn>);
    expect(getRangedWeapon(hybrid)?.itemId).toBe('throwing_spear');
    expect(hasMeleeMainHand(hybrid)).toBe(true);

    let state = makeState([hybrid], [makeGoblin()]);
    let threw = false;
    for (let t = 0; t < 2000 && !threw; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      if (!state.pawns[0].equipment?.offHand) threw = true;
    }
    expect(threw).toBe(true);
    expect((state.droppedItems ?? []).some((d) => d.resourceId === 'throwing_spear')).toBe(true);
  });
});

describe('Part VII — line-of-sight occlusion', () => {
  const grid = (w: number, h: number, walls: string[] = []) => {
    const set = new Set(walls);
    return Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => ({ blocksSight: set.has(`${x},${y}`) }))
    );
  };

  it('clear horizontal line has LoS', () => {
    expect(hasLineOfSight(grid(6, 1), 0, 0, 5, 0)).toBe(true);
  });

  it('a wall on the line blocks LoS', () => {
    expect(hasLineOfSight(grid(6, 1, ['3,0']), 0, 0, 5, 0)).toBe(false);
  });

  it('an occluder ON either endpoint does NOT block (shooter cover / target hugging a wall)', () => {
    expect(hasLineOfSight(grid(6, 1, ['5,0']), 0, 0, 5, 0)).toBe(true);
    expect(hasLineOfSight(grid(6, 1, ['0,0']), 0, 0, 5, 0)).toBe(true);
  });

  it('walks diagonals — clear vs blocked', () => {
    expect(hasLineOfSight(grid(5, 5), 0, 0, 4, 4)).toBe(true);
    expect(hasLineOfSight(grid(5, 5, ['2,2']), 0, 0, 4, 4)).toBe(false);
  });

  it('same tile is trivially in sight (no infinite walk)', () => {
    expect(hasLineOfSight(grid(3, 3), 1, 1, 1, 1)).toBe(true);
  });

  it('a wall just off the line does not block', () => {
    expect(hasLineOfSight(grid(6, 3, ['3,1']), 0, 0, 5, 0)).toBe(true);
  });
});
