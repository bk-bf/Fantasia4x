import { describe, it, expect } from 'vitest';
import { combatService } from './Combat';
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
  getGrip
} from './rangedCombat';
import { getEquipmentSlot } from '../core/PawnEquipment';
import { itemService } from '../services/ItemService';
import { recipeService } from '../services/RecipeService';
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

/** A low-dodge pawn wearing a mail hauberk (bodyMid), so blows land + chew its armour. */
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

/** A drafted attacker swinging `weapon` at pawn `targetId`, standing adjacent to the armoured defender. */
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
    // A pawn holding a melee weapon (or nothing) has no ranged weapon.
    expect(getRangedWeapon(makeArcher({ equipment: {} } as Partial<Pawn>))).toBeNull();
  });

  it('picks matching ammo from inventory and ignores the wrong category', () => {
    const archer = makeArcher();
    expect(pickAmmo(archer, 'arrow')?.itemId).toBe('flint_arrow');
    expect(pickAmmo(archer, 'bolt')).toBeNull();
  });

  it('vision range follows perception (not the evaluateStat 1.0 fallback)', () => {
    expect(pawnVisionRange(makeArcher())).toBe(10);
    expect(pawnVisionRange(makeArcher({ stats: { ...stats, perception: 20 } } as Partial<Pawn>))).toBe(15);
  });

  it('accuracy falls off LINEARLY with distance and rewards the aim stat', () => {
    const near = rangedAccuracyMod(1.0, 0, 0, 2, 0);
    const far = rangedAccuracyMod(1.0, 0, 0, 8, 0);
    expect(near).toBeGreaterThan(far); // farther = less likely
    expect(near - far).toBeCloseTo((8 - 2) * 2.5, 5); // strictly linear in distance
    // A higher aim_accuracy stat lifts the whole curve; cover lowers it.
    expect(rangedAccuracyMod(1.4, 0, 0, 4, 0)).toBeGreaterThan(rangedAccuracyMod(1.0, 0, 0, 4, 0));
    expect(rangedAccuracyMod(1.0, 0, 0, 4, 0.2)).toBeLessThan(rangedAccuracyMod(1.0, 0, 0, 4, 0));
  });

  it('aim interval lengthens with distance and shortens with aim_speed', () => {
    expect(aimIntervalTicks(90, 1, 8, 1.0, 0, 1.0)).toBeGreaterThan(aimIntervalTicks(90, 1, 2, 1.0, 0, 1.0));
    expect(aimIntervalTicks(90, 1, 4, 1.5, 0, 1.0)).toBeLessThan(aimIntervalTicks(90, 1, 4, 1.0, 0, 1.0));
    expect(aimIntervalTicks(90, 3, 4, 1.0, 0, 1.0)).toBeGreaterThan(aimIntervalTicks(90, 1, 4, 1.0, 0, 1.0)); // crossbow span
  });

  it('reload_speed (DEX) shortens only a crossbow span — bows ignore it (the build fork)', () => {
    // reload 3 = crossbow: a defter loader (higher reload_speed) spans faster.
    expect(aimIntervalTicks(90, 3, 4, 1.0, 0, 1.4)).toBeLessThan(aimIntervalTicks(90, 3, 4, 1.0, 0, 0.8));
    // reload 1 = bow: no span step, so reload_speed makes no difference.
    expect(aimIntervalTicks(90, 1, 4, 1.0, 0, 1.4)).toBe(aimIntervalTicks(90, 1, 4, 1.0, 0, 0.8));
    // aim_speed (DEX) still governs the AIM portion regardless.
    expect(aimIntervalTicks(90, 3, 4, 1.5, 0, 1.0)).toBeLessThan(aimIntervalTicks(90, 3, 4, 1.0, 0, 1.0));
  });

  it('effective range scales weapon range by PER (aim_range), capped by vision', () => {
    const low = makeArcher({ stats: { ...stats, perception: 10 } } as Partial<Pawn>);
    const sharp = makeArcher({ stats: { ...stats, perception: 22 } } as Partial<Pawn>);
    const rw = getRangedWeapon(low)!;
    expect(effectiveRangedRange(sharp, rw)).toBeGreaterThan(effectiveRangedRange(low, rw));
    // Never exceeds the pawn's own vision range.
    expect(effectiveRangedRange(sharp, rw)).toBeLessThanOrEqual(pawnVisionRange(sharp));
  });

  it('sums aimBonuses across equipped gear', () => {
    const geared = makeArcher({
      equipment: {
        mainHand: { itemId: 'self_bow', durability: 80 },
        gloves: { itemId: 'archers_bracers', durability: 50 }, // speed 0.2
        back: { itemId: 'marksmans_cloak', durability: 60 } // range 1, accuracy 2
      }
    } as Partial<Pawn>);
    const b = sumAimBonuses(geared);
    expect(b.speed).toBeGreaterThan(0); // bracers
    expect(b.range).toBeGreaterThanOrEqual(2); // self_bow(1) + cloak(1)
    expect(b.accuracy).toBeGreaterThanOrEqual(5); // self_bow(3) + cloak(2)
  });

  it('routes thrown weapons to the OFF hand and bows to the main hand (one-handed hybrid)', () => {
    expect(isThrownWeaponProps(itemService.getItemById('throwing_spear')?.weaponProperties)).toBe(true);
    expect(getEquipmentSlot(itemService.getItemById('throwing_spear')!)).toBe('offHand');
    expect(getEquipmentSlot(itemService.getItemById('self_bow')!)).toBe('mainHand');
  });

  it('the SHOT damage comes from ammo × drawPower; the bow’s own damage is only its weak melee stave', () => {
    const bow = itemService.getItemById('self_bow')!.weaponProperties!;
    const warBow = itemService.getItemById('war_bow')!.weaponProperties!;
    // The launcher's `damage`/`damageType` is now its MELEE profile (a blunt stave) — small, and
    // IGNORED by the shot (buildRangedOverride replaces baseDamage with ammo × drawPower).
    expect(bow.damageType).toBe('blunt'); // melee stave, not the piercing shot
    expect(bow.damage).toBeLessThanOrEqual(6); // weak in melee
    expect(warBow.drawPower!).toBeGreaterThan(bow.drawPower!); // war bow drives the same arrow harder
    expect(itemService.getItemById('flint_arrow')!.ammoProperties!.damage!).toBeGreaterThan(0); // the arrow carries the kill
  });

  it('quivers route by ammo: arrows to the BACK (blocks a pack), bolts to the BELT (keeps it)', () => {
    expect(getEquipmentSlot(itemService.getItemById('leather_back_quiver')!)).toBe('back');
    expect(getEquipmentSlot(itemService.getItemById('leather_bolt_case')!)).toBe('belt');
    expect(itemService.getItemById('leather_back_quiver')!.quiver?.ammoCategory).toBe('arrow');
    expect(itemService.getItemById('leather_bolt_case')!.quiver?.ammoCategory).toBe('bolt');
    // Later-age quivers draw faster than earlier ones.
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
    const bare = makeArcher({ equipment: { mainHand: { itemId: 'self_bow' } } } as unknown as Partial<Pawn>);

    expect(drawSpeedModifier(quivered, 'arrow')).toBeCloseTo(0.25, 5); // ready quiver → fast
    expect(drawSpeedModifier(packed, 'arrow')).toBeLessThan(0); // arrows stowed in a pack → fumble
    expect(drawSpeedModifier(bare, 'arrow')).toBe(0); // on the belt / planted → neutral
    // Item-type specific: sling stones (and thrown) never take the pack penalty, need no quiver.
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
    expect(state.pawns[0].inventory.items.flint_arrow).toBeLessThan(20); // ammo consumed
  });

  it('auto-engage: a DRAFTED ranged pawn with ammo looses arrows at its target', () => {
    const archer = makeArcher({
      drafted: true,
      currentState: 'Idle',
      draftTarget: { type: 'attack', targetType: 'mob', targetId: 'g1' } // no mode → auto-ranged
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
    let state = makeState([archer], [makeGoblin()]); // goblin 3 tiles away (out of melee reach)
    for (let t = 0; t < 400; t++) state = combatService.tickCombat({ ...state, turn: t }, 16);
    // It refuses to shoot (force-melee) and can't reach (movement is the engine's job) → ammo intact.
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
    // Empty quiver + goblin adjacent (5,6): unlike a stocked bow (which bow-butts), the out-of-ammo
    // shooter holds and warns rather than auto-swinging the stave — it stays safe until told to melee.
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
    // Goblin adjacent (5,6): the bow can't fire into contact, so it swings as a blunt stave via the
    // NORMAL melee path (self_bow now authors melee damage=4/blunt) → a crush wound, not a puncture.
    let state = makeState([makeArcher()], [makeGoblin({ y: 6 })]);
    let bluntWound = false;
    for (let t = 0; t < 2000 && !bluntWound; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      const wounds = state.mobs![0].injuries ?? [];
      if (wounds.some((w) => w.type === 'crush')) bluntWound = true; // blunt → crush wound
    }
    expect(bluntWound).toBe(true);
  });

  it('armorDamage differentiates the archetypes: hammer ≫ mace ≫ … ≫ cleaver', () => {
    const ad = (id: string) => itemService.getItemById(id)!.weaponProperties!.armorDamage;
    expect(ad('steel_warhammer')!).toBeGreaterThan(ad('steel_mace')!); // hammer wrecks armour most
    expect(ad('steel_mace')!).toBeGreaterThan(ad('steel_cleaver')!); // mace dents, cleaver barely scratches
    expect(ad('steel_cleaver')!).toBeLessThanOrEqual(2); // a cleaver is made for flesh, not steel
  });

  it('a hammer strips a foe’s armour far faster than a cleaver (armour damage ≠ flesh damage)', () => {
    let h = makeState([makeMeleeAttacker('ha', 'steel_warhammer', 'hd'), makeArmored('hd')], []);
    for (let t = 0; t < 3000; t++) h = combatService.tickCombat({ ...h, turn: t }, 16);
    const hammerArmor = h.pawns.find((p) => p.id === 'hd')!.equipment.bodyMid!.durability!;

    let c = makeState([makeMeleeAttacker('ca', 'steel_cleaver', 'cd'), makeArmored('cd')], []);
    for (let t = 0; t < 3000; t++) c = combatService.tickCombat({ ...c, turn: t }, 16);
    const cleaverArmor = c.pawns.find((p) => p.id === 'cd')!.equipment.bodyMid!.durability!;

    expect(hammerArmor).toBeLessThan(cleaverArmor); // the hammer caves the plate; the cleaver leaves it
  });

  it('FINESSE: a rapier scales melee damage with PER (a sword scales with STR)', () => {
    const empty = makeState([], []);
    const defender = makeGoblin({ stats: { ...stats, dexterity: 2 } }); // low dodge → hits land
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
    // Rapier (finesse): high PER massively out-damages low PER at the SAME strength.
    expect(avgDmg('steel_rapier', { strength: 10, perception: 20 })).toBeGreaterThan(
      avgDmg('steel_rapier', { strength: 10, perception: 4 }) * 1.4
    );
    // Longsword (not finesse): PER barely matters (only a little crit); STR is the driver.
    const swHiPer = avgDmg('steel_longsword', { strength: 10, perception: 20 });
    const swLoPer = avgDmg('steel_longsword', { strength: 10, perception: 4 });
    expect(Math.abs(swHiPer - swLoPer) / swHiPer).toBeLessThan(0.2);
    expect(avgDmg('steel_longsword', { strength: 20, perception: 10 })).toBeGreaterThan(
      avgDmg('steel_longsword', { strength: 5, perception: 10 }) * 1.4
    );
  });

  it('daggers are fast, crit-heavy and inaccurate; specialists are iron+ gated', () => {
    const wp = (id: string) => itemService.getItemById(id)!.weaponProperties!;
    expect(wp('steel_stiletto').attackSpeed).toBeGreaterThan(1.3); // very fast
    expect(wp('steel_stiletto').critMod!).toBeGreaterThan(0.1); // crit-heavy
    expect(wp('iron_rondel').accuracy!).toBeLessThanOrEqual(0); // no accuracy bonus
    // The specialists never appear at bronze — gated by research on their recipe (iron at the
    // earliest, the rest at steel).
    const research = (id: string) => recipeService.getRecipeForItem(id)?.researchRequired;
    for (const id of ['iron_warhammer', 'iron_greatsword', 'iron_estoc'])
      expect(research(id)).toBe('iron_working');
    for (const id of ['steel_cleaver', 'steel_flail', 'steel_rapier'])
      expect(research(id)).toBe('steel_making');
  });

  it('classifies the melee GRIP from the hands (2H / shield / duelist / one-handed)', () => {
    const twoH = makeArcher(); // self_bow is twoHanded
    const duelist = makeArcher({
      equipment: { mainHand: { itemId: 'bone_knife' } }
    } as unknown as Partial<Pawn>);
    const shield = makeArcher({
      equipment: { mainHand: { itemId: 'bone_knife' }, offHand: { itemId: 'rawhide_round_shield' } }
    } as unknown as Partial<Pawn>);
    const dualWield = makeArcher({
      equipment: { mainHand: { itemId: 'bone_knife' }, offHand: { itemId: 'bone_knife' } }
    } as unknown as Partial<Pawn>);
    expect(getGrip(twoH)).toBe('twoHanded');
    expect(getGrip(duelist)).toBe('duelist'); // 1H + free off-hand
    expect(getGrip(shield)).toBe('shield');
    expect(getGrip(dualWield)).toBe('oneHanded'); // off-hand occupied, not a shield
  });

  it('combat wears equipment: a weapon loses condition as it lands blows', () => {
    const fighter = makeArcher({
      equipment: { mainHand: { itemId: 'bone_knife', durability: 60 } }
    } as unknown as Partial<Pawn>);
    let state = makeState([fighter], [makeGoblin({ y: 6 })]); // goblin adjacent + passive → the pawn lands hits
    for (let t = 0; t < 2000; t++) state = combatService.tickCombat({ ...state, turn: t }, 16);
    expect(state.pawns[0].equipment.mainHand!.durability).toBeLessThan(60); // every landed blow chips it
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
      if ((state.mobs![0].injuries ?? []).some((w) => w.type === 'cut')) cut = true; // cutting → cut wound
    }
    expect(cut).toBe(true);
  });

  it('hybrid: a melee main-hand + off-hand throwing spear throws at range, melees up close', () => {
    // Sword (bone_knife) main-hand + throwing_spear off-hand — getRangedWeapon finds the off-hand
    // thrown weapon, and the melee main-hand suppresses the bow-butt.
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

    // Mob 3 tiles away (spear range 4) → it throws; thrown weapons need no ammo stack. Thrown
    // self-consume: the spear leaves the off-hand on the throw and lands as a recoverable drop.
    let state = makeState([hybrid], [makeGoblin()]);
    let threw = false;
    for (let t = 0; t < 2000 && !threw; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      if (!state.pawns[0].equipment?.offHand) threw = true; // spear left the hand
    }
    expect(threw).toBe(true);
    // the thrown spear dropped (recoverable) rather than vanishing
    expect((state.droppedItems ?? []).some((d) => d.resourceId === 'throwing_spear')).toBe(true);
  });
});
