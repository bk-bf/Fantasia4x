import { describe, it, expect, beforeEach } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { createBodyPlanLimbs } from '$lib/game/core/defs/bodyParts';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Mob, Pawn } from '$lib/game/core/types';

const stats = {
  strength: 14,
  dexterity: 16,
  constitution: 10,
  intelligence: 10,
  perception: 10,
  charisma: 10
};

beforeEach(() => rng.reseed(3));

function pawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'p1',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Fighting',
    stats: { ...stats },
    traits: [],
    equipment: {},
    limbs: createBodyPlanLimbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 20,
    maxStamina: 20,
    needs: { hunger: 0, fatigue: 0 },
    ...(over as object)
  } as unknown as Pawn;
}

function mob(over: Partial<Mob> = {}): Mob {
  return {
    id: 'g1',
    creatureId: 'goblin',
    entityClass: 'mob',
    state: 'Wander',
    stateSince: 0,
    isAlive: true,
    x: 5,
    y: 6,
    stats: { ...stats, dexterity: 4, constitution: 40 },
    traits: [],
    bloodVolume: 100000,
    maxBloodVolume: 100000,
    stamina: 50,
    maxStamina: 50,
    limbs: createBodyPlanLimbs('humanoid', 50),
    injuries: [],
    conditions: [],
    pain: 0,
    needs: { hunger: 0, fatigue: 0 },
    ...(over as object)
  } as unknown as Mob;
}

function world(pawns: Pawn[], mobs: Mob[], turn = 1): GameState {
  return { turn, pawns, mobs, worldMap: [] } as unknown as GameState;
}

function regenOf(p: Pawn): number {
  const out = combatService.tickCombat(world([p], []), 16);
  return (out.pawns[0].stamina ?? 0) - (p.stamina ?? 0);
}

describe('combat stamina loop', () => {
  it('a pawn swinging without pause drains to zero, becomes winded, and recovers to un-wind', () => {
    let state = world([pawn()], [mob()], 0);
    let windedAt = -1;
    let unwoundAt = -1;
    for (let t = 1; t < 30000 && unwoundAt < 0; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      const w = (state.pawns[0].transientConditions ?? []).includes('winded');
      if (w && windedAt < 0) windedAt = t;
      if (!w && windedAt >= 0) unwoundAt = t;
      if (state.mobs![0].isAlive === false) state = { ...state, mobs: [mob()] };
    }
    expect(windedAt).toBeGreaterThan(0);
    expect(unwoundAt).toBeGreaterThan(windedAt);
    expect(unwoundAt - windedAt).toBeLessThan(2000);
  });

  it('a fighting pawn regains stamina at a fifth of the rate of one out of the fight', () => {
    const fighting = regenOf(pawn({ stamina: 10 }));
    const resting = regenOf(pawn({ stamina: 10, currentState: 'Idle' }));
    expect(resting).toBeGreaterThan(0);
    expect(fighting / resting).toBeCloseTo(0.2, 6);
  });

  it('an exhausted pawn regains stamina 1.3 times slower than a rested one', () => {
    const rested = regenOf(pawn({ stamina: 10, currentState: 'Idle' }));
    const exhausted = regenOf(
      pawn({
        stamina: 10,
        currentState: 'Idle',
        needs: { hunger: 0, fatigue: 100 } as Pawn['needs']
      })
    );
    expect(rested / exhausted).toBeCloseTo(1.3, 6);
  });

  it('an attacking mob spends stamina on its swing', () => {
    const target = pawn({ currentState: 'Idle' });
    const attacker = mob({ state: 'Attacking', stateSince: 1, stamina: 40 });
    const out = combatService.tickCombat(world([target], [attacker]), 16);
    expect(out.mobs![0].stamina).toBeLessThan(40);
  });

  it('a winded mob does not swing, and regains stamina at the full resting rate', () => {
    const target = pawn({ currentState: 'Idle' });
    const winded = mob({
      state: 'Attacking',
      stateSince: 1,
      stamina: 10,
      conditionTimers: { winded: 2 },
      transientConditions: ['winded']
    });
    const out = combatService.tickCombat(world([target], [winded]), 16);
    expect(out.mobs![0].stamina).toBeGreaterThan(10);
    expect(
      out.pawns[0].limbs.every((l) => (l.parts ?? []).every((p) => p.injuries.length === 0))
    ).toBe(true);
  });
});
