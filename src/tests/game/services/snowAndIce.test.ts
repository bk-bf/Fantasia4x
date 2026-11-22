import { describe, it, expect } from 'vitest';
import {
  accumulateSnow,
  weatherEffects,
  diurnalTempDelta,
  makeWeather,
  ICE_WALKABLE
} from '$lib/game/services/EnvironmentService';
import type { WorldTile, Season } from '$lib/game/core/types';

const TURN = 1234;
const SEASON: Season = 'winter';

function tileAt(temp: number, over: Partial<WorldTile>, weather = makeWeather('clear')): WorldTile {
  const wDelta = weatherEffects(weather).tempDelta + diurnalTempDelta(TURN, SEASON);
  return {
    x: 0,
    y: 0,
    terrainType: 'plains',
    subType: 'grass',
    type: 'grass',
    walkable: true,
    movementCost: 1,
    moisture: 100,
    resources: {},
    temperature: temp - wDelta,
    ...over
  } as unknown as WorldTile;
}

describe('accumulateSnow: the freeze and thaw rules', () => {
  it('snow starts melting as soon as the air is at or above 0°C', () => {
    const t = tileAt(2, { snow: 20 });
    accumulateSnow([[t]], makeWeather('clear'), SEASON, TURN, 1);
    expect(t.snow).toBeLessThan(20);
  });

  it('open water freezes, and thick enough ice becomes walkable and is patched into the path grid', () => {
    const t = tileAt(-10, { type: 'water', subType: 'water', walkable: false, movementCost: 0 });
    const patched: Array<[number, number, boolean]> = [];
    accumulateSnow([[t]], makeWeather('clear'), SEASON, TURN, 100, (x, y, w) =>
      patched.push([x, y, w])
    );
    expect(t.ice ?? 0).toBeGreaterThanOrEqual(ICE_WALKABLE);
    expect(t.walkable).toBe(true);
    expect(patched).toEqual([[0, 0, true]]);
  });

  it('a thaw puts frozen water back out of reach', () => {
    const t = tileAt(10, {
      type: 'water',
      subType: 'water',
      walkable: true,
      movementCost: 2,
      ice: 80
    });
    const patched: Array<[number, number, boolean]> = [];
    accumulateSnow([[t]], makeWeather('clear'), SEASON, TURN, 100, (x, y, w) =>
      patched.push([x, y, w])
    );
    expect(t.ice).toBe(0);
    expect(t.walkable).toBe(false);
    expect(patched).toEqual([[0, 0, false]]);
  });

  it('melt scales with the hours a sweep stands for', () => {
    const a = tileAt(5, { snow: 40 });
    const b = tileAt(5, { snow: 40 });
    accumulateSnow([[a]], makeWeather('clear'), SEASON, TURN, 1);
    accumulateSnow([[b]], makeWeather('clear'), SEASON, TURN, 3);
    expect(40 - b.snow!).toBeCloseTo(3 * (40 - a.snow!), 9);
  });
});
