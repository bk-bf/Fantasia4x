import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeTileLightLevel,
  getAmbientLight,
  rebuildThermalField,
  thermalAt
} from '$lib/game/services/EnvironmentService';
import { complete as completeHarvest } from '$lib/game/services/jobs/harvest';
import { COMMANDS } from '$lib/game/sim/commands';
import { clearTileDeltas, markTileDirty } from '$lib/game/core/state/tileDeltas';
import { clearGrowthQueue } from '$lib/game/core/rules/world/growthQueue';
import type { DesignationType, GameState, Job, WorldTile } from '$lib/game/core/types';

const N = 20;

function makeMap(): WorldTile[][] {
  const map: WorldTile[][] = [];
  for (let y = 0; y < N; y++) {
    const row: WorldTile[] = [];
    for (let x = 0; x < N; x++)
      row.push({
        x,
        y,
        walkable: true,
        terrainType: 'plains',
        subType: 'grass',
        resources: {}
      } as unknown as WorldTile);
    map.push(row);
  }
  return map;
}

function stateOf(map: WorldTile[][], designations: Record<string, DesignationType> = {}) {
  return {
    turn: 500,
    season: 'summer',
    worldMap: map,
    pawns: [],
    buildings: [],
    designations,
    droppedItems: []
  } as unknown as GameState;
}

function harvestAt(map: WorldTile[][], x: number, y: number, id: string, d: DesignationType) {
  const job = {
    id: 'h',
    type: 'harvest',
    targetX: x,
    targetY: y,
    resourceId: id,
    workRequired: 6,
    workDone: 6,
    claimedBy: null
  } as Job;
  return completeHarvest(job, stateOf(map, { [`${x},${y}`]: d }));
}

function darkestTurn(): number {
  let best = 0;
  for (let t = 0; t < 18000; t += 50) if (getAmbientLight(t) < getAmbientLight(best)) best = t;
  return best;
}

const night = darkestTurn();
const ambient = () => Math.max(0.1, getAmbientLight(night));
const light = (map: WorldTile[][], x: number, y: number) =>
  computeTileLightLevel(night, [], x, y, map);

describe('light and warmth from tile resources follow the tile as the sim changes it', () => {
  beforeEach(() => {
    clearTileDeltas();
    clearGrowthQueue();
  });

  it('a harvested glowcap stops lighting its tile', () => {
    const map = makeMap();
    map[10][10].resources = { glowcap: 3 };
    map[10][10].growth = { glowcap: 100 };
    expect(light(map, 10, 10)).toBeGreaterThan(ambient() + 0.1);

    harvestAt(map, 10, 10, 'glowcap', 'harvest');

    expect(map[10][10].resources.glowcap).toBe(0);
    expect(light(map, 10, 10)).toBeCloseTo(ambient(), 5);
  });

  it('a glowcap that regrows on its tile starts lighting it again', () => {
    const map = makeMap();
    map[5][5].resources = { glowcap: 0 };
    expect(light(map, 5, 5)).toBeCloseTo(ambient(), 5);

    map[5][5].resources.glowcap = 2;
    markTileDirty(5, 5, map[5][5]);

    expect(light(map, 5, 5)).toBeGreaterThan(ambient() + 0.1);
  });

  it('a resource spawned on a bare tile lights and warms around it', () => {
    const map = makeMap();
    expect(light(map, 7, 7)).toBeCloseTo(ambient(), 5);
    rebuildThermalField([], map);
    expect(thermalAt(8, 7).warmth).toBe(0);

    COMMANDS.devSpawnResourceAt(stateOf(map), { resourceId: 'emberwood_grove', x: 7, y: 7 });
    rebuildThermalField([], map);

    expect(light(map, 7, 7)).toBeGreaterThan(ambient() + 0.1);
    expect(thermalAt(8, 7).warmth).toBeGreaterThan(0);
  });

  it('a felled emberwood grove stops warming and lighting the tiles around it', () => {
    const map = makeMap();
    map[10][10].resources = { emberwood_grove: 3 };
    map[10][10].walkable = false;
    rebuildThermalField([], map);
    expect(thermalAt(11, 10).warmth).toBeGreaterThan(0);
    expect(light(map, 11, 10)).toBeGreaterThan(ambient() + 0.1);

    harvestAt(map, 10, 10, 'emberwood_grove', 'woodcut');
    rebuildThermalField([], map);

    expect(map[10][10].resources.emberwood_grove).toBe(0);
    expect(thermalAt(11, 10).warmth).toBe(0);
    expect(light(map, 11, 10)).toBeCloseTo(ambient(), 5);
  });

  it('a reloaded copy of a harvested map lights and warms exactly as the live map', () => {
    const map = makeMap();
    map[4][4].resources = { glowcap: 3 };
    map[4][4].growth = { glowcap: 100 };
    map[4][6].resources = { glowcap: 2 };
    map[12][12].resources = { emberwood_grove: 3 };
    map[13][12].resources = { emberwood_grove: 2 };
    rebuildThermalField([], map);
    light(map, 0, 0);

    harvestAt(map, 4, 4, 'glowcap', 'harvest');
    harvestAt(map, 12, 12, 'emberwood_grove', 'woodcut');
    map[15][3].resources = { glowcap: 2 };
    markTileDirty(15, 3, map[15][3]);

    const live: number[] = [];
    rebuildThermalField([], map);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) live.push(light(map, x, y), thermalAt(x, y).warmth);

    const loaded = structuredClone(map);
    const fresh: number[] = [];
    rebuildThermalField([], loaded);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) fresh.push(light(loaded, x, y), thermalAt(x, y).warmth);

    expect(live).toEqual(fresh);
  });
});
