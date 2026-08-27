import { describe, it, expect } from 'vitest';
import { combatService, partArmorReduction } from '$lib/game/systems/Combat';
import { healWounds } from '$lib/game/systems/PawnStateMachine';
import { tendPatient } from '$lib/game/services/jobs/caretake';
import { CREATURES } from '$lib/game/core/defs/creatures';
import { createBodyPlanLimbs, organsOf, PART_DEF_MAP } from '$lib/game/core/defs/bodyParts';
import { itemService } from '$lib/game/services/ItemService';
import { recipeService } from '$lib/game/services/RecipeService';
import type { DamageType, GameState, Injury, Mob, Pawn } from '$lib/game/core/types';

const stats = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  perception: 10,
  charisma: 10
};

const weakStats = { ...stats, strength: 5, dexterity: 20 };

function makePawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Wren',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Fighting',
    stats: { ...stats, dexterity: 20 },
    traits: [],
    equipment: {},
    limbs: [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      { id: 'torso', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_leg', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_leg', health: 100, bleedRate: 0, parts: [] }
    ],
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
    state: 'Attacking',
    stateSince: 0,
    isAlive: true,
    x: 5,
    y: 6,
    health: 35,
    maxHealth: 35,
    stats: { ...stats, dexterity: 4 },
    traits: [],
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    limbs: [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      { id: 'torso', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_leg', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_leg', health: 100, bleedRate: 0, parts: [] }
    ],
    injuries: [],
    conditions: [],
    pain: 0,
    needs: { hunger: 0, fatigue: 0 },
    ...(over as object)
  } as unknown as Mob;
}

function makeState(pawns: Pawn[], mobs: Mob[]): GameState {
  return { turn: 0, pawns, mobs, worldMap: [] } as unknown as GameState;
}

describe('combat sim (headless tickCombat)', () => {
  it('an undrafted Fighting pawn swings back at an adjacent hostile', () => {
    let state = makeState([makePawn()], [makeGoblin({ state: 'Wander' })]);
    let mobInjured = false;
    for (let t = 0; t < 1500 && !mobInjured; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      if ((state.mobs![0].injuries?.length ?? 0) > 0) mobInjured = true;
    }
    expect(mobInjured).toBe(true);
  });

  it('a wounded charger (chargesWhenWounded) retaliates against its attacker — the mammoth bug', () => {
    let state = makeState([makePawn()], [makeGoblin({ creatureId: 'boar', state: 'Wander' })]);
    let retaliated = false;
    for (let t = 0; t < 1500 && !retaliated; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const m = state.mobs![0];
      if (m.state === 'Attacking' && m.huntTargetId === 'p1') retaliated = true;
    }
    expect(retaliated).toBe(true);
  });

  it('a non-charger (no chargesWhenWounded) is NOT flipped into combat by a hit — the gate holds', () => {
    let state = makeState([makePawn({ stats: weakStats })], [makeGoblin({ state: 'Wander' })]);
    for (let t = 0; t < 400; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      expect(state.mobs![0].huntTargetId).toBeUndefined();
    }
  });

  it('part damage accumulates and a sustained beating DOWNS a mob via pain collapse (not instant death)', () => {
    let state = makeState([makePawn({ stats: weakStats })], [makeGoblin({ state: 'Wander' })]);
    let accumulated = false;
    let maxPain = 0;
    let downed = false;
    for (let t = 0; t < 12000 && !downed; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const g = state.mobs![0];
      maxPain = Math.max(maxPain, g.pain ?? 0);
      const lost = (g.limbs ?? []).reduce(
        (s, l) => s + (l.parts ?? []).reduce((ps, p) => ps + (p.maxHp - p.health), 0),
        0
      );
      if (lost > 15) accumulated = true;
      if (g.state === 'Collapsed') downed = true;
      expect(g.isAlive).not.toBe(false);
    }
    expect(accumulated).toBe(true);
    expect(downed).toBe(true);
    expect(maxPain).toBeGreaterThan(30);
  });

  it('a near-collapse (low-blood) mob takes a light blow and DOWNS, never instant-dies (the 3-dmg-punch regression)', () => {
    const shocked = makeGoblin({ state: 'Wander', bloodVolume: 22, pain: 40 });
    let state = makeState([makePawn({ stats: weakStats })], [shocked]);
    let sawCollapsed = false;
    for (let t = 0; t < 600; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const g = state.mobs![0];
      if (g.state === 'Collapsed') sawCollapsed = true;
      expect(g.isAlive).not.toBe(false);
      expect(g.state).not.toBe('Corpse');
    }
    expect(sawCollapsed).toBe(true);
  });

  it('tickCombat leaves its INPUT state arrays/objects intact (status-change diff stays valid)', () => {
    let state = makeState([makePawn({ stats: weakStats })], [makeGoblin({ state: 'Wander' })]);
    let validated = false;
    for (let t = 0; t < 12000 && !validated; t++) {
      const input = { ...state, turn: t };
      const inputMobs = input.mobs!;
      const inputMob = inputMobs[0];
      const upBefore = inputMob.state !== 'Collapsed';
      const result = combatService.tickCombat(input, 16);
      const resultMob = result.mobs![0];
      if (upBefore && resultMob.state === 'Collapsed') {
        expect(result.mobs).not.toBe(inputMobs);
        expect(input.mobs![0]).toBe(inputMob);
        expect(inputMob.state).not.toBe('Collapsed');
        validated = true;
      }
      state = result;
    }
    expect(validated).toBe(true);
  });

  it('an Attacking mob damages the adjacent pawn', () => {
    const target = makePawn({ currentState: 'Idle', stats: { ...stats, dexterity: 3 } });
    let state = makeState([target], [makeGoblin({ stats: { ...stats, dexterity: 16 } })]);
    let pawnInjured = false;
    for (let t = 0; t < 1500 && !pawnInjured; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      if ((state.pawns[0].injuries?.length ?? 0) > 0) pawnInjured = true;
    }
    expect(pawnInjured).toBe(true);
  });

  it('rolls between a pawn’s natural weapons (fists/kick) with per-weapon stamina', () => {
    const attacker = makePawn();
    const defender = makeGoblin({ stats: { ...stats, dexterity: 2 } });
    const empty = makeState([], []);
    const seen = new Set<string>();
    const staminaByWeapon = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const r = combatService.resolveHit(attacker, defender, empty);
      seen.add(r.weaponId);
      staminaByWeapon.set(r.weaponId, r.staminaCost);
    }
    expect(seen.has('fists')).toBe(true);
    expect(seen.has('kick')).toBe(true);
    expect(staminaByWeapon.get('kick')!).toBeGreaterThan(staminaByWeapon.get('fists')!);
  });

  it('lands critical hits for a high-crit attacker (stat + weapon critMod)', () => {
    const attacker = makePawn({ stats: { ...stats, dexterity: 22, perception: 22 } });
    const defender = makeGoblin({ stats: { ...stats, dexterity: 1 } });
    const empty = makeState([], []);
    let crits = 0;
    let hits = 0;
    for (let i = 0; i < 500; i++) {
      const r = combatService.resolveHit(attacker, defender, empty);
      if (r.hit) hits++;
      if (r.crit) crits++;
    }
    expect(hits).toBeGreaterThan(0);
    expect(crits).toBeGreaterThan(0);
  });

  it('a blow lands a DOUBLE wound whose flesh and bone depths are INDEPENDENT (blunt cracks bone, blades rarely do)', () => {
    const attacker = makePawn({ stats: { ...stats, strength: 22, dexterity: 20 } });
    const defender = makeGoblin({ stats: { ...stats, dexterity: 1 } });
    const empty = makeState([], []);
    let bluntHits = 0;
    let cutHits = 0;
    let bluntFractures = 0;
    let cutFractures = 0;
    let fractures = 0;
    let diverged = 0;
    for (let i = 0; i < 3000; i++) {
      const r = combatService.resolveHit(attacker, defender, empty);
      if (!r.hit) continue;
      const isBlunt = r.damageType === 'blunt';
      if (isBlunt) bluntHits++;
      else if (r.damageType === 'cutting') cutHits++;
      if (r.fractureInjury) {
        fractures++;
        if (isBlunt) bluntFractures++;
        else if (r.damageType === 'cutting') cutFractures++;
        if (r.injury && r.fractureInjury.damage !== r.injury.damage) diverged++;
      }
    }
    expect(fractures).toBeGreaterThan(20);
    expect(diverged / fractures).toBeGreaterThan(0.8);
    expect(bluntFractures / Math.max(1, bluntHits)).toBeGreaterThan(
      cutFractures / Math.max(1, cutHits)
    );
  });

  it('organsOf lists a cavity’s internal organs, and nothing for a part with none', () => {
    expect(organsOf('abdomen')).toEqual(
      expect.arrayContaining(['leftKidney', 'rightKidney', 'liver', 'stomach'])
    );
    expect(organsOf('chest')).toEqual(expect.arrayContaining(['heart', 'leftLung', 'rightLung']));
    expect(organsOf('chest')).not.toContain('ribcage');
    expect(organsOf('leftForearm')).toEqual([]);
    expect(organsOf('leftHand')).toEqual([]);
  });

  it('a deep blow can reach an organ inside a cavity — penetrating finds them, blunt rarely ruptures', () => {
    const empty = makeState([], []);
    function organStats(weaponId: string) {
      const attacker = makePawn({
        stats: { ...stats, strength: 22, dexterity: 20 },
        limbs: createBodyPlanLimbs('humanoid', 1),
        equipment: { mainHand: { itemId: weaponId, instanceId: 'w1', durability: 100 } }
      });
      const defender = makePawn({
        id: 'def',
        stats: { ...stats, dexterity: 1 },
        limbs: createBodyPlanLimbs('humanoid', 1)
      });
      let hits = 0;
      let organ = 0;
      let misTargeted = 0;
      for (let i = 0; i < 4000; i++) {
        const r = combatService.resolveHit(attacker, defender, empty);
        if (!r.hit) continue;
        hits++;
        if (r.organInjury) {
          organ++;
          if (PART_DEF_MAP[r.organInjury.bodyPart]?.containedIn !== r.bodyPart) misTargeted++;
        }
      }
      return { hits, organ, misTargeted };
    }
    const pen = organStats('stone_chopper');
    const blunt = organStats('stone_club');

    expect(pen.organ).toBeGreaterThan(0);
    expect(pen.misTargeted).toBe(0);
    expect(blunt.misTargeted).toBe(0);
    expect(pen.organ / Math.max(1, pen.hits)).toBeGreaterThan(
      blunt.organ / Math.max(1, blunt.hits)
    );
  });

  it('melee lands a sane ~60% at parity (no more ~80% dodge whiff-slog)', () => {
    const attacker = makePawn({ id: 'atk', stats: { ...stats, dexterity: 10 } });
    const defender = makePawn({ id: 'def', stats: { ...stats, dexterity: 10 } });
    const empty = makeState([], []);
    let hits = 0;
    for (let i = 0; i < 1000; i++)
      if (combatService.resolveHit(attacker, defender, empty).hit) hits++;
    const rate = hits / 1000;
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.8);
  });

  it('§121 per-part armor: a covered part is mitigated, an UNCOVERED part bypasses (same pawn, one cuirass)', async () => {
    const { coversPart } = await import('$lib/game/core/rules/gear/armorCoverage');
    const { itemService } = await import('$lib/game/services/ItemService');
    const cuirass = itemService.getItemById('plate_cuirass')!;
    const empty = makeState([], []);
    const attacker = makePawn({ stats: { ...stats, strength: 22, dexterity: 20 }, limbs: createBodyPlanLimbs('humanoid', 1) });
    const defender = makePawn({
      id: 'def',
      stats: { ...stats, dexterity: 1 },
      limbs: createBodyPlanLimbs('humanoid', 1),
      equipment: { bodyOuter: { itemId: 'plate_cuirass', instanceId: 'a1', durability: 100 } }
    });
    let covD = 0;
    let covN = 0;
    let unD = 0;
    let unN = 0;
    for (let i = 0; i < 5000; i++) {
      const r = combatService.resolveHit(attacker, defender, empty);
      if (!r.hit || !r.bodyPart) continue;
      if (coversPart(cuirass, 'bodyOuter', r.bodyPart)) {
        covD += r.damage;
        covN++;
      } else {
        unD += r.damage;
        unN++;
      }
    }
    const covAvg = covD / Math.max(1, covN);
    const unAvg = unD / Math.max(1, unN);
    // eslint-disable-next-line no-console
    console.log(`[GEAR per-part] covered avg=${covAvg.toFixed(1)} (n=${covN}) vs uncovered avg=${unAvg.toFixed(1)} (n=${unN})`);
    expect(covN, 'some blows landed on the covered torso').toBeGreaterThan(20);
    expect(unN, 'some blows landed on uncovered limbs').toBeGreaterThan(20);
    expect(covAvg, 'the covered part takes clearly less than an uncovered one — armour is per-part').toBeLessThan(unAvg * 0.85);
  });

  it('armour-resistance-fields-dead: slashResistance/pierceResistance/crushResistance mitigate their matching damage type more than an unmatched one', () => {
    const defender = makePawn({
      id: 'armored',
      limbs: createBodyPlanLimbs('humanoid', 1),
      equipment: { bodyOuter: { itemId: 'plate_cuirass', instanceId: 'a1', durability: 300 } }
    });
    // plate_cuirass: defense 30, slashResistance 0.3, pierceResistance 0.25, crushResistance 0.15
    const rawDamage = 40;
    const reduction = (damageType: DamageType) =>
      partArmorReduction(defender, 'chest', 0, rawDamage, damageType);
    const cutting = reduction('cutting');
    const piercing = reduction('piercing');
    const blunt = reduction('blunt');
    const fire = reduction('fire');
    expect(cutting, 'slashResistance (0.3) mitigates a cutting hit the most').toBeGreaterThan(
      piercing
    );
    expect(
      piercing,
      'pierceResistance (0.25) mitigates more than crushResistance (0.15)'
    ).toBeGreaterThan(blunt);
    expect(
      fire,
      'fire has no matching armorProperties field, so it falls back to defense alone (below crushResistance, the smallest of the three)'
    ).toBeLessThan(blunt);
  });

  it('§Q quality flows into combat: a Masterwork blade hits harder than a Crude one (resolveHit)', () => {
    const empty = makeState([], []);
    const avgDamage = (quality: 0 | 4) => {
      const attacker = makePawn({
        stats: { ...stats, strength: 18, dexterity: 20 },
        limbs: createBodyPlanLimbs('humanoid', 1),
        equipment: { mainHand: { itemId: 'steel_longsword', instanceId: 'w1', durability: 100, quality } }
      });
      const defender = makePawn({ id: 'def', stats: { ...stats, dexterity: 1 }, limbs: createBodyPlanLimbs('humanoid', 1) });
      let dmg = 0;
      let hits = 0;
      for (let i = 0; i < 3000; i++) {
        const r = combatService.resolveHit(attacker, defender, empty);
        if (r.hit) {
          dmg += r.damage;
          hits++;
        }
      }
      return dmg / Math.max(1, hits);
    };
    const crude = avgDamage(0);
    const masterwork = avgDamage(4);
    // eslint-disable-next-line no-console
    console.log(`[SKILL downstream/combat] steel_longsword avg hit: crude=${crude.toFixed(1)} masterwork=${masterwork.toFixed(1)}`);
    expect(masterwork, 'a Masterwork blade lands harder blows than a Crude one').toBeGreaterThan(crude + 3);
  });

  it('SHARPNESS coating multiplies bleed on a cutting weapon but CANNOT bleed a maul (§C)', () => {
    const empty = makeState([], []);
    const bloodlettingRate = (weaponId: string, coated: boolean) => {
      const attacker = makePawn({
        stats: { ...stats, strength: 22, dexterity: 20 },
        limbs: createBodyPlanLimbs('humanoid', 1),
        equipment: {
          mainHand: {
            itemId: weaponId,
            instanceId: 'w1',
            durability: 100,
            ...(coated ? { coating: { itemId: 'razors_grace', expiresAtTurn: 1_000_000 } } : {})
          }
        }
      });
      const defender = makePawn({ id: 'def', stats: { ...stats, dexterity: 1 }, limbs: createBodyPlanLimbs('humanoid', 1) });
      let hits = 0;
      let bled = 0;
      for (let i = 0; i < 4000; i++) {
        const r = combatService.resolveHit(attacker, defender, empty);
        if (!r.hit || !r.injury) continue;
        hits++;
        if (r.injury.bloodletting) bled++;
      }
      return bled / Math.max(1, hits);
    };
    const swordBare = bloodlettingRate('steel_longsword', false);
    const swordKeen = bloodlettingRate('steel_longsword', true);
    const maulBare = bloodlettingRate('great_bone_maul', false);
    const maulKeen = bloodlettingRate('great_bone_maul', true);
    // eslint-disable-next-line no-console
    console.log(`[SHARP] sword bleed-rate bare=${swordBare.toFixed(2)} keen=${swordKeen.toFixed(2)}; maul bare=${maulBare.toFixed(2)} keen=${maulKeen.toFixed(2)}`);
    expect(swordKeen, 'honing oil raises a cutting weapon\'s non-clotting-wound rate').toBeGreaterThan(swordBare + 0.1);
    expect(maulBare, 'a maul never leaves a non-clotting wound').toBe(0);
    expect(maulKeen, 'and the sharpest oil cannot make a maul bleed like a blade').toBe(0);
  });

  it('a Hunting pawn attacks its marked quarry even though the prey is neutral', () => {
    const hunter = makePawn({ currentState: 'Hunting', huntTargetId: 'deer1' });
    const prey = makeGoblin({
      id: 'deer1',
      entityClass: 'animal',
      state: 'Wander',
      markedForHunt: true,
      stats: { ...stats, dexterity: 2 }
    });
    let state = makeState([hunter], [prey]);
    let downed = false;
    for (let t = 0; t < 12000 && !downed; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const d = state.mobs![0];
      if (d.state === 'Collapsed' || d.isAlive === false || d.state === 'Corpse') downed = true;
    }
    expect(downed).toBe(true);
  });

  it('a drafted pawn with NO attack order auto-engages an adjacent hostile (NT-4)', () => {
    const guard = makePawn({ drafted: true, draftTarget: undefined, currentState: 'Idle' });
    const goblin = makeGoblin({ state: 'Attacking', stats: { ...stats, dexterity: 2 } });
    let state = makeState([guard], [goblin]);
    let goblinDamaged = false;
    for (let t = 0; t < 4000 && !goblinDamaged; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
      const g = state.mobs![0];
      const hpLost = (g.limbs ?? []).reduce(
        (s, l) => s + (l.parts ?? []).reduce((ps, p) => ps + (p.maxHp - p.health), 0),
        0
      );
      if (hpLost > 0 || g.isAlive === false || g.state === 'Corpse') goblinDamaged = true;
    }
    expect(goblinDamaged).toBe(true);
  });

  it('a winded entity cannot attack — it passes turns instead (stamina gate)', () => {
    const winded = makePawn({
      currentState: 'Fighting',
      stamina: 0,
      maxStamina: 50,
      conditionTimers: { winded: 2 }
    });
    const goblin = makeGoblin({ state: 'Wander', stats: { ...stats, dexterity: 1 } });
    let state = makeState([winded], [goblin]);
    for (let t = 0; t < 10; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
    }
    const g = state.mobs![0];
    const hpLost = (g.limbs ?? []).reduce(
      (s, l) => s + (l.parts ?? []).reduce((ps, p) => ps + (p.maxHp - p.health), 0),
      0
    );
    expect(hpLost).toBe(0);
    expect((state.pawns[0].conditionTimers?.winded ?? 0) > 0).toBe(true);
  });

  it('a winded entity recovers stamina each turn and un-winds at full', () => {
    const winded = makePawn({
      currentState: 'Idle',
      stamina: 0,
      maxStamina: 1,
      conditionTimers: { winded: 2 }
    });
    let state = makeState([winded], []);
    for (let t = 0; t < 40; t++) {
      state = { ...state, turn: t };
      state = combatService.tickCombat(state, 16);
    }
    const p = state.pawns[0];
    expect(p.stamina).toBe(1);
    expect(p.conditionTimers?.winded ?? 0).toBe(0);
    expect(p.transientConditions ?? []).not.toContain('winded');
  });
});

describe('wound system (stacking + healing)', () => {
  const crush = (dmg: number): Injury => ({
    bodyPart: 'leftLittleFinger',
    type: 'crush',
    severity: 'minor',
    damage: dmg,
    bleeding: 0,
    painContribution: 0,
    infected: false
  });

  it('stacks same-type hits into one escalating wound (not five entries)', () => {
    let state = makeState([], [makeGoblin()]);
    for (let i = 0; i < 5; i++) {
      state = combatService.applyInjuryToMob('g1', crush(2), state);
    }
    const finger = state
      .mobs![0].limbs!.find((l) => l.id === 'left_arm')!
      .parts!.find((p) => p.id === 'leftLittleFinger')!;
    expect(finger.injuries).toHaveLength(1);
    expect(finger.injuries[0].type).toBe('crush');
    expect(finger.injuries[0].severity).toBe('destroyed');
    expect(state.mobs![0].pain ?? 0).toBeGreaterThan(0);
  });

  it('keeps different damage types as separate wounds on the same part', () => {
    let state = makeState([], [makeGoblin()]);
    state = combatService.applyInjuryToMob('g1', crush(2), state);
    state = combatService.applyInjuryToMob('g1', { ...crush(2), type: 'cut' }, state);
    const finger = state
      .mobs![0].limbs!.find((l) => l.id === 'left_arm')!
      .parts!.find((p) => p.id === 'leftLittleFinger')!;
    expect(finger.injuries.map((w) => w.type).sort()).toEqual(['crush', 'cut']);
  });

  it('tended wounds heal faster than untended ones (treatment quality)', () => {
    let state = makeState([makePawn({ currentState: 'Idle' })], []);
    state = combatService.applyInjury('p1', { ...crush(20), bodyPart: 'chest' }, state);
    state = combatService.applyInjury('p1', { ...crush(20), bodyPart: 'leftUpperLeg' }, state);
    const pawn: Pawn = {
      ...state.pawns[0],
      limbs: state.pawns[0].limbs!.map((l) => ({
        ...l,
        parts: (l.parts ?? []).map((p) =>
          p.id === 'chest'
            ? {
                ...p,
                injuries: p.injuries.map((w) => ({ ...w, treatedAt: 0, treatmentQuality: 0.8 }))
              }
            : p
        )
      }))
    };
    const woundDmg = (pw: Pawn, partId: string) =>
      pw.limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === partId)!.injuries[0].damage;
    const chestBefore = woundDmg(pawn, 'chest');
    const legBefore = woundDmg(pawn, 'leftUpperLeg');
    const healed = healWounds(pawn, 1);
    expect(chestBefore - woundDmg(healed, 'chest')).toBeGreaterThan(
      legBefore - woundDmg(healed, 'leftUpperLeg')
    );
  });

  it('tending consumes the best medicine and boosts treatment quality', () => {
    let state = makeState([makePawn({ currentState: 'Sleeping' })], []) as GameState;
    state = combatService.applyInjury('p1', { ...crush(20), bodyPart: 'chest' }, state);
    state = {
      ...state,
      buildings: [{ id: 'bed1', type: 'hay_bed', x: 5, y: 5, status: 'complete', progress: 1 }],
      stockpile: { chewed_poultice: 1 },
      stockpileZones: [
        {
          id: 'z1',
          name: 'med',
          tiles: [],
          filter: { allowedCategories: [], blockedItems: [] },
          inventory: { chewed_poultice: 1 }
        }
      ]
    } as unknown as GameState;

    const after = tendPatient(state.pawns[0], state.pawns[0], state);
    const wound = after.pawns[0].limbs!.flatMap((l) => l.parts ?? []).find((p) => p.id === 'chest')!
      .injuries[0];
    expect(wound.treatmentQuality ?? 0).toBeGreaterThanOrEqual(0.5);
    expect(wound.treatedAt).toBeDefined();
    expect(after.stockpile.chewed_poultice ?? 0).toBe(0);
  });

  const sever = (bodyPart: string): Injury => ({
    bodyPart,
    type: 'cut',
    severity: 'minor',
    damage: 999,
    bleeding: 0,
    painContribution: 0,
    infected: false
  });
  const torsoPart = (pawn: Pawn, id: string) =>
    pawn.limbs!.find((l) => l.id === 'torso')!.parts!.find((p) => p.id === id)!;

  it('severing the abdomen takes the organs it contains — and the pawn lingers (cascade only)', () => {
    let state = makeState([makePawn({ limbs: createBodyPlanLimbs('humanoid', 1) })], []);
    state = combatService.applyInjury('p1', sever('abdomen'), state);
    const pawn = state.pawns[0];
    expect(torsoPart(pawn, 'abdomen').isMissing).toBe(true);
    for (const organ of ['liver', 'stomach', 'leftKidney', 'rightKidney']) {
      expect(torsoPart(pawn, organ).isMissing).toBe(true);
      expect(torsoPart(pawn, organ).health).toBe(0);
    }
    expect(pawn.isAlive).not.toBe(false);
    expect(torsoPart(pawn, 'heart').isMissing).toBe(false);
  });

  it('caving in the chest cascades to heart+lungs and is lethal', () => {
    let state = makeState([makePawn({ limbs: createBodyPlanLimbs('humanoid', 1) })], []);
    state = combatService.applyInjury('p1', sever('chest'), state);
    const pawn = state.pawns[0];
    expect(torsoPart(pawn, 'heart').isMissing).toBe(true);
    expect(torsoPart(pawn, 'leftLung').isMissing).toBe(true);
    expect(pawn.isAlive).toBe(false);
  });

  it('a chest driven to 0 HP by MIXED wound types still guts the organs (no single wound severed it)', () => {
    const chestHp = 80;
    let state = makeState([makePawn({ limbs: createBodyPlanLimbs('humanoid', 1) })], []);
    state = combatService.applyInjury('p1', { ...crush(chestHp * 0.6), bodyPart: 'chest' }, state);
    state = combatService.applyInjury(
      'p1',
      { ...crush(chestHp * 0.6), type: 'puncture', bodyPart: 'chest' },
      state
    );
    const pawn = state.pawns[0];
    const chest = torsoPart(pawn, 'chest');
    expect(chest.health).toBeLessThanOrEqual(0);
    expect(chest.isMissing).toBe(false);
    expect(torsoPart(pawn, 'heart').health).toBe(0);
    expect(torsoPart(pawn, 'leftLung').isMissing).toBe(true);
    expect(pawn.isAlive).toBe(false);
  });

  it('the poultice recipe and medicine items are well-formed', () => {
    const herb = itemService.getItemById('woundwort');
    const poultice = itemService.getItemById('chewed_poultice');
    expect(herb?.medicineQuality).toBeGreaterThan(0);
    expect(poultice?.medicineQuality).toBeGreaterThan(herb!.medicineQuality!);
    const recipe = recipeService.getRecipeForItem('chewed_poultice');
    expect(recipe?.inputs?.woundwort).toBeGreaterThan(0);
  });

  it('wounds heal over time, restoring HP and lowering pain to zero', () => {
    let state = makeState([makePawn({ currentState: 'Sleeping' })], []);
    state = combatService.applyInjury('p1', { ...crush(1), bodyPart: 'chest' }, state);
    let pawn = state.pawns[0];
    expect(pawn.pain ?? 0).toBeGreaterThan(0);
    expect((pawn.injuries ?? []).length).toBe(1);
    for (let i = 0; i < 200000 && (pawn.injuries?.length ?? 0) > 0; i++) pawn = healWounds(pawn);
    expect(pawn.injuries ?? []).toHaveLength(0);
    expect(pawn.pain).toBe(0);
  });
});

describe('natural-weapon data contract', () => {
  it('every creature natural-weapon id resolves to a natural_weapon item', () => {
    for (const creature of CREATURES) {
      for (const id of creature.naturalWeapons) {
        const item = itemService.getItemById(id);
        expect(item, `${creature.id} references missing weapon '${id}'`).toBeDefined();
        expect(item!.category, `'${id}' should be a natural_weapon`).toBe('natural_weapon');
        expect(item!.weaponProperties, `'${id}' needs weaponProperties`).toBeDefined();
      }
    }
  });

  it('pawn default attacks (fists/kick) exist as natural_weapon items', () => {
    for (const id of ['fists', 'kick']) {
      const item = itemService.getItemById(id);
      expect(item?.category).toBe('natural_weapon');
      expect(item?.weaponProperties?.damageType).toBeDefined();
    }
  });
});
