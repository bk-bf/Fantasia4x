import { describe, it, expect } from 'vitest';
import { jobService } from './JobService';
import { itemService } from './ItemService';
import { recipeService } from './RecipeService';
import type { GameState } from '../core/types';

/**
 * ADR-016 queue-without-materials: a craft order can be queued `pending` (no input reservations) when
 * the materials aren't stocked. `reservePendingCraftOrders` retries reservation each tick and clears
 * `pending` ATOMICALLY — only once the FULL input set is reservable. Until then the order generates no
 * fetch/craft jobs and the stock stays free.
 */
function makeState(stockQty: number): GameState {
  const greenFirewood = itemService.getItemById('green_firewood')!;
  const recipe = recipeService.getRecipeForItem('green_firewood')!;
  const inputId = Object.keys(recipe.inputs)[0];
  const perRun = recipe.inputs[inputId];
  const quantity = 2;
  const needed = perRun * quantity;

  const station = { id: 'cb-1', type: recipe.station, x: 5, y: 5, status: 'complete' } as any;
  // Free (unreserved) stored stock sitting on a stockpile tile.
  const drop =
    stockQty > 0
      ? [{ id: 'd-free', resourceId: inputId, x: 9, y: 9, quantity: stockQty, stored: true }]
      : [];

  return {
    seed: 1,
    turn: 0,
    pawns: [],
    item: [],
    buildings: [station],
    stockpile: { [inputId]: stockQty },
    stockpileZones: [],
    droppedItems: drop,
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
        pending: true,
        inputs: { [inputId]: needed },
        stationType: recipe.station,
        stationBuildingId: 'cb-1'
      }
    ]
  } as unknown as GameState;
}

describe('reservePendingCraftOrders (ADR-016 queue-without-materials)', () => {
  it('clears pending and reserves inputs once the full set is in stock', () => {
    const greenFirewood = itemService.getItemById('green_firewood')!;
    const recipe = recipeService.getRecipeForItem('green_firewood')!;
    const inputId = Object.keys(recipe.inputs)[0];
    const needed = recipe.inputs[inputId] * 2;

    const gs = jobService.reservePendingCraftOrders(makeState(needed));

    expect(gs.craftingQueue[0].pending).toBeFalsy();
    const reserved = (gs.droppedItems ?? []).filter((d) => d.reservedFor === 'cq1');
    expect(reserved.reduce((s, d) => s + d.quantity, 0)).toBe(needed);
    void greenFirewood;
  });

  it('leaves the order pending and reserves nothing when stock is short', () => {
    const recipe = recipeService.getRecipeForItem('green_firewood')!;
    const inputId = Object.keys(recipe.inputs)[0];
    const needed = recipe.inputs[inputId] * 2;

    const gs = jobService.reservePendingCraftOrders(makeState(needed - 1));

    expect(gs.craftingQueue[0].pending).toBe(true);
    const reserved = (gs.droppedItems ?? []).filter((d) => d.reservedFor === 'cq1');
    expect(reserved.length).toBe(0);
  });

  it('generates no fetch/craft job for a pending order', () => {
    const recipe = recipeService.getRecipeForItem('green_firewood')!;
    const inputId = Object.keys(recipe.inputs)[0];
    const needed = recipe.inputs[inputId] * 2;

    const gs = jobService.generateJobs(makeState(needed - 1));
    expect((gs.jobs ?? []).some((j) => j.craftQueueId === 'cq1')).toBe(false);
  });
});
