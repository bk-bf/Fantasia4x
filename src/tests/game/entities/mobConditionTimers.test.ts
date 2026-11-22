import { describe, it, expect } from 'vitest';
import { entityService } from '$lib/game/services/EntityService';
import type { GameState, Mob, Pawn } from '$lib/game/core/types';
import { makeMob } from '$lib/game/services/entity/entitySpawning';
import { getCreatureById } from '$lib/game/core/defs/creatures';

function world(w: number, h: number) {
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

function feastedDeer(id: string, x: number, y: number): Mob {
  const m = makeMob(getCreatureById('deer')!, x, y, 0);
  return {
    ...m,
    id,
    state: 'Sleeping',
    needs: { ...m.needs, hunger: 0, fatigue: 90 },
    conditionTimers: { feasted: 600 },
    transientConditions: ['feasted']
  } as Mob;
}

function run(ticks: number): { near: Mob; far: Mob } {
  const pawn = {
    id: 'watcher',
    name: 'P',
    position: { x: 75, y: 75 },
    isAlive: true,
    currentState: 'Idle'
  } as unknown as Pawn;
  let state = {
    turn: 6000,
    mobs: [feastedDeer('near', 45, 45), feastedDeer('far', 2, 2)],
    pawns: [pawn],
    worldMap: world(80, 80),
    stockpile: {},
    droppedItems: [],
    buildings: []
  } as unknown as GameState;
  for (let t = 0; t < ticks; t++) {
    state = { ...state, turn: state.turn + 1 };
    state = entityService.stepEntities(state);
  }
  return {
    near: state.mobs!.find((m) => m.id === 'near')!,
    far: state.mobs!.find((m) => m.id === 'far')!
  };
}

describe('mob condition timers under the think throttle', () => {
  it('a timed transient condition runs out in the same number of ticks inside and outside the live bubble', () => {
    const { near, far } = run(660);
    expect(near.conditionTimers?.feasted).toBeUndefined();
    expect(near.transientConditions).toEqual([]);
    expect(far.conditionTimers?.feasted).toBeUndefined();
    expect(far.transientConditions).toEqual([]);
  });

  it('a throttled mob keeps its condition until its ticks have elapsed', () => {
    const { far } = run(480);
    expect(far.conditionTimers?.feasted).toBeGreaterThan(0);
    expect(far.transientConditions).toEqual(['feasted']);
  });
});
