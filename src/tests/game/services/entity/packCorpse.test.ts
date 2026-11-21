import { describe, it, expect } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import { getCreatureById } from '$lib/game/core/defs/creatures';
import type { GameState, Mob } from '$lib/game/core/types';

function world(w = 40, h = 40) {
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

function animal(creatureId: string, over: Partial<Mob>): Mob {
  return {
    id: 'b1',
    creatureId,
    entityClass: 'animal',
    state: 'Wander',
    isAlive: true,
    x: 15,
    y: 15,
    health: 60,
    maxHealth: 60,
    bloodVolume: 100,
    maxBloodVolume: 100,
    limbs: [],
    conditions: [],
    needs: { hunger: 0, fatigue: 0 },
    stateSince: 0,
    ...(over as object)
  } as unknown as Mob;
}

function corpse(creatureId: string, id: string, x: number, y: number): Mob {
  return animal(creatureId, {
    id,
    x,
    y,
    state: 'Corpse',
    isAlive: false,
    health: 0,
    diedAt: 5990,
    intactness: 1
  });
}

function bystanders(n: number): Mob[] {
  return Array.from({ length: n }, (_, i) =>
    animal('boar', { id: `far-${i}`, x: 38, y: i % 40, state: 'Sleeping' })
  );
}

function stepOnce(mobs: Mob[]): Mob {
  const state = {
    turn: 6000,
    mobs,
    pawns: [],
    worldMap: world(),
    stockpile: {},
    droppedItems: [],
    buildings: []
  } as unknown as GameState;
  return entityService.stepEntities(state).mobs!.find((m) => m.id === 'b1')!;
}

describe('a herd animal that sees a dead packmate', () => {
  it('is a huntable non-predator, so the packmate check applies to it', () => {
    const def = getCreatureById('boar');
    expect(def?.huntable).toBe(true);
    expect(def?.predator).toBeFalsy();
  });

  it('flees from a same-species corpse in sight, behind many live mobs in the list', () => {
    const live = stepOnce([...bystanders(60), animal('boar', {}), corpse('boar', 'c1', 17, 15)]);
    expect(live.state).toBe('Fleeing');
  });

  it('ignores a corpse of another species', () => {
    const live = stepOnce([animal('boar', {}), corpse('deer', 'c1', 17, 15)]);
    expect(live.state).not.toBe('Fleeing');
  });

  it('ignores a same-species corpse out of sight', () => {
    const live = stepOnce([animal('boar', {}), corpse('boar', 'c1', 15, 39)]);
    expect(live.state).not.toBe('Fleeing');
  });
});
