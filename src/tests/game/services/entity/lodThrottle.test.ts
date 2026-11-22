import { describe, it, expect, beforeEach } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import { isThinkTick } from '$lib/game/services/entity/entityHelpers';
import { AI_THROTTLE_TICKS } from '$lib/game/services/entity/entityConstants';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Mob, Pawn } from '$lib/game/core/types';

const COLONIST = {
  id: 'p',
  name: 'P',
  position: { x: 70, y: 70 },
  isAlive: true
} as unknown as Pawn;

function world(w = 80, h = 80) {
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

function mob(id: string, creatureId: string, x: number, y: number, over: Partial<Mob> = {}): Mob {
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
    stateSince: 0,
    ...(over as object)
  } as unknown as Mob;
}

function makeState(mobs: Mob[], pawns: Pawn[], turn = 0): GameState {
  return {
    turn,
    mobs,
    pawns,
    worldMap: world(),
    stockpile: {},
    droppedItems: [],
    buildings: []
  } as unknown as GameState;
}

function firstThinkTickAfter(id: string, from: number): number {
  let t = from;
  while (!isThinkTick(id, t)) t++;
  return t;
}

const byId = (state: GameState, id: string) => state.mobs!.find((m) => m.id === id)!;

beforeEach(() => rng.reseed(20261121));

describe('mob LOD throttle: needs', () => {
  it('a mob outside the live bubble gains hunger and fatigue at the same rate as one inside it', () => {
    let state = makeState([mob('near', 'goblin', 65, 65), mob('far', 'goblin', 2, 2)], [COLONIST]);
    for (let t = 1; t <= 1200; t++) state = entityService.stepHunger({ ...state, turn: t });
    const near = byId(state, 'near');
    const far = byId(state, 'far');
    expect(near.needs.hunger).toBeGreaterThan(0);
    expect(far.needs.hunger / near.needs.hunger).toBeGreaterThan(0.9);
    expect(far.needs.hunger / near.needs.hunger).toBeLessThan(1.1);
    expect(far.needs.fatigue / near.needs.fatigue).toBeGreaterThan(0.9);
    expect(far.needs.fatigue / near.needs.fatigue).toBeLessThan(1.1);
  });

  it('a bleeding mob outside the bubble loses blood every tick, as one inside it does', () => {
    const bleeding = {
      limbs: [{ id: 'leg', health: 30, bleedRate: 6 }],
      bloodVolume: 90,
      state: 'Attacking'
    };
    let state = makeState(
      [
        mob('near', 'goblin', 65, 65, bleeding as Partial<Mob>),
        mob('far', 'goblin', 2, 2, bleeding as Partial<Mob>)
      ],
      [COLONIST]
    );
    const start = firstThinkTickAfter('far', 1) + 1;
    for (let t = start; t < start + 30; t++)
      state = entityService.stepHunger({ ...state, turn: t });
    const lostNear = 90 - byId(state, 'near').bloodVolume!;
    const lostFar = 90 - byId(state, 'far').bloodVolume!;
    expect(lostNear).toBeGreaterThan(0);
    expect(lostFar).toBeCloseTo(lostNear, 9);
  });
});

describe('mob LOD throttle: thinking', () => {
  it('a throttled forager catches up on the ticks it skipped when it next thinks', () => {
    const eating = { state: 'Eating', eatProgress: 0.01, needs: { hunger: 80, fatigue: 0 } };
    const end = firstThinkTickAfter('far', AI_THROTTLE_TICKS * 2);
    let far = makeState(
      [
        mob('far', 'deer', 2, 2, {
          ...eating,
          lastThinkTick: end - AI_THROTTLE_TICKS
        } as Partial<Mob>)
      ],
      [COLONIST]
    );
    let ref = makeState([mob('far', 'deer', 2, 2, eating as Partial<Mob>)], []);
    for (let t = end - AI_THROTTLE_TICKS + 1; t <= end; t++) {
      far = entityService.stepEntities({ ...far, turn: t });
      ref = entityService.stepEntities({ ...ref, turn: t });
    }
    expect(byId(ref, 'far').eatProgress).toBeGreaterThan(0.5);
    expect(byId(far, 'far').eatProgress).toBeCloseTo(byId(ref, 'far').eatProgress!, 9);
  });

  it('a throttled wanderer still picks somewhere to go between its think ticks', () => {
    const sleeper = mob('sleeper', 'deer', 45, 45, {
      state: 'Sleeping',
      needs: { hunger: 0, fatigue: 100 }
    } as Partial<Mob>);
    let state = makeState([mob('far', 'goblin', 10, 10), sleeper], [COLONIST]);
    let picks = 0;
    for (let t = 1; t <= 20 * AI_THROTTLE_TICKS; t++) {
      state = entityService.stepEntities({ ...state, turn: t });
      const m = byId(state, 'far');
      if (m.path?.length) {
        if (!isThinkTick('far', t)) picks++;
        state = { ...state, mobs: [{ ...m, path: [], pathIndex: 0 }, byId(state, 'sleeper')] };
      }
    }
    expect(byId(state, 'sleeper').state).toBe('Sleeping');
    expect(picks).toBeGreaterThan(5);
  });
});
