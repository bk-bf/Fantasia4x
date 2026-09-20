import { describe, it, expect, beforeEach } from 'vitest';
import { gameEngine } from '$lib/game/systems/GameEngineImpl';
import { clearTileDeltas, drainTileDeltas, markTileDirty } from '$lib/game/core/state/tileDeltas';
import {
  clearGrowthQueue,
  enrolGrowth,
  growthQueueSize,
  peekGrowthTurn,
  popGrowth,
  pushGrowth,
  rebuildGrowthQueue,
  tileIsGrowing
} from '$lib/game/core/rules/world/growthQueue';
import {
  growthScale,
  growthStageIndex,
  GROWTH_STAGES,
  RESOURCE_VISIBLE_GROWTH
} from '$lib/game/core/rules/world/growthStages';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import { ticksFromSeconds } from '$lib/game/core/util/time';
import type { GameState, WorldTile } from '$lib/game/core/types';

function tile(over: Partial<WorldTile>): WorldTile {
  return {
    x: 0,
    y: 0,
    walkable: true,
    terrainType: 'plains',
    subType: 'grass',
    moisture: 40,
    growthTurn: 0,
    resources: {} as Record<string, number>,
    ...over
  } as WorldTile;
}

function runGrowth(worldMap: WorldTile[][], turn: number, season = 'summer'): void {
  const eng = gameEngine as unknown as {
    gameState: Partial<GameState>;
    processPlantGrowth: () => void;
  };
  eng.gameState = { turn, season, worldMap, weather: { type: 'clear' } } as Partial<GameState>;
  eng.processPlantGrowth();
}

const GRASS_PER_PERCENT =
  ticksFromSeconds(resourceObjectService.getById('grass_patch')!.growthTurns!) / 100;

describe('plant growth runs off a queue, not every tick', () => {
  beforeEach(() => {
    clearTileDeltas();
    clearGrowthQueue();
  });

  it('wakes a growing tile once per whole percent of its clock', () => {
    const t = tile({ resources: { grass_patch: 0 }, growth: { grass_patch: 0 } });
    const map = [[t]];
    runGrowth(map, 0);
    runGrowth(map, 1);

    expect(peekGrowthTurn() - 1).toBeCloseTo(GRASS_PER_PERCENT, 0);
    expect(GRASS_PER_PERCENT).toBeGreaterThan(300);
  });

  it('ticks between wake-ups leave the tile untouched', () => {
    const t = tile({ resources: { grass_patch: 0 }, growth: { grass_patch: 0 } });
    const map = [[t]];
    runGrowth(map, 0);
    runGrowth(map, 1);
    const afterFirst = t.growth!.grass_patch;

    for (let turn = 2; turn < GRASS_PER_PERCENT; turn++) runGrowth(map, turn);
    expect(t.growth!.grass_patch).toBe(afterFirst);

    runGrowth(map, Math.ceil(GRASS_PER_PERCENT) + 1);
    expect(t.growth!.grass_patch).toBeGreaterThan(afterFirst);
  });

  it('a cut patch climbs to full over its growth clock and never past 100', () => {
    const t = tile({ resources: { grass_patch: 0 }, growth: { grass_patch: 0 } });
    const map = [[t]];
    const full = ticksFromSeconds(600);
    for (let turn = 0; turn <= full * 1.1; turn += Math.floor(GRASS_PER_PERCENT)) {
      runGrowth(map, turn);
    }
    expect(t.growth!.grass_patch).toBe(100);
    expect(growthQueueSize()).toBe(0);
  });

  it('restocks the node the moment growth reaches the data gate, not before', () => {
    const t = tile({ resources: { grass_patch: 0 }, growth: { grass_patch: 0 } });
    const map = [[t]];
    const gate = resourceObjectService.minHarvestGrowth('grass_patch');
    expect(gate).toBe(50);

    let turn = 0;
    while (t.growth!.grass_patch < gate) {
      expect(t.resources.grass_patch).toBe(0);
      turn += Math.ceil(GRASS_PER_PERCENT);
      runGrowth(map, turn);
    }
    expect(t.resources.grass_patch).toBeGreaterThan(0);
  });

  it('ships a delta when a stage boundary is crossed, and stays quiet between stages', () => {
    const t = tile({ resources: { grass_patch: 0 }, growth: { grass_patch: 0 } });
    const map = [[t]];
    runGrowth(map, 0);

    t.growth!.grass_patch = RESOURCE_VISIBLE_GROWTH - 2;
    clearTileDeltas();
    runGrowth(map, Math.ceil(GRASS_PER_PERCENT));
    expect(drainTileDeltas()).toBeNull();

    t.growth!.grass_patch = RESOURCE_VISIBLE_GROWTH - 0.5;
    clearTileDeltas();
    runGrowth(map, Math.ceil(GRASS_PER_PERCENT) * 2);
    expect(drainTileDeltas()).not.toBeNull();
  });

  it('treats a part-grown tile that was never harvested as a mature plant', () => {
    const untouched = tile({
      growthTurn: undefined,
      resources: { grass_patch: 4 },
      growth: { grass_patch: 72 }
    });
    rebuildGrowthQueue([[untouched]], 0);
    expect(untouched.growth!.grass_patch).toBe(100);
    expect(growthQueueSize()).toBe(0);
  });

  it('leaves a mature tile out of the queue entirely', () => {
    const grown = tile({ resources: { grass_patch: 4 }, growth: { grass_patch: 100 } });
    rebuildGrowthQueue([[grown]], 0);
    expect(growthQueueSize()).toBe(0);
    expect(tileIsGrowing(grown)).toBe(false);
  });
});

describe('growth stages', () => {
  it('reads three sizes off one table, with nothing drawn below the first', () => {
    expect(GROWTH_STAGES.map((s) => s.scale)).toEqual([0.5, 0.75, 1]);
    expect(growthStageIndex(RESOURCE_VISIBLE_GROWTH - 1)).toBe(-1);
    expect(growthScale(0)).toBe(0);
    expect(growthScale(35)).toBe(0.5);
    expect(growthScale(60)).toBe(0.75);
    expect(growthScale(80)).toBe(1);
    expect(growthScale(100)).toBe(1);
  });
});

describe('growth queue heap', () => {
  beforeEach(() => clearGrowthQueue());

  it('finds the earliest turn regardless of push order', () => {
    pushGrowth(90, 1, 1);
    pushGrowth(12, 2, 2);
    pushGrowth(44, 3, 3);
    expect(peekGrowthTurn()).toBe(12);
    expect(popGrowth()).toEqual({ turn: 12, x: 2, y: 2 });
    expect(peekGrowthTurn()).toBe(44);
  });

  it('keeps x and y the way round they were pushed', () => {
    const t = tile({ x: 3, y: 1, growth: { grass_patch: 10 } });
    enrolGrowth(t, 5);
    expect(popGrowth()).toEqual({ turn: 6, x: 3, y: 1 });
  });

  it('is empty once drained', () => {
    pushGrowth(1, 0, 0);
    popGrowth();
    expect(peekGrowthTurn()).toBe(Infinity);
    expect(popGrowth()).toBeUndefined();
  });

  it('rebuild scans every row, not just the first', () => {
    const far = tile({ x: 2, y: 3, resources: { grass_patch: 0 }, growth: { grass_patch: 40 } });
    const map = [
      [tile({ x: 0, y: 0 })],
      [tile({ x: 0, y: 1 })],
      [tile({ x: 0, y: 2 })],
      [tile({ x: 0, y: 3 }), tile({ x: 1, y: 3 }), far]
    ];
    rebuildGrowthQueue(map, 7);
    expect(growthQueueSize()).toBe(1);
    expect(popGrowth()).toEqual({ turn: 8, x: 2, y: 3 });
  });
});

describe('tile deltas', () => {
  beforeEach(() => clearTileDeltas());

  it('drains once: a second call returns null', () => {
    markTileDirty(0, 0, tile({}));
    expect(drainTileDeltas()).not.toBeNull();
    expect(drainTileDeltas()).toBeNull();
  });

  it('clearTileDeltas empties a non-empty queue', () => {
    markTileDirty(0, 0, tile({}));
    clearTileDeltas();
    expect(drainTileDeltas()).toBeNull();
  });
});
