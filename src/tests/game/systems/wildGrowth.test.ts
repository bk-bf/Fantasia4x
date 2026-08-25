import { describe, it, expect, beforeEach } from 'vitest';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
import { complete as completeHarvest } from '$lib/game/services/jobs/harvest';
import { clearTileDeltas, drainTileDeltas } from '$lib/game/core/state/tileDeltas';
import {
  addWildGrowth,
  clearWildGrowth,
  wildGrowthSize,
  RESOURCE_VISIBLE_GROWTH
} from '$lib/game/core/rules/world/wildGrowth';
import type { GameState, Job, WorldTile } from '$lib/game/core/types';

function tile(over: Partial<WorldTile>): WorldTile {
  return {
    x: 0,
    y: 0,
    walkable: true,
    terrainType: 'plains',
    subType: 'bush',
    resources: {} as Record<string, number>,
    ...over
  } as WorldTile;
}

function runWildGrowth(worldMap: WorldTile[][], turn: number, season = 'summer'): void {
  const eng = gameEngine as unknown as {
    gameState: Partial<GameState>;
    processWildGrowth: () => void;
  };
  eng.gameState = { turn, season, worldMap } as Partial<GameState>;
  eng.processWildGrowth();
}

function harvestJob(resourceId: string): Job {
  return {
    id: 'h',
    type: 'harvest',
    targetX: 0,
    targetY: 0,
    resourceId,
    workRequired: 6,
    workDone: 6,
    claimedBy: null
  } as Job;
}

function baseState(worldMap: WorldTile[][], turn: number): GameState {
  return {
    turn,
    season: 'summer',
    worldMap,
    pawns: [],
    designations: {},
    droppedItems: []
  } as unknown as GameState;
}

describe('gradual wild-plant regrowth (regrowsFromZero)', () => {
  beforeEach(() => {
    clearTileDeltas();
    clearWildGrowth();
  });

  it('harvest resets a berry bush to growth 0, drops the count, sets no cooldown, and enrols the tile', () => {
    const t = tile({ resources: { berry_bush: 4 }, growth: { berry_bush: 100 } });
    completeHarvest(harvestJob('berry_bush'), baseState([[t]], 50));

    expect(t.resources.berry_bush).toBe(0);
    expect(t.growth?.berry_bush).toBe(0);
    expect(t.resourceCooldowns?.berry_bush).toBeUndefined();
    expect(t.subType).toBe('bush');
    expect(wildGrowthSize()).toBe(1);
  });

  it('climbs growth in place while immature, then restores the count + leaves the work-list at maturity', () => {
    const r = tile({
      subType: 'savanna',
      resources: { wild_barley: 0 },
      growth: { wild_barley: 0 }
    });
    addWildGrowth(0, 0);
    const map = [[r]];

    for (let i = 0; i < 5000; i++) runWildGrowth(map, i);
    expect(r.growth!.wild_barley).toBeGreaterThan(0);
    expect(r.growth!.wild_barley).toBeLessThan(100);
    expect(r.resources.wild_barley).toBe(0);
    expect(wildGrowthSize()).toBe(1);

    r.growth!.wild_barley = 100 - 1e-9;
    runWildGrowth(map, 5001);
    expect(r.growth!.wild_barley).toBe(100);
    expect(r.resources.wild_barley).toBeGreaterThanOrEqual(1);
    expect(wildGrowthSize()).toBe(0);
  });

  it('appears (ships a delta) only when growth crosses the visible threshold, not every tick', () => {
    const r = tile({ subType: 'grass', resources: { grass_patch: 5 }, growth: { grass_patch: 5 } });
    r.resources.grass_patch = 0;
    addWildGrowth(0, 0);
    const map = [[r]];

    clearTileDeltas();
    runWildGrowth(map, 0);
    expect(r.growth!.grass_patch).toBeGreaterThan(5);
    expect(r.growth!.grass_patch).toBeLessThan(RESOURCE_VISIBLE_GROWTH);
    expect(drainTileDeltas()).toBeNull();

    r.growth!.grass_patch = RESOURCE_VISIBLE_GROWTH - 0.001;
    clearTileDeltas();
    runWildGrowth(map, 1);
    expect(r.growth!.grass_patch).toBeGreaterThanOrEqual(RESOURCE_VISIBLE_GROWTH);
    expect(drainTileDeltas()).not.toBeNull();
  });
});
