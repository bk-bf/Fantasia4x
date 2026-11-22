import { describe, it, expect } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import { getCreatureById } from '$lib/game/core/defs/creatures';
import type { GameState, Mob } from '$lib/game/core/types';

const CORPSE = { x: 17, y: 15 };

function world(w = 30, h = 30) {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      walkable: true,
      terrainType: 'plains',
      resources: {}
    }))
  );
}

function boar(over: Partial<Mob>): Mob {
  return {
    id: 'b1',
    creatureId: 'boar',
    entityClass: 'animal',
    state: 'Wander',
    isAlive: true,
    x: 15,
    y: 15,
    health: 60,
    maxHealth: 60,
    stats: { ...getCreatureById('boar')!.stats },
    bloodVolume: 100,
    maxBloodVolume: 100,
    limbs: [],
    conditions: [],
    needs: { hunger: 0, fatigue: 0 },
    stateSince: 0,
    ...(over as object)
  } as unknown as Mob;
}

function run(ticks: number) {
  const corpse = boar({
    id: 'b2',
    ...CORPSE,
    state: 'Corpse',
    isAlive: false,
    health: 0,
    diedAt: 0,
    intactness: 1
  });
  let state = {
    turn: 6000,
    mobs: [boar({}), corpse],
    pawns: [],
    worldMap: world(),
    stockpile: {},
    droppedItems: [],
    buildings: []
  } as unknown as GameState;
  const states: string[] = [];
  for (let t = 0; t < ticks; t++) {
    state = { ...state, turn: state.turn + 1 };
    state = entityService.stepEntities(state);
    state = entityService.advanceMobMovement(state);
    states.push(state.mobs![0].state);
  }
  const live = state.mobs![0];
  return {
    states,
    flips: states.filter((s, i) => i > 0 && s !== states[i - 1]).length,
    distFromCorpse: Math.max(Math.abs(live.x - CORPSE.x), Math.abs(live.y - CORPSE.y))
  };
}

describe('a herd animal that sees a dead packmate', () => {
  it('flees away from the corpse instead of flipping between Fleeing and Wander in place', () => {
    const { states, flips, distFromCorpse } = run(120);
    expect(states[0]).toBe('Fleeing');
    expect(flips).toBeLessThan(10);
    expect(distFromCorpse).toBeGreaterThan(2);
  });
});
