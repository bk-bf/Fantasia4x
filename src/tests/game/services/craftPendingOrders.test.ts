import { describe, it, expect } from 'vitest';
import { jobService } from '$lib/game/services/JobService';
import { itemService } from '$lib/game/services/ItemService';
import { recipeService } from '$lib/game/services/RecipeService';
import type { GameState } from '$lib/game/core/types';

function makeState(stockQty: number): GameState {
  const greenFirewood = itemService.getItemById('green_firewood')!;
  const recipe = recipeService.getRecipeForItem('green_firewood')!;
  const slot = Object.values(recipe.dynamicRecipe ?? {})[0];
  const inputId = Object.keys(recipe.inputs)[0] ?? 'pine_log';
  const perRun = recipe.inputs[inputId] ?? slot.quantity;
  const quantity = 2;
  const needed = perRun * quantity;

  const station = { id: 'cb-1', type: recipe.station, x: 5, y: 5, status: 'complete' } as any;
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
    const needed = (Object.values(recipe.dynamicRecipe ?? {})[0].quantity ?? 1) * 2;

    const gs = jobService.reservePendingCraftOrders(makeState(needed));

    expect(gs.craftingQueue[0].pending).toBeFalsy();
    const reserved = (gs.droppedItems ?? []).filter((d) => d.reservedFor === 'cq1');
    expect(reserved.reduce((s, d) => s + d.quantity, 0)).toBe(needed);
    void greenFirewood;
  });

  it('leaves the order pending and reserves nothing when stock is short', () => {
    const recipe = recipeService.getRecipeForItem('green_firewood')!;
    const needed = (Object.values(recipe.dynamicRecipe ?? {})[0].quantity ?? 1) * 2;

    const gs = jobService.reservePendingCraftOrders(makeState(needed - 1));

    expect(gs.craftingQueue[0].pending).toBe(true);
    const reserved = (gs.droppedItems ?? []).filter((d) => d.reservedFor === 'cq1');
    expect(reserved.length).toBe(0);
  });

  it('generates no fetch/craft job for a pending order', () => {
    const recipe = recipeService.getRecipeForItem('green_firewood')!;
    const needed = (Object.values(recipe.dynamicRecipe ?? {})[0].quantity ?? 1) * 2;

    const gs = jobService.generateJobs(makeState(needed - 1));
    expect((gs.jobs ?? []).some((j) => j.craftQueueId === 'cq1')).toBe(false);
  });
});

describe('reservePendingCraftOrders with stock that cannot cover the order', () => {
  function forgeOrder(stationLitres: number, drops: object[]): GameState {
    return {
      turn: 1,
      buildings: [
        {
          id: 'forge',
          type: 'stone_forge',
          x: 1,
          y: 1,
          status: 'complete',
          fluidContents: stationLitres > 0 ? [{ itemId: 'molten_copper', litres: stationLitres }] : []
        }
      ],
      droppedItems: drops,
      craftingQueue: [
        {
          id: 'bar',
          item: { id: 'copper_bar' },
          inputs: { molten_copper: 1, clay_mold: 2 },
          pending: true,
          stationBuildingId: 'forge'
        }
      ]
    } as unknown as GameState;
  }
  const molds = { id: 'molds', resourceId: 'clay_mold', x: 0, y: 0, quantity: 3, stored: true };

  it('hands back the same state while an input is missing', () => {
    const gs = forgeOrder(0, [molds]);
    expect(jobService.reservePendingCraftOrders(gs)).toBe(gs);
  });

  it('counts the fluid the station already holds toward the order', () => {
    const out = jobService.reservePendingCraftOrders(forgeOrder(1, [molds]));
    expect(out.craftingQueue[0].pending).toBeUndefined();
    const reserved = (out.droppedItems ?? []).filter((d) => d.reservedFor === 'bar');
    expect(reserved.map((d) => d.quantity)).toEqual([2]);
  });

  it('counts fluid carried in a stored vessel toward the order', () => {
    const flask = {
      id: 'flask',
      resourceId: 'flask',
      x: 0,
      y: 0,
      quantity: 1,
      stored: true,
      instance: {
        instanceId: 'f',
        itemId: 'flask',
        durability: 5,
        contents: [{ itemId: 'molten_copper', litres: 1 }]
      }
    };
    const out = jobService.reservePendingCraftOrders(forgeOrder(0, [molds, flask]));
    expect(out.craftingQueue[0].pending).toBeUndefined();
    expect((out.droppedItems ?? []).find((d) => d.id === 'flask')?.reservedFor).toBe('bar');
  });
});
