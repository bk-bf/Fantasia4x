import { describe, it, expect, beforeEach } from 'vitest';
import { combatService, type HitResult } from '$lib/game/systems/Combat';
import { createBodyPlanLimbs } from '$lib/game/core/defs/bodyParts';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, ItemInstance, Mob, Pawn } from '$lib/game/core/types';

const base = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  perception: 10,
  charisma: 10
};

beforeEach(() => rng.reseed(5));

function body(id: string, s: Partial<typeof base> = {}, over: Partial<Pawn> = {}): Pawn {
  return {
    id,
    name: id,
    isAlive: true,
    position: { x: 5, y: id === 'a' ? 5 : 6 },
    currentState: 'Fighting',
    stats: { ...base, ...s },
    traits: [],
    equipment: {},
    limbs: createBodyPlanLimbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    needs: { hunger: 0, fatigue: 0 },
    ...(over as object)
  } as unknown as Pawn;
}

function wolf(over: Partial<Mob> = {}): Mob {
  return {
    id: 'w1',
    creatureId: 'wolf',
    entityClass: 'animal',
    state: 'Attacking',
    stateSince: 1,
    isAlive: true,
    x: 5,
    y: 6,
    stats: { ...base },
    traits: [],
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    limbs: createBodyPlanLimbs('quadruped', 30),
    injuries: [],
    conditions: [],
    pain: 0,
    needs: { hunger: 0, fatigue: 0 },
    ...(over as object)
  } as unknown as Mob;
}

const world = (pawns: Pawn[], mobs: Mob[] = [], turn = 1) =>
  ({ turn, pawns, mobs, worldMap: [] }) as unknown as GameState;

function rolls(att: Pawn, def: Pawn, guaranteed: boolean, n = 2000): HitResult[] {
  rng.reseed(5);
  const state = world([att, def], [], 0);
  return Array.from({ length: n }, () =>
    combatService.resolveHit(att, def, state, undefined, guaranteed)
  );
}

const shield = (itemId: string) => ({ itemId, quantity: 1 }) as unknown as ItemInstance;
const woundsOf = (e: Pawn | Mob) =>
  (e.limbs ?? []).reduce(
    (s, l) => s + (l.parts ?? []).reduce((t, p) => t + p.injuries.length, 0),
    0
  );

describe('resolveHit rules', () => {
  it('blunt resistance from constitution lowers the damage a guaranteed blunt blow deals', () => {
    const att = body('a', { strength: 30 });
    const blunt = (hs: HitResult[]) => hs.filter((h) => h.damageType === 'blunt');
    const avg = (hs: HitResult[]) => hs.reduce((s, h) => s + h.damage, 0) / hs.length;
    const soft = blunt(rolls(att, body('d', { constitution: 10 }), true));
    const hard = blunt(rolls(att, body('d', { constitution: 40 }), true));
    expect(avg(hard)).toBeLessThan(avg(soft) * 0.9);
  });

  it('heavy blunt blows on a frail defender sometimes knock it down', () => {
    const hits = rolls(body('a', { strength: 40 }), body('d', { constitution: 3 }), true);
    expect(hits.filter((h) => h.knockdown).length).toBeGreaterThan(0);
  });

  it('a swing at a defender who cannot dodge still misses about one time in twenty', () => {
    const hs = rolls(
      body('a', { dexterity: 20, perception: 20 }),
      body('d', {}, { transientConditions: ['collapse'] }),
      false
    );
    const misses = hs.filter((h) => !h.hit && !h.blocked && !h.parried).length / hs.length;
    expect(misses).toBeGreaterThan(0.03);
    expect(misses).toBeLessThan(0.08);
  });

  it('a blow that lands always deals at least one point of damage', () => {
    const hs = rolls(
      body('a', { strength: 1, dexterity: 1 }, { transientConditions: ['fouled_guard'] }),
      body('d', { constitution: 40 }),
      true
    );
    expect(hs.every((h) => h.damage >= 1)).toBe(true);
  });

  it('a shield blocks a ranged shot half as often as a melee blow of the same force', () => {
    const def = body(
      'd',
      {},
      { equipment: { offHand: shield('iron_boss_shield') } as Pawn['equipment'] }
    );
    const blockChance = (
      combatService as unknown as {
        blockChance(d: Pawn, ranged: boolean, incoming: number): number;
      }
    ).blockChance.bind(combatService);
    const melee = blockChance(def, false, 6);
    expect(melee).toBeGreaterThan(0);
    expect(blockChance(def, true, 6) / melee).toBeCloseTo(0.5, 6);
  });
});

describe('tickCombat rules', () => {
  it('a parried blow is answered with a riposte that wounds the attacker', () => {
    rng.reseed(11);
    const guard = body(
      'a',
      { dexterity: 20, strength: 16 },
      {
        currentState: 'Idle',
        equipment: { offHand: shield('iron_buckler') } as Pawn['equipment']
      }
    );
    let state = world([guard], [wolf({ stateSince: 0 })], 0);
    for (let t = 1; t <= 6000; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      if (woundsOf(state.mobs![0]) > 0) break;
    }
    expect(woundsOf(state.mobs![0])).toBeGreaterThan(0);
  });

  it('a sated beast does not strike a collapsed pawn', () => {
    const downed = body('a', {}, { currentState: 'Collapsed' });
    const out = combatService.tickCombat(
      world([downed], [wolf({ needs: { hunger: 0 } as Mob['needs'] })]),
      16
    );
    expect(out.mobs![0].stamina).toBe(50);
    expect(woundsOf(out.pawns[0])).toBe(0);
  });

  it('a hungry beast does strike a collapsed pawn', () => {
    const downed = body('a', {}, { currentState: 'Collapsed' });
    const out = combatService.tickCombat(
      world([downed], [wolf({ needs: { hunger: 100 } as Mob['needs'] })]),
      16
    );
    expect(out.mobs![0].stamina).toBeLessThan(50);
  });

  it('a collapsed beast does not attack', () => {
    const target = body('a', {}, { currentState: 'Idle' });
    const out = combatService.tickCombat(
      world([target], [wolf({ conditionTimers: { collapse: 5 } })]),
      16
    );
    expect(out.mobs![0].stamina).toBe(50);
    expect(woundsOf(out.pawns[0])).toBe(0);
  });
});
