import { describe, it, beforeEach, expect } from 'vitest';
import { pickEscalatedCreature, tickLairs } from '$lib/game/services/entity/entitySpawning';
import { rng } from '$lib/game/core/util/rng';
import {
  LAIR_TICK_INTERVAL,
  LAIR_MAX_ESCALATION,
  STARTING_BUBBLE_TURNS
} from '$lib/game/services/entity/entityConstants';
import type { GameState } from '$lib/game/core/types';
import type { CreatureDefinition } from '$lib/game/core/defs/creatures';

const wolf = (tier: number) =>
  ({ id: `w${tier}`, species: 'wolf', tier }) as unknown as CreatureDefinition;
const POOL = [wolf(1), wolf(2), wolf(3), wolf(4), wolf(5)];

beforeEach(() => rng.reseed(20260727));

describe('§3a pickEscalatedCreature — tier targeting', () => {
  it('climbs the ladder with level; T5 only at max & no living boss', () => {
    expect(pickEscalatedCreature(POOL, 1, false)?.tier).toBe(3);
    expect(pickEscalatedCreature(POOL, 2, false)?.tier).toBe(4);
    expect(pickEscalatedCreature(POOL, LAIR_MAX_ESCALATION, false)?.tier).toBe(5);
    expect(pickEscalatedCreature(POOL, LAIR_MAX_ESCALATION, true)?.tier).toBe(4);
    expect(pickEscalatedCreature(POOL, 0, false)?.tier ?? 5).toBeLessThan(5);
  });
});

function worldWithLair(): { state: GameState; lairId: string; startDay: number } {
  const worldMap = Array.from({ length: 60 }, (_, y) =>
    Array.from({ length: 60 }, (_, x) => ({
      x,
      y,
      terrainType: 'plains',
      subType: 'grass',
      walkable: true,
      resources: {} as Record<string, number>
    }))
  );
  worldMap[5][5].resources = { predator_den: 1 };
  const lairId = 'lair-predator_den-5-5';
  const mobs = [
    {
      id: 'm1',
      creatureId: 'bear',
      lairId,
      lairX: 5,
      lairY: 5,
      x: 5,
      y: 5,
      isAlive: true,
      state: 'Wander'
    }
  ];
  const startDay = Math.ceil(STARTING_BUBBLE_TURNS / LAIR_TICK_INTERVAL) + 1;
  const state = {
    turn: startDay * LAIR_TICK_INTERVAL,
    worldMap,
    mobs,
    lairEscalation: {}
  } as unknown as GameState;
  return { state, lairId, startDay };
}

describe('§3a tickLairs — escalation accrues by age, resets on clear', () => {
  it('an ignored living den climbs escalation; wiping the pack resets it', () => {
    let { state, lairId, startDay } = worldWithLair();
    let day = startDay;
    for (let i = 0; i < 300; i++) {
      day++;
      state = { ...state, turn: day * LAIR_TICK_INTERVAL };
      state = tickLairs(state);
      state = {
        ...state,
        mobs: [
          {
            id: 'm1',
            creatureId: 'bear',
            lairId,
            lairX: 5,
            lairY: 5,
            x: 5,
            y: 5,
            isAlive: true,
            state: 'Wander'
          }
        ]
      } as GameState;
    }
    const climbed = state.lairEscalation?.[lairId] ?? 0;
    console.log(`escalation after 300 ignored days: ${climbed} (max ${LAIR_MAX_ESCALATION})`);
    expect(climbed).toBeGreaterThan(0);
    expect(climbed).toBeLessThanOrEqual(LAIR_MAX_ESCALATION);

    let s2 = {
      ...state,
      mobs: [] as any[],
      turn: (day + 1) * LAIR_TICK_INTERVAL
    } as unknown as GameState;
    s2 = tickLairs(s2);
    console.log(`escalation after pack wiped: ${s2.lairEscalation?.[lairId] ?? 0}`);
    expect(s2.lairEscalation?.[lairId] ?? 0).toBe(0);
  });
});
