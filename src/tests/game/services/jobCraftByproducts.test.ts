import { describe, it, expect } from 'vitest';
import { jobService } from '$lib/game/services/JobService';
import { itemService } from '$lib/game/services/ItemService';
import { recipeService } from '$lib/game/services/RecipeService';
import type { GameState } from '$lib/game/core/types';

/**
 * Recipe registry Stage C + ADR-016 — a completed craft job runs its producing recipe and emits
 * ALL outputs (primary + byproducts) as physical drops ON the station tile, NOT into the legacy
 * `gs.item` pool. `split_firewood` (recipes.jsonc): 1 log → 3 green_firewood + 2 branch.
 */
function makeState(): GameState {
  const greenFirewood = itemService.getItemById('green_firewood')!;
  const recipe = recipeService.getRecipeForItem('green_firewood')!;
  // split_firewood sources its log via a dynamicRecipe slot now; a real queued order carries the
  // concrete chosen log. Use pine_log as that concrete fill, staged on the station tile.
  const slot = Object.values(recipe.dynamicRecipe ?? {})[0];
  const inputId = Object.keys(recipe.inputs)[0] ?? 'pine_log';
  const perRun = recipe.inputs[inputId] ?? slot.quantity;
  const quantity = 2;

  const station = { id: 'cb-1', type: recipe.station, x: 5, y: 5, status: 'complete' } as any;
  const staged = {
    id: 'd-in',
    resourceId: inputId,
    x: 5,
    y: 5,
    quantity: perRun * quantity,
    stored: true,
    reservedFor: 'cq1'
  };

  return {
    seed: 1,
    turn: 0,
    pawns: [],
    item: [],
    buildings: [station],
    stockpile: {},
    stockpileZones: [],
    droppedItems: [staged],
    designations: {},
    jobs: [],
    craftingQueue: [
      {
        id: 'cq1',
        item: greenFirewood,
        quantity,
        workRequired: 4,
        workDone: 0,
        startedAt: 0,
        inputs: { [inputId]: perRun * quantity },
        stationType: recipe.station,
        stationBuildingId: 'cb-1'
      }
    ]
  } as unknown as GameState;
}

describe('craft completion emits recipe byproducts as station drops (Stage C + ADR-016)', () => {
  it('split_firewood ×2 yields 12 green_firewood (primary) + 4 branch (byproduct) on the station', () => {
    let gs = jobService.generateJobs(makeState());
    const craftJob = gs.jobs.find((j) => j.type === 'craft');
    expect(craftJob).toBeDefined();

    gs = jobService.advanceJob(craftJob!.id, 4, gs);

    const drops = gs.droppedItems ?? [];
    const fw = drops.find((d) => d.resourceId === 'green_firewood' && d.x === 5 && d.y === 5);
    const branch = drops.find((d) => d.resourceId === 'branch' && d.x === 5 && d.y === 5);
    expect(fw?.quantity).toBe(12); // 6 per craft × quantity 2
    expect(branch?.quantity).toBe(4); // 2 per craft × quantity 2
    // Staged input consumed; queue drained.
    expect(drops.some((d) => d.reservedFor === 'cq1')).toBe(false);
    expect(gs.craftingQueue).toHaveLength(0);
  });
});
