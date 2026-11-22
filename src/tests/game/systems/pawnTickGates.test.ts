import { describe, it, expect, afterEach } from 'vitest';
import {
  healWounds,
  pawnStateMachineService,
  syncTransientConditions
} from '$lib/game/systems/PawnStateMachine';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { rebuildThermalField } from '$lib/game/services/EnvironmentService';
import { applyShock, TIRED_FATIGUE_THRESHOLD } from '$lib/game/core/rules/body/conditions';
import { HEALING_CONFIG } from '$lib/game/core/defs/wounds';
import type {
  EntityCondition,
  GameState,
  Injury,
  Job,
  Pawn,
  PlacedBuilding
} from '$lib/game/core/types';

let serial = 0;

function makePawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: `p${++serial}`,
    name: 'Wren',
    isAlive: true,
    position: { x: 0, y: 0 },
    currentState: 'Idle',
    stats: {
      strength: 12,
      dexterity: 12,
      constitution: 10,
      intelligence: 10,
      perception: 10,
      charisma: 10
    },
    traits: [],
    equipment: {},
    skills: {},
    needs: { hunger: 10, fatigue: 10, thirst: 0, hygiene: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50, health: 100, isWorking: false, isEating: false, isSleeping: false },
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

const state = (pawn: Pawn, turn = 31, over: Partial<GameState> = {}) =>
  ({
    turn,
    pawns: [pawn],
    jobs: [],
    mobs: [],
    droppedItems: [],
    buildings: [],
    stockpile: {},
    deadPawns: [],
    worldMap: [],
    designations: {},
    ...over
  }) as unknown as GameState;

const tick = (gs: GameState) => pawnStateMachineService.tick(gs);

function consciousnessAt(blood: number): number {
  const conditions: EntityCondition[] = [];
  applyShock(conditions, 0, 1 - blood / 100);
  return (
    pawnStatService.computeCapacities(makePawn({ bloodVolume: blood, conditions })).consciousness ??
    1
  );
}

function bloodFor(target: number): number {
  let lo = 1;
  let hi = 100;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (consciousnessAt(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

const minorCut = (): Injury =>
  ({
    bodyPart: 'chest',
    type: 'cut',
    severity: 'minor',
    damage: 5,
    bleeding: 0,
    painContribution: 0,
    infected: false,
    inflictedAt: 1
  }) as Injury;

const wounded = (over: Partial<Pawn> = {}) =>
  makePawn({
    limbs: [
      {
        id: 'torso',
        health: 90,
        bleedRate: 0,
        parts: [{ id: 'chest', health: 75, maxHp: 80, isMissing: false, injuries: [minorCut()] }]
      }
    ] as unknown as Pawn['limbs'],
    ...over
  });

const chestDamage = (p: Pawn) =>
  p.limbs!.flatMap((l) => l.parts ?? []).find((q) => q.id === 'chest')!.injuries[0].damage;

afterEach(() => rebuildThermalField([]));

describe('collapse and recovery', () => {
  it('a pawn falls once consciousness drops below 0.30 and lets go of its claimed jobs', () => {
    const p = makePawn({ bloodVolume: bloodFor(0.2) });
    const jobs = [{ id: 'j1', claimedBy: p.id } as unknown as Job];
    const out = tick(state(p, 31, { jobs }));
    expect(out.pawns[0].currentState).toBe('Collapsed');
    expect(out.jobs[0].claimedBy).toBeNull();
  });

  it('a collapsed pawn stays down while consciousness sits between 0.30 and 0.32', () => {
    const blood = bloodFor(0.31);
    expect(consciousnessAt(blood)).toBeGreaterThanOrEqual(0.3);
    expect(consciousnessAt(blood)).toBeLessThan(0.32);
    const p = makePawn({
      bloodVolume: blood,
      currentState: 'Collapsed',
      conditionTimers: { collapse: 2 }
    });
    expect(tick(state(p)).pawns[0].currentState).toBe('Collapsed');
  });

  it('a collapsed pawn gets up once consciousness is back to half', () => {
    const p = makePawn({
      bloodVolume: bloodFor(0.5),
      currentState: 'Collapsed',
      conditionTimers: { collapse: 2 }
    });
    const out = tick(state(p)).pawns[0];
    expect(out.currentState).not.toBe('Collapsed');
    expect(out.conditionTimers?.collapse).toBeUndefined();
  });
});

describe('forced sleep', () => {
  it('a pawn at full fatigue drops into sleep', () => {
    const p = makePawn({
      currentState: 'Wandering',
      needs: {
        hunger: 10,
        fatigue: 100,
        thirst: 0,
        hygiene: 0,
        sleep: 0,
        lastSleep: 0,
        lastMeal: 0
      } as Pawn['needs']
    });
    expect(tick(state(p)).pawns[0].currentState).toBe('Sleeping');
  });
});

describe('healing in the tick', () => {
  it('a pawn in a fight does not mend its wounds', () => {
    const p = wounded({ currentState: 'Fighting' });
    expect(chestDamage(tick(state(p)).pawns[0])).toBe(5);
  });

  it('a pawn out of a fight does mend them', () => {
    expect(chestDamage(tick(state(wounded())).pawns[0])).toBeLessThan(5);
  });

  it('sleep mends wounds at the sleeping multiplier over the active rate', () => {
    const healed = (s: string) => 5 - chestDamage(healWounds(wounded({ currentState: s }), 1));
    expect(healed('Sleeping') / healed('Idle')).toBeCloseTo(
      HEALING_CONFIG.sleepingMultiplier / 0.1,
      6
    );
  });

  it('sleeping under a roof mends wounds 1.6 times faster than in the open', () => {
    const healed = () => 5 - chestDamage(healWounds(wounded({ currentState: 'Sleeping' }), 1));
    const open = healed();
    rebuildThermalField([
      {
        id: 'r',
        type: 'thatch_roof',
        x: 0,
        y: 0,
        status: 'complete',
        progress: 1
      } as PlacedBuilding
    ]);
    expect(healed() / open).toBeCloseTo(1.6, 6);
  });
});

describe('gear', () => {
  it('a tool worn to zero durability is dropped from the hands', () => {
    const p = makePawn({
      equipment: {
        mainHand: { itemId: 'stone_spear', quantity: 1, durability: 0 }
      } as unknown as Pawn['equipment']
    });
    expect(tick(state(p, 30)).pawns[0].equipment?.mainHand).toBeUndefined();
  });
});

describe('condition timers', () => {
  it('berserk running out leaves the pawn spent', () => {
    const out = tick(state(makePawn({ conditionTimers: { berserk: 1 } }))).pawns[0];
    expect(out.conditionTimers?.berserk).toBeUndefined();
    expect(out.conditionTimers?.berserk_spent).toBeGreaterThan(0);
  });

  it('a timer that reaches zero is removed', () => {
    const out = tick(state(makePawn({ conditionTimers: { feasted: 1 } }))).pawns[0];
    expect(out.conditionTimers ?? {}).not.toHaveProperty('feasted');
  });
});

describe('transient conditions from body and mood', () => {
  it('a mood of 80 is ecstatic', () => {
    const p = makePawn({ state: { mood: 80 } as Pawn['state'] });
    expect(syncTransientConditions(p).transientConditions).toContain('mood_ecstatic');
  });

  it('a sleeping pawn is not tired, however fatigued', () => {
    const needs = {
      hunger: 0,
      fatigue: Math.max(100, TIRED_FATIGUE_THRESHOLD),
      thirst: 0
    } as Pawn['needs'];
    const asleep = makePawn({ currentState: 'Sleeping', needs });
    const awake = makePawn({ needs });
    expect(syncTransientConditions(asleep).transientConditions).not.toContain('tired');
    expect(syncTransientConditions(awake).transientConditions).toContain('tired');
  });

  it('a gushing wound reads as a fatal bleed and a trickle as a minor one', () => {
    const bleeding = (rate: number) => {
      const p = makePawn();
      p.limbs![1].bleedRate = rate;
      return syncTransientConditions(p).transientConditions?.find((c) => c.startsWith('bleeding:'));
    };
    expect(bleeding(10_000)).toBe('bleeding:fatal');
    expect(bleeding(0.1)).toBe('bleeding:minor');
  });
});
