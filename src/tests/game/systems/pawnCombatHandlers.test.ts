import { describe, it, expect, beforeAll } from 'vitest';
import {
  handleBloodHunt,
  handleFighting,
  handleFleeing,
  handleHunting
} from '$lib/game/systems/pawn/handlers/combat';
import { effectiveRangedRange, getRangedWeapon } from '$lib/game/systems/rangedCombat';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import type { GameState, Mob, Pawn } from '$lib/game/core/types';

const stats = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  perception: 10,
  charisma: 10
};

beforeAll(async () => {
  await pathfinderService.init();
});

function pawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'h1',
    name: 'h1',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Fighting',
    stats: { ...stats },
    traits: [],
    equipment: {},
    limbs: [],
    injuries: [],
    conditions: [],
    needs: { hunger: 0, thirst: 0, fatigue: 0, sleep: 0 },
    path: [],
    ...(over as object)
  } as unknown as Pawn;
}

function mob(id: string, x: number, y: number, over: Partial<Mob> = {}): Mob {
  return {
    id,
    creatureId: 'goblin',
    entityClass: 'mob',
    state: 'Wander',
    stateSince: 0,
    isAlive: true,
    x,
    y,
    stats: { ...stats },
    path: [{ x: 9, y: 9 }],
    ...(over as object)
  } as unknown as Mob;
}

function world(pawns: Pawn[], mobs: Mob[], size = 16): GameState {
  const row = () => Array.from({ length: size }, () => ({ walkable: true, type: 'grass' }));
  return {
    turn: 50,
    pawns,
    mobs,
    worldMap: Array.from({ length: size }, row),
    workAssignments: {}
  } as unknown as GameState;
}

const far = [{ x: 12, y: 12 }];

describe('handleFighting', () => {
  it('an aggressive melee pawn already next to its foe stops walking', () => {
    const p = pawn({ combatStance: 'aggressive', path: [...far], isMoving: true });
    handleFighting(p, world([p], [mob('g1', 6, 6)]));
    expect(p.path).toEqual([]);
  });

  it('an aggressive melee pawn keeps closing on a foe two tiles off', () => {
    const p = pawn({ combatStance: 'aggressive', path: [...far], isMoving: true });
    handleFighting(p, world([p], [mob('g1', 7, 7)]));
    expect(p.path).toEqual(far);
  });

  it('an archer whose foe stands at the edge of its range holds and shoots', () => {
    const p = pawn({
      path: [...far],
      isMoving: true,
      equipment: { mainHand: { itemId: 'self_bow', quantity: 1 } } as unknown as Pawn['equipment']
    });
    const range = effectiveRangedRange(p, getRangedWeapon(p)!);
    expect(Number.isInteger(range)).toBe(true);
    handleFighting(p, world([p], [mob('g1', 5 + range, 5)]));
    expect(p.path).toEqual([]);
  });
});

describe('handleFleeing', () => {
  it('a pawn standing on its foe’s tile flees toward the far corner, not the near one', () => {
    const p = pawn({ currentState: 'Fleeing', position: { x: 3, y: 3 } });
    const out = handleFleeing(p, world([p], [mob('g1', 3, 3)]));
    const path = out.pawns.find((q) => q.id === 'h1')?.path ?? [];
    const end = path[path.length - 1];
    expect(end).toBeDefined();
    expect(end!.x).toBeGreaterThan(3);
    expect(end!.y).toBeGreaterThan(3);
  });
});

describe('handleHunting', () => {
  const deer = (x: number, y: number) =>
    mob('d1', x, y, { creatureId: 'deer', entityClass: 'animal', markedForHunt: true });

  it('a hunter that reaches its marked quarry turns it to fight back, aimed at the hunter', () => {
    const p = pawn({ currentState: 'Hunting', huntTargetId: 'd1' });
    const out = handleHunting(p, world([p], [deer(6, 6)]));
    const d = out.mobs!.find((m) => m.id === 'd1')!;
    expect(d.state).toBe('Attacking');
    expect(d.huntTargetId).toBe('h1');
    expect(d.stateSince).toBe(50);
    expect(d.path).toEqual([]);
  });

  it('a hunter two tiles off does not flip its quarry', () => {
    const p = pawn({ currentState: 'Hunting', huntTargetId: 'd1' });
    const out = handleHunting(p, world([p], [deer(7, 7)]));
    expect(out.mobs!.find((m) => m.id === 'd1')!.state).toBe('Wander');
  });
});

describe('handleBloodHunt', () => {
  const raging = (over: Partial<Pawn> = {}) =>
    pawn({
      currentState: 'BloodHunt',
      conditionTimers: { bloodthirst: 500 },
      needs: { hunger: 0, thirst: 0, fatigue: 0, sleep: 0, bloodHunger: 90 } as Pawn['needs'],
      ...over
    });

  it('a raging feeder picks out prey ten tiles away', () => {
    const p = raging({ position: { x: 1, y: 1 } });
    handleBloodHunt(p, world([p], [mob('g1', 11, 11)]));
    expect(p.huntTargetId).toBe('g1');
  });

  it('a feeder beside the corpse of its quarry is sated', () => {
    const p = raging({ huntTargetId: 'g1' });
    handleBloodHunt(p, world([p], [mob('g1', 6, 5, { isAlive: false, state: 'Corpse' })]));
    expect(p.needs.bloodHunger).toBe(0);
    expect(p.conditionTimers?.bloodthirst).toBeUndefined();
  });
});
