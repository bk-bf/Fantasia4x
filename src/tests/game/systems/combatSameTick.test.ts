import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { createBodyPlanLimbs } from '$lib/game/core/defs/bodyParts';
import { rng } from '$lib/game/core/util/rng';
import { setSimLogSink, simLog, type SimLogSink } from '$lib/game/core/util/logSink';
import type { GameState, Mob, Pawn } from '$lib/game/core/types';

type WithDeeds = { deeds?: Record<string, number> };

const stats = {
  strength: 14,
  dexterity: 20,
  constitution: 12,
  intelligence: 10,
  perception: 10,
  charisma: 10
};
const strong = { ...stats, strength: 30, dexterity: 30 };

const frailLimbs = <T extends { health: number; parts?: { health: number }[] }>(limbs: T[]) =>
  limbs.map((l) => ({ ...l, health: 1, parts: (l.parts ?? []).map((p) => ({ ...p, health: 1 })) }));

function pawn(id: string, x: number, y: number): Pawn {
  return {
    id,
    name: id,
    isAlive: true,
    position: { x, y },
    currentState: 'Idle',
    drafted: true,
    draftTarget: { type: 'attack', targetType: 'mob', targetId: 'w1', mode: 'melee' },
    stats: { ...stats },
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
    needs: { hunger: 0, fatigue: 0 }
  } as unknown as Pawn;
}

function wolf(over: Partial<Mob> = {}): Mob {
  return {
    id: 'w1',
    creatureId: 'wolf',
    entityClass: 'mob',
    state: 'Wander',
    stateSince: 0,
    isAlive: true,
    x: 5,
    y: 6,
    stats: { ...stats, dexterity: 1 },
    traits: [],
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    limbs: frailLimbs(createBodyPlanLimbs('quadruped')),
    injuries: [],
    conditions: [],
    pain: 0,
    needs: { hunger: 0, fatigue: 0 },
    ...(over as object)
  } as unknown as Mob;
}

const world = (pawns: Pawn[], mobs: Mob[]) =>
  ({ turn: 0, pawns, mobs, worldMap: [] }) as unknown as GameState;

let prev: SimLogSink;
let kills: string[];
let lunges: string[];
beforeEach(() => {
  prev = simLog;
  kills = [];
  lunges = [];
  setSimLogSink({
    ...prev,
    logCombatKill: (attackerId: string) => void kills.push(attackerId),
    pushAttackLunge: (r: { attackerId: string }) => void lunges.push(r.attackerId)
  } as unknown as SimLogSink);
});
afterEach(() => setSimLogSink(prev));

describe('combat within one tick reads the entities the tick has already changed', () => {
  it('a mob killed by the first of two pawns swinging on the same tick is killed once', () => {
    rng.reseed(7);
    let state = world([pawn('p1', 4, 6), pawn('p2', 6, 6)], [wolf()]);
    let diedAt = -1;
    for (let t = 0; t < 3000 && diedAt < 0; t++) {
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      if (state.mobs![0].isAlive === false) diedAt = t;
    }
    expect(diedAt).toBeGreaterThanOrEqual(0);
    const canineKills = state.pawns.map((p) => (p as Pawn & WithDeeds).deeds?.['kill:canine'] ?? 0);
    expect(canineKills.reduce((a, b) => a + b, 0)).toBe(1);
    expect(kills.length).toBeLessThanOrEqual(1);
    expect(state.mobs![0].diedAt).toBe(diedAt);
  });

  it('a pawn struck earlier in the tick keeps the kill deed it earns later in the same tick', () => {
    const lost: number[] = [];
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      rng.reseed(seed);
      let state = world([pawn('p1', 4, 6)], [wolf({ state: 'Attacking', stats: { ...strong } })]);
      for (let t = 1; t < 3000; t++) {
        state = combatService.tickCombat({ ...state, turn: t }, 16);
        if (state.mobs![0].isAlive !== false) continue;
        total++;
        if (((state.pawns[0] as Pawn & WithDeeds).deeds?.['kill:canine'] ?? 0) === 0)
          lost.push(seed);
        break;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(lost).toEqual([]);
  });

  it('tickCombat leaves the deeds of the state it was given untouched', () => {
    rng.reseed(2);
    let state = world([pawn('p1', 4, 6)], [wolf({ state: 'Attacking', stats: { ...strong } })]);
    for (let t = 1; t < 3000; t++) {
      const before = state;
      state = combatService.tickCombat({ ...state, turn: t }, 16);
      expect((before.pawns[0] as Pawn & WithDeeds).deeds?.['kill:canine']).toBeUndefined();
      if (state.mobs![0].isAlive === false) break;
    }
    expect(state.mobs![0].isAlive).toBe(false);
  });

  it('a pawn killed by a mob earlier in the tick does not swing later in the same tick', () => {
    const posthumous: number[] = [];
    let deaths = 0;
    for (let seed = 1; seed <= 60; seed++) {
      rng.reseed(seed);
      const p = pawn('p1', 4, 6);
      const frail = {
        ...p,
        stats: { ...strong },
        limbs: frailLimbs(p.limbs ?? [])
      } as unknown as Pawn;
      const w = wolf({
        state: 'Attacking',
        limbs: createBodyPlanLimbs('quadruped'),
        stats: { ...strong }
      });
      let state = world([frail], [w]);
      for (let t = 1; t < 3000; t++) {
        lunges = [];
        state = combatService.tickCombat({ ...state, turn: t }, 16);
        if (state.pawns[0].isAlive !== false) continue;
        deaths++;
        if (lunges.includes('p1')) posthumous.push(seed);
        break;
      }
    }
    expect(deaths).toBeGreaterThan(0);
    expect(posthumous).toEqual([]);
  });
});
