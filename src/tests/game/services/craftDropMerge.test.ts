import { describe, it, expect } from 'vitest';
import { completeCraftOrder } from '$lib/game/services/jobs/craft';
import { itemService } from '$lib/game/services/ItemService';
import { recipeService } from '$lib/game/services/RecipeService';
import type { GameState, DroppedItem } from '$lib/game/core/types';

/**
 * Render-side FPS regression guard: repeated craft completions at a NON-stockpile station must fold
 * their plain bulk outputs into a single loose pile per resource on the station tile, instead of
 * spawning a fresh stack every completion. Otherwise `droppedItems` grows unbounded and the per-frame
 * item overlay (overlayDroppedItems) re-iterates them all every frame, collapsing FPS while TPS holds.
 */
function order(id: string): any {
  return {
    id,
    item: itemService.getItemById('green_firewood')!,
    quantity: 1,
    workRequired: 2,
    workDone: 2,
    startedAt: 0,
    inputs: { pine_log: 1 },
    stationType: recipeService.getRecipeForItem('green_firewood')!.station,
    stationBuildingId: 'cb-1'
  };
}

function baseState(): GameState {
  const station = { id: 'cb-1', type: order('x').stationType, x: 5, y: 5, status: 'complete' } as any;
  // Two staged log inputs, one reserved per order — the station tile (5,5) is NOT a stockpile.
  const drops: DroppedItem[] = [
    { id: 'in1', resourceId: 'pine_log', x: 5, y: 5, quantity: 1, stored: true, reservedFor: 'cq1' },
    { id: 'in2', resourceId: 'pine_log', x: 5, y: 5, quantity: 1, stored: true, reservedFor: 'cq2' }
  ];
  return {
    seed: 1,
    turn: 0,
    pawns: [],
    buildings: [station],
    stockpile: {},
    stockpileZones: [],
    droppedItems: drops,
    designations: {},
    zoneTiles: {},
    jobs: [],
    craftingQueue: [order('cq1'), order('cq2')]
  } as unknown as GameState;
}

describe('craft output drop merge (non-stockpile station)', () => {
  it('two completions fold into ONE green_firewood + ONE branch loose stack on the station tile', () => {
    let gs = baseState();
    gs = completeCraftOrder(gs.craftingQueue[0] as any, gs);
    gs = completeCraftOrder(gs.craftingQueue[0] as any, gs);

    const fw = (gs.droppedItems ?? []).filter((d) => d.resourceId === 'green_firewood');
    const branch = (gs.droppedItems ?? []).filter((d) => d.resourceId === 'branch');
    // One stack each (merged), not two.
    expect(fw).toHaveLength(1);
    expect(branch).toHaveLength(1);
    // Quantities accumulate: split_firewood yields 6 firewood + 2 branch per run, ×2 runs.
    expect(fw[0].quantity).toBe(12);
    expect(branch[0].quantity).toBe(4);
    // Both staged inputs consumed.
    expect((gs.droppedItems ?? []).some((d) => d.resourceId === 'pine_log')).toBe(false);
  });
});
