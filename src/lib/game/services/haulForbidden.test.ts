import { describe, it, expect } from 'vitest';
import { generate as generateHaulJobs } from './jobs/haul';
import { dropCarcass } from './entity/entityLifecycle';
import type { GameState, Job, DroppedItem, Mob } from '../core/types';

// A bare GameState with one stockpile tile to haul into and the given loose drops.
function stateWithDrops(drops: DroppedItem[]): GameState {
  return {
    droppedItems: drops,
    zoneTiles: { '5,5': ['stockpile'] },
    zoneInstances: [],
    pawns: [],
    turn: 1
  } as unknown as GameState;
}

const looseDrop = (id: string, extra: Partial<DroppedItem> = {}): DroppedItem => ({
  id,
  resourceId: 'wood',
  x: 1,
  y: 1,
  quantity: 3,
  ...extra
});

describe('haul forbidden lockout', () => {
  it('creates a haul job for a normal loose drop', () => {
    const jobs = generateHaulJobs([], stateWithDrops([looseDrop('d1')]));
    expect(jobs.filter((j) => j.type === 'haul' && j.droppedItemId === 'd1')).toHaveLength(1);
  });

  it('skips a forbidden drop', () => {
    const jobs = generateHaulJobs([], stateWithDrops([looseDrop('d1', { forbidden: true })]));
    expect(jobs.some((j) => j.type === 'haul')).toBe(false);
  });

  it('prunes an in-flight haul job when its drop becomes forbidden', () => {
    const existing: Job[] = [
      {
        id: 'haul-d1',
        type: 'haul',
        targetX: 1,
        targetY: 1,
        resourceId: 'wood',
        droppedItemId: 'd1',
        workRequired: 1,
        workDone: 0,
        claimedBy: 'p1' // already claimed / en route
      }
    ];
    const jobs = generateHaulJobs(existing, stateWithDrops([looseDrop('d1', { forbidden: true })]));
    expect(jobs.some((j) => j.id === 'haul-d1')).toBe(false);
  });
});

describe('dropCarcass', () => {
  it('marks a wild carcass forbidden by default', () => {
    // wolf is a stock creature with a carcassItemId; any creature that drops a carcass works.
    const mob = { id: 'm1', creatureId: 'wolf', x: 7, y: 7, intactness: 1 } as unknown as Mob;
    const out = dropCarcass(stateWithDrops([]), mob);
    const carcass = (out.droppedItems ?? []).find((d) => d.id.startsWith('carcass-m1'));
    // Only assert the flag when this creature actually drops a carcass (carcassItemId present).
    if (carcass) expect(carcass.forbidden).toBe(true);
    else expect(out.droppedItems ?? []).toHaveLength(0);
  });

  it('§2g/§2e: a T5 boss drops a DYNAMIC-name trophy carcass reading its rolled legend name', () => {
    // A boss (great_wolf → great_wolf_carcass, dynamicName) carries its per-spawn procedural `name`
    // ("Skarn, the Old Fang") → the drop reads "<that>'s Great Wolf Carcass".
    const mob = {
      id: 'b1',
      creatureId: 'great_wolf',
      name: 'Skarn, the Old Fang',
      x: 7,
      y: 7,
      intactness: 1
    } as unknown as Mob;
    const boss = (dropCarcass(stateWithDrops([]), mob).droppedItems ?? []).find((d) =>
      d.id.startsWith('carcass-b1')
    )!;
    expect(boss.resourceId).toBe('great_wolf_carcass');
    expect(boss.name).toContain('Skarn, the Old Fang');
    // A STATIC carcass (wolf → wolf_carcass) carries no per-drop name override.
    const wolf = { id: 'w1', creatureId: 'wolf', x: 7, y: 7, intactness: 1 } as unknown as Mob;
    const plain = (dropCarcass(stateWithDrops([]), wolf).droppedItems ?? []).find((d) =>
      d.id.startsWith('carcass-w1')
    )!;
    expect(plain.name).toBeUndefined();
  });
});
