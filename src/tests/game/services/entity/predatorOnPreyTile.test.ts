import { describe, it, expect, beforeAll } from 'vitest';
import { pathfinderService } from '$lib/game/services/PathfinderService';
import { nearestPredatorThreat } from '$lib/game/services/entity/entityHelpers';
import { getCreatureById } from '$lib/game/core/defs/creatures';
import type { Mob } from '$lib/game/core/types';

const mob = (id: string, creatureId: string, x: number, y: number): Mob =>
  ({ id, creatureId, state: 'Wander', isAlive: true, x, y }) as unknown as Mob;

beforeAll(async () => {
  await pathfinderService.init();
});

describe('a predator standing on its prey tile', () => {
  it('is the nearest point nearestEach returns for that tile', () => {
    expect(pathfinderService.isReady()).toBe(true);
    const res = pathfinderService.nearestEach(
      new Float32Array([5, 5, 9, 9]),
      new Float32Array([5, 5]),
      40
    )!;
    expect(Array.from(res)).toEqual([0]);
  });

  it('is the threat a prey animal sees, ahead of a farther predator', () => {
    const boar = mob('b1', 'boar', 5, 5);
    const mobs = [mob('w-far', 'wolf', 9, 9), boar, mob('w-on', 'wolf', 5, 5)];
    expect(nearestPredatorThreat(boar, getCreatureById('boar')!, mobs, 20)).toEqual({
      pos: { x: 5, y: 5 }
    });
  });

  it('is seen even when it is the only predator in range', () => {
    const boar = mob('b1', 'boar', 12, 3);
    const mobs = [boar, mob('w-on', 'wolf', 12, 3)];
    expect(nearestPredatorThreat(boar, getCreatureById('boar')!, mobs, 20)).toEqual({
      pos: { x: 12, y: 3 }
    });
  });
});
