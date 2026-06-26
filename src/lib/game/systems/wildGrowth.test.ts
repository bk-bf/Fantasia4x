import { describe, it, expect, beforeEach } from 'vitest';
import { gameEngine } from './GameEngineImpl';
import { complete as completeHarvest } from '../services/jobs/harvest';
import { clearTileDeltas, drainTileDeltas } from '../core/tileDeltas';
import {
  addWildGrowth,
  clearWildGrowth,
  wildGrowthSize,
  RESOURCE_VISIBLE_GROWTH
} from '../core/wildGrowth';
import type { GameState, Job, WorldTile } from '../core/types';

/**
 * Gradual wild-plant regrowth (`regrowsFromZero` — berry bushes, wild grain, grass). A harvest resets
 * the node to growth 0% (bare soil revealed, subType untouched — never forced to barren dirt), then
 * `processWildGrowth` climbs growth 0→100 over the interaction's `regrowthTurns` and restores the count
 * at maturity. This locks in: (1) harvest zeroes growth + drops the count + enrols the tile (no binary
 * cooldown set), (2) the pass advances growth in place and restores the count at 100% then leaves the
 * work-list, (3) deltas ship only on a visual bucket change (not every tick).
 */
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

    expect(t.resources.berry_bush).toBe(0); // node consumed
    expect(t.growth?.berry_bush).toBe(0); // reset to bare soil
    expect(t.resourceCooldowns?.berry_bush).toBeUndefined(); // gradual regrow, NOT a binary cooldown
    expect(t.subType).toBe('bush'); // soil/subtype untouched — never forced to barren dirt
    expect(wildGrowthSize()).toBe(1); // tile enrolled in the regrow work-list
  });

  it('climbs growth in place while immature, then restores the count + leaves the work-list at maturity', () => {
    // Full maturity is regrowthTurns × TICKS_PER_SECOND (tens of thousands of ticks), so assert the
    // climb over a window, then jump growth to the cusp to exercise the maturity branch directly.
    const r = tile({
      subType: 'savanna',
      resources: { wild_barley: 0 },
      growth: { wild_barley: 0 }
    });
    addWildGrowth(0, 0);
    const map = [[r]];

    for (let i = 0; i < 5000; i++) runWildGrowth(map, i);
    expect(r.growth!.wild_barley).toBeGreaterThan(0); // advancing in place
    expect(r.growth!.wild_barley).toBeLessThan(100); // not matured partway through
    expect(r.resources.wild_barley).toBe(0); // no nodes until it matures
    expect(wildGrowthSize()).toBe(1); // still regrowing

    r.growth!.wild_barley = 100 - 1e-9; // on the cusp — any positive increment matures it
    runWildGrowth(map, 5001);
    expect(r.growth!.wild_barley).toBe(100);
    expect(r.resources.wild_barley).toBeGreaterThanOrEqual(1); // count restored — harvestable again
    expect(wildGrowthSize()).toBe(0); // done — removed from the work-list
  });

  it('appears (ships a delta) only when growth crosses the visible threshold, not every tick', () => {
    const r = tile({ subType: 'grass', resources: { grass_patch: 5 }, growth: { grass_patch: 5 } });
    // count must be 0 while regrowing — 5 above was just to satisfy the helper shape; reset it.
    r.resources.grass_patch = 0;
    addWildGrowth(0, 0);
    const map = [[r]];

    // A tick well below the threshold → still bare soil, no visual change, no delta.
    clearTileDeltas();
    runWildGrowth(map, 0);
    expect(r.growth!.grass_patch).toBeGreaterThan(5);
    expect(r.growth!.grass_patch).toBeLessThan(RESOURCE_VISIBLE_GROWTH);
    expect(drainTileDeltas()).toBeNull();

    // Nudge it to the cusp and tick → it crosses the threshold and the fade-in ships exactly one delta.
    r.growth!.grass_patch = RESOURCE_VISIBLE_GROWTH - 0.001;
    clearTileDeltas();
    runWildGrowth(map, 1);
    expect(r.growth!.grass_patch).toBeGreaterThanOrEqual(RESOURCE_VISIBLE_GROWTH);
    expect(drainTileDeltas()).not.toBeNull(); // the plant fading in shipped a delta
  });
});
