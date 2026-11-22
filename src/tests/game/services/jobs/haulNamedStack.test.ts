import { describe, it, expect } from 'vitest';
import type { GameState, Job, Pawn, DroppedItem } from '$lib/game/core/types';
import { jobService } from '$lib/game/services/JobService';
import { buildScenario } from '$lib/game/headless/Scenario';
import { completeCraftOrder } from '$lib/game/services/jobs/craft';

const BASE = buildScenario({
  seed: 3,
  map: { w: 12, h: 12 },
  pawns: [{ count: 1 }],
  seedEntities: false
});

function stewCount(gs: GameState): number {
  const p = gs.pawns[0];
  const inst = (p.inventory?.instances ?? []).filter((i) => i.itemId === 'small_stew').length;
  const bulk = p.inventory?.items?.small_stew ?? 0;
  const ground = (gs.droppedItems ?? [])
    .filter((d) => d.resourceId === 'small_stew')
    .reduce((s, d) => s + d.quantity, 0);
  return inst + bulk + ground;
}

function state(quantity: number, name?: string): GameState {
  const real = BASE.pawns[0];
  const pawn = {
    ...real,
    id: 'p1',
    position: { x: 2, y: 2 },
    inventory: { ...(real.inventory ?? {}), items: {}, instances: [] }
  } as unknown as Pawn;
  const drop = {
    id: 'stew-1',
    resourceId: 'small_stew',
    x: 2,
    y: 2,
    quantity,
    ...(name ? { name } : {})
  } as DroppedItem;
  const job: Job = {
    id: 'haul-stew-1',
    type: 'haul',
    targetX: 2,
    targetY: 2,
    resourceId: 'small_stew',
    droppedItemId: 'stew-1',
    workRequired: 0.02,
    workDone: 0,
    claimedBy: 'p1'
  };
  return {
    ...BASE,
    turn: 10,
    pawns: [pawn],
    jobs: [job],
    designations: {},
    zoneTiles: { '0,0': ['stockpile'] },
    droppedItems: [drop],
    craftingQueue: [],
    buildings: []
  } as unknown as GameState;
}

describe('hauling a stack of a dynamically named dish', () => {
  for (const [q, name] of [
    [3, 'Rabbit Stew'],
    [2, undefined],
    [1, 'Rabbit Stew']
  ] as const) {
    it(`keeps every unit of a ${q}-stack ${name ? 'named' : 'unnamed'} stew`, () => {
      const before = state(q, name);
      const after = jobService.advanceJob('haul-stew-1', 1, before);
      expect(after.jobs).toHaveLength(0);
      expect(stewCount(after)).toBe(stewCount(before));
      const carried = (after.pawns[0].inventory?.instances ?? []).filter(
        (i) => i.itemId === 'small_stew'
      );
      expect(new Set(carried.map((i) => i.instanceId)).size).toBe(carried.length);
      for (const i of carried) expect(i.name).toBe(name);
    });
  }

  it('a two-stew order leaves one stack of two named stews at the campfire', () => {
    const gs = {
      ...BASE,
      turn: 20,
      zoneTiles: {},
      droppedItems: [],
      buildings: [{ id: 'camp-1', type: 'campfire', x: 5, y: 5, status: 'complete' }],
      craftingQueue: []
    } as unknown as GameState;
    const entry = {
      id: 'o1',
      item: { id: 'small_stew' },
      recipeId: 'make_small_stew',
      quantity: 2,
      inputs: {},
      stationType: 'campfire',
      stationBuildingId: 'camp-1',
      selectedIngredients: { ingredient1: 'rabbit_meat', ingredient2: 'wild_oats' }
    } as never;
    const out = completeCraftOrder(entry, gs);
    const stew = (out.droppedItems ?? []).filter((d) => d.resourceId === 'small_stew');
    expect(stew).toHaveLength(1);
    expect(stew[0].quantity).toBe(2);
    expect(stew[0].name).toBeTruthy();
  });
});
