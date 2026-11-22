import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { clearConnectivity } from '$lib/game/services/entity/connectivity';
import {
  CORPSE_PORTION,
  HUNT_GIVE_UP_SECONDS,
  SAFE_RESET_TICKS,
  SLEEP_MAX_HUNGER
} from '$lib/game/services/entity/entityConstants';
import { TICKS_PER_SECOND, ticksFromSeconds } from '$lib/game/core/util/time';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Mob, Pawn } from '$lib/game/core/types';

const NOON = 150 * TICKS_PER_SECOND;

function world(w = 40, h = 40) {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      walkable: true,
      terrainType: 'plains',
      movementCost: 1,
      resources: {}
    }))
  );
}

function mob(id: string, creatureId: string, x: number, y: number, over: object = {}): Mob {
  return {
    id,
    creatureId,
    entityClass: 'mob',
    state: 'Wander',
    isAlive: true,
    x,
    y,
    health: 35,
    maxHealth: 35,
    bloodVolume: 100,
    maxBloodVolume: 100,
    limbs: [],
    conditions: [],
    needs: { hunger: 0, fatigue: 0 },
    stateSince: NOON - 1,
    stealthChecks: { p: { at: Infinity, detected: true } },
    ...over
  } as unknown as Mob;
}

function pawnAt(x: number, y: number): Pawn {
  return { id: 'p', name: 'P', position: { x, y }, isAlive: true } as unknown as Pawn;
}

function step(mobs: Mob[], pawns: Pawn[] = []): GameState {
  return entityService.stepEntities({
    turn: NOON,
    mobs,
    pawns,
    worldMap: world(),
    stockpile: {},
    droppedItems: [],
    buildings: []
  } as unknown as GameState);
}

const byId = (state: GameState, id: string) => state.mobs!.find((m) => m.id === id)!;

beforeAll(async () => {
  await pathfinderService.init();
  clearConnectivity();
});

beforeEach(() => rng.reseed(20261121));

describe('stepHostile: when a hostile breaks off', () => {
  it('a hostile at a fifth of its health or less turns to flee', () => {
    expect(byId(step([mob('g', 'goblin', 20, 20, { health: 5 })]), 'g').state).toBe('Fleeing');
  });

  it('a hostile strayed past its lair range walks home and stops hunting for a while', () => {
    const strayed = mob('g', 'goblin', 30, 10, {
      lairId: 'lair-1',
      lairX: 10,
      lairY: 10,
      lairRange: 5
    });
    const after = byId(step([strayed]), 'g');
    expect(after.path).toEqual([{ x: 29, y: 10 }]);
    expect(after.huntCooldownUntil).toBeGreaterThan(NOON);
  });

  it('a fleeing hostile with no stamina left is exhausted', () => {
    const runner = mob('g', 'goblin', 20, 20, {
      state: 'Fleeing',
      stateSince: NOON,
      stamina: 0.001
    });
    expect(byId(step([runner], [pawnAt(22, 20)]), 'g').state).toBe('Exhausted');
  });

  it('a sleeping hostile wakes when it is starving, however tired it is', () => {
    const sleeper = mob('g', 'goblin', 20, 20, {
      state: 'Sleeping',
      needs: { hunger: SLEEP_MAX_HUNGER, fatigue: 100 }
    });
    expect(byId(step([sleeper]), 'g').state).toBe('Wander');
  });

  it('a traveller close enough to its goal stops travelling', () => {
    const traveller = mob('g', 'goblin', 20, 20, {
      state: 'Traveling',
      travelGoalX: 23,
      travelGoalY: 20
    });
    const after = byId(step([traveller]), 'g');
    expect(after.state).toBe('Wander');
    expect(after.travelGoalX).toBeUndefined();
  });

  it('a herd animal flees from a dead packmate in sight', () => {
    const boar = mob('b', 'boar', 15, 15, { entityClass: 'animal', health: 60, maxHealth: 60 });
    const dead = mob('c', 'boar', 17, 15, {
      state: 'Corpse',
      isAlive: false,
      health: 0,
      intactness: 1
    });
    expect(byId(step([boar, dead]), 'b').state).toBe('Fleeing');
  });
});

describe('stepHunting', () => {
  const hunter = (over: object) =>
    mob('w', 'wolf', 20, 20, {
      entityClass: 'animal',
      state: 'Hunting',
      huntTargetId: 'd',
      needs: { hunger: 80, fatigue: 0 },
      ...over
    });

  it('a hunter that reaches its prey makes the prey fight back at it', () => {
    const deer = mob('d', 'deer', 21, 20, { entityClass: 'animal', state: 'Grazing' });
    const after = step([hunter({}), deer]);
    expect(byId(after, 'w').state).toBe('Attacking');
    expect(byId(after, 'd').state).toBe('Attacking');
    expect(byId(after, 'd').huntTargetId).toBe('w');
  });

  it('a hunt that has run past its time limit is given up, with a cooldown', () => {
    const deer = mob('d', 'deer', 35, 35, { entityClass: 'animal', state: 'Grazing' });
    const stale = hunter({ stateSince: NOON - ticksFromSeconds(HUNT_GIVE_UP_SECONDS) - 1 });
    const after = byId(step([stale, deer]), 'w');
    expect(after.state).toBe('Wander');
    expect(after.huntTargetId).toBeUndefined();
    expect(after.huntCooldownUntil).toBeGreaterThan(NOON);
  });

  it('a hunter stops eating a carcass its last portion strips bare', () => {
    const carcass = mob('d', 'deer', 21, 20, {
      entityClass: 'animal',
      state: 'Corpse',
      isAlive: false,
      health: 0,
      intactness: CORPSE_PORTION
    });
    const eater = hunter({ state: 'Eating', eatProgress: 0.9999 });
    const after = byId(step([eater, carcass]), 'w');
    expect(after.eatProgress).toBeUndefined();
    expect(after.state).toBe('Wander');
  });
});

describe('stepAnimal: Fleeing', () => {
  it('a fleeing animal that never found a flee destination gives up and grazes', () => {
    const deer = mob('d', 'deer', 20, 20, {
      entityClass: 'animal',
      state: 'Fleeing',
      stateSince: NOON - SAFE_RESET_TICKS - 1,
      stamina: 100
    });
    expect(byId(step([deer], [pawnAt(23, 20)]), 'd').state).toBe('Grazing');
  });
});
