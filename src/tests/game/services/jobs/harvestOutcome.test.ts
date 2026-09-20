import { describe, it, expect, beforeEach } from 'vitest';
import { complete as completeHarvest } from '$lib/game/services/jobs/harvest';
import { clearTileDeltas } from '$lib/game/core/state/tileDeltas';
import { clearGrowthQueue, growthQueueSize } from '$lib/game/core/rules/world/growthQueue';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import type { DesignationType, GameState, Job, WorldTile } from '$lib/game/core/types';

function tile(over: Partial<WorldTile>): WorldTile {
  return {
    x: 0,
    y: 0,
    walkable: true,
    terrainType: 'plains',
    subType: 'grass',
    resources: {} as Record<string, number>,
    ...over
  } as WorldTile;
}

function harvest(t: WorldTile, resourceId: string, dtype: DesignationType): GameState {
  const gs = {
    turn: 500,
    season: 'summer',
    worldMap: [[t]],
    pawns: [],
    designations: { '0,0': dtype },
    droppedItems: []
  } as unknown as GameState;
  const job = {
    id: 'h',
    type: 'harvest',
    targetX: 0,
    targetY: 0,
    resourceId,
    workRequired: 6,
    workDone: 6,
    claimedBy: null
  } as Job;
  return completeHarvest(job, gs);
}

const dropped = (gs: GameState, itemId: string) =>
  (gs.droppedItems ?? [])
    .filter((d) => d.resourceId === itemId)
    .reduce((n, d) => n + (d.quantity ?? 0), 0);

describe('one harvest, one outcome', () => {
  beforeEach(() => {
    clearTileDeltas();
    clearGrowthQueue();
  });

  it('foraging a tree strips it to the growth its data names and leaves it standing', () => {
    const t = tile({
      subType: 'forest',
      walkable: false,
      resources: { pine_tree: 3 },
      growth: { pine_tree: 100 }
    });
    const gs = harvest(t, 'pine_tree', 'forage');

    expect(t.growth!.pine_tree).toBe(35);
    expect(t.resources.pine_tree).toBe(3);
    expect(growthQueueSize()).toBe(1);
    expect(dropped(gs, 'branch')).toBe(5);
  });

  it('felling a tree clears the tile and enrols nothing', () => {
    const t = tile({
      subType: 'forest',
      walkable: false,
      resources: { pine_tree: 3 },
      growth: { pine_tree: 100 }
    });
    const gs = harvest(t, 'pine_tree', 'woodcut');

    expect(t.resources.pine_tree).toBe(0);
    expect(t.growth!.pine_tree).toBeUndefined();
    expect(growthQueueSize()).toBe(0);
    expect(dropped(gs, 'pine_log')).toBe(5);
    expect(dropped(gs, 'branch')).toBe(10);
  });

  it('felling a stripped tree yields its branches but no timber', () => {
    const t = tile({
      subType: 'forest',
      walkable: false,
      resources: { pine_tree: 3 },
      growth: { pine_tree: 35 }
    });
    const gs = harvest(t, 'pine_tree', 'woodcut');

    expect(dropped(gs, 'pine_log')).toBe(0);
    expect(dropped(gs, 'branch')).toBe(4);
  });

  it('cutting grass takes the whole patch to zero and queues its regrowth', () => {
    const t = tile({ resources: { grass_patch: 4 }, growth: { grass_patch: 100 } });
    const gs = harvest(t, 'grass_patch', 'harvest');

    expect(t.resources.grass_patch).toBe(0);
    expect(t.growth!.grass_patch).toBe(0);
    expect(growthQueueSize()).toBe(1);
    expect(dropped(gs, 'plant_fiber')).toBe(5);
  });

  it('a half-grown patch drops half, and growth still resets to zero', () => {
    const t = tile({ resources: { grass_patch: 4 }, growth: { grass_patch: 50 } });
    const gs = harvest(t, 'grass_patch', 'harvest');

    expect(dropped(gs, 'plant_fiber')).toBe(3);
    expect(t.growth!.grass_patch).toBe(0);
  });

  it('reaping an annual crop clears the bed so it can be sown again', () => {
    const t = tile({
      subType: 'rich_soil',
      resources: { crop_wheat: 1 },
      growth: { crop_wheat: 100 }
    });
    harvest(t, 'crop_wheat', 'harvest');

    expect(t.resources.crop_wheat).toBe(0);
    expect(t.growth!.crop_wheat).toBeUndefined();
  });

  it('reaping a perennial crop resets it to zero and regrows it in place', () => {
    const t = tile({
      subType: 'rich_soil',
      resources: { crop_berries: 1 },
      growth: { crop_berries: 100 }
    });
    harvest(t, 'crop_berries', 'harvest');

    expect(t.growth!.crop_berries).toBe(0);
    expect(growthQueueSize()).toBe(1);
  });

  it('an ore vein keeps its roll: repeated mines do not all give the same amount', () => {
    const amounts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const t = tile({ subType: 'cave', resources: { hematite: 1 } });
      amounts.add(dropped(harvest(t, 'hematite', 'harvest'), 'hematite'));
    }
    expect(amounts.size).toBeGreaterThan(1);
    expect(Math.max(...amounts)).toBeLessThanOrEqual(6);
    expect(Math.min(...amounts)).toBeGreaterThanOrEqual(2);
  });

  it('a growable yield is one number at full growth, with no roll left in it', () => {
    const amounts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      amounts.add(
        resourceObjectService.calculateYield('grass_patch', undefined, 'harvest', 100).plant_fiber
      );
    }
    expect([...amounts]).toEqual([5]);
  });
});
