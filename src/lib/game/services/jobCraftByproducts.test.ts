import { describe, it, expect } from 'vitest';
import { jobService } from './JobService';
import { itemService } from './ItemService';
import type { GameState, Job } from '../core/types';

/**
 * Recipe registry Stage C — a completed craft job runs its producing recipe and emits ALL
 * outputs: the primary product (× recipe output qty × queued quantity) plus byproducts.
 * `split_firewood` (authored, recipes.jsonc): 1 log → 3 green_firewood + 2 branch.
 */
function makeState(): GameState {
  const greenFirewood = itemService.getItemById('green_firewood')!;
  const job: Job = {
    id: 'job1',
    type: 'craft',
    targetX: 0,
    targetY: 0,
    craftQueueId: 'cq1',
    workRequired: 10,
    workDone: 9, // one more point completes it
    claimedBy: null
  };
  return {
    seed: 1,
    turn: 0,
    pawns: [],
    item: [],
    buildings: [],
    stockpile: {},
    stockpileZones: [],
    droppedItems: [],
    designations: {},
    jobs: [job],
    craftingQueue: [{ id: 'cq1', item: greenFirewood, quantity: 2, workDone: 0 }]
  } as unknown as GameState;
}

describe('craft completion emits recipe byproducts (Stage C)', () => {
  it('split_firewood ×2 yields 6 green_firewood (primary) and 4 branch (byproduct)', () => {
    const out = jobService.advanceJob('job1', 5, makeState());
    const fw = out.item.find((i) => i.id === 'green_firewood');
    expect(fw?.amount).toBe(6); // 3 per craft × quantity 2
    expect(out.stockpile['branch'] ?? 0).toBe(4); // 2 per craft × quantity 2 → stockpile
  });
});
