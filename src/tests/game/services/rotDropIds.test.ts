import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import * as haul from '$lib/game/services/jobs/haul';
import { buildScenario } from '$lib/game/headless/Scenario';
import type { GameState, DroppedItem, Job } from '$lib/game/core/types';

function state(drops: DroppedItem[]): GameState {
  return {
    seed: 1,
    turn: 0,
    stockpile: {},
    stockpileZones: [],
    droppedItems: drops,
    buildings: []
  } as unknown as GameState;
}

const meat = (p: Partial<DroppedItem>): DroppedItem =>
  ({ resourceId: 'venison', x: 5, y: 5, quantity: 3, decayAcc: 599.999, ...p }) as DroppedItem;

const idsUnique = (gs: GameState) => {
  const ids = gs.droppedItems!.map((d) => d.id);
  return new Set(ids).size === ids.length;
};

describe('rotting never mints a drop id that is already taken', () => {
  it('a stored and a loose stack rotting on one tile get distinct ids', () => {
    const out = itemService.stepItemDecay(
      state([meat({ id: 'loose' }), meat({ id: 'stored', stored: true })])
    );
    expect(out.droppedItems!.filter((d) => d.resourceId === 'rotten_meat')).toHaveLength(2);
    expect(idsUnique(out)).toBe(true);
  });

  it('a second rot on a tile whose first rot stack was moved away keeps ids unique', () => {
    const moved = {
      id: 'rot-rotten_meat-5-5',
      resourceId: 'rotten_meat',
      x: 9,
      y: 9,
      quantity: 1
    } as DroppedItem;
    const out = itemService.stepItemDecay(state([moved, meat({ id: 'loose' })]));
    expect(idsUnique(out)).toBe(true);
  });

  it('hauling the loose rot stack leaves the stored one on the tile', () => {
    const base = buildScenario({
      seed: 3,
      map: { w: 12, h: 12 },
      pawns: [{ count: 1 }],
      seedEntities: false
    });
    const pawn = base.pawns[0];
    const rotted = itemService.stepItemDecay({
      ...base,
      droppedItems: [meat({ id: 'loose' }), meat({ id: 'stored', stored: true })]
    });
    const loose = rotted.droppedItems!.find((d) => d.resourceId === 'rotten_meat' && !d.stored)!;
    const job = {
      id: 'j',
      type: 'haul',
      droppedItemId: loose.id,
      claimedBy: pawn.id,
      targetX: 5,
      targetY: 5
    } as unknown as Job;
    const out = haul.complete(job, rotted);
    const stored = out.droppedItems!.filter((d) => d.resourceId === 'rotten_meat' && d.stored);
    const carried = out.pawns.find((p) => p.id === pawn.id)!.inventory?.items?.rotten_meat ?? 0;
    expect(stored.reduce((a, d) => a + d.quantity, 0)).toBe(1);
    expect(carried).toBe(1);
  });
});
