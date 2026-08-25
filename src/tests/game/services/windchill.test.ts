import { describe, it, expect } from 'vitest';
import { SeededRng } from '$lib/game/core/util/rng';
import type { WorldTile, WeatherState, EntityCondition } from '$lib/game/core/types';
import {
  ambientWind,
  windVector,
  windDirLabel,
  windShelterAt,
  effectiveWindAt,
  makeWeather,
  advanceWeatherForDay,
  type ThermalSample
} from '$lib/game/services/EnvironmentService';
import { driveWindchill, getConditionCurrentStage } from '$lib/game/core/rules/body/conditions';

const NO_THERMAL: ThermalSample = { warmth: 0, insulation: 0, weatherProtection: 0, roofed: false };

function grid(n: number, blocked: string[] = []): WorldTile[][] {
  const set = new Set(blocked);
  const rows: WorldTile[][] = [];
  for (let y = 0; y < n; y++) {
    const row: WorldTile[] = [];
    for (let x = 0; x < n; x++) {
      row.push({
        x,
        y,
        type: 'land',
        discovered: true,
        ascii: '.',
        terrainType: 'grassland',
        subType: 'dirt',
        density: 0.4,
        moisture: 0,
        temperature: 0,
        movementCost: 1,
        walkable: !set.has(`${y},${x}`),
        resources: {},
        territoryOwner: ''
      } as WorldTile);
    }
    rows.push(row);
  }
  return rows;
}

const gale = (windDir = 0): WeatherState => ({
  type: 'clear',
  intensity: 1,
  turnsRemaining: 1e9,
  wind: 0.9,
  windDir
});

describe('ambientWind — open-field wind 0–1', () => {
  it('is the stronger of the type windStrength and the live wind scalar', () => {
    expect(ambientWind(gale())).toBeCloseTo(0.9);
    expect(ambientWind(undefined)).toBeGreaterThanOrEqual(0);
    expect(ambientWind({ type: 'clear', intensity: 0, turnsRemaining: 1, wind: 0 })).toBeLessThan(
      0.5
    );
  });
});

describe('windVector / windDirLabel — 8-way compass', () => {
  it('index 0 is N (blows toward −y), 2 is E, and wraps', () => {
    expect(windVector(0)).toEqual({ dx: 0, dy: -1 });
    expect(windVector(2)).toEqual({ dx: 1, dy: 0 });
    expect(windDirLabel(0)).toBe('N');
    expect(windDirLabel(8)).toBe('N');
    expect(windDirLabel(-1)).toBe('NW');
  });
});

describe('windShelterAt — downwind shadow of an impassable tile', () => {
  it('is full directly leeward of a wall and falls off with distance', () => {
    const map = grid(8, ['5,3']);
    const close = windShelterAt(3, 4, 0, map);
    const far = windShelterAt(3, 2, 0, map);
    expect(close).toBeCloseTo(1);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(close);
  });

  it('gives no shelter in the open or on the upwind side of the wall', () => {
    const map = grid(8, ['5,3']);
    expect(windShelterAt(0, 0, 0, map)).toBe(0);
    expect(windShelterAt(3, 6, 0, map)).toBe(0);
  });

  it('moves the sheltered side when the wind direction changes', () => {
    const map = grid(8, ['4,4']);
    expect(windShelterAt(4, 3, 0, map)).toBeCloseTo(1);
    expect(windShelterAt(4, 5, 0, map)).toBe(0);
    expect(windShelterAt(4, 5, 4, map)).toBeCloseTo(1);
    expect(windShelterAt(4, 3, 4, map)).toBe(0);
  });
});

describe('effectiveWindAt — ambient cut by roof + lee', () => {
  it('a roof blocks the wind via weatherProtection', () => {
    const map = grid(5);
    const open = effectiveWindAt(2, 2, gale(), NO_THERMAL, map);
    const roofed = effectiveWindAt(2, 2, gale(), { ...NO_THERMAL, weatherProtection: 1 }, map);
    expect(open).toBeCloseTo(0.9);
    expect(roofed).toBe(0);
  });

  it('the lee of a wall reduces felt wind below the open field', () => {
    const map = grid(8, ['5,3']);
    const open = effectiveWindAt(0, 0, gale(), NO_THERMAL, map);
    const lee = effectiveWindAt(3, 4, gale(), NO_THERMAL, map);
    expect(lee).toBeLessThan(open);
    expect(lee).toBeCloseTo(0);
  });
});

describe('driveWindchill — effective wind → staged condition (direct, not accrued)', () => {
  it('adds nothing below onset, onsets past ~0.36, clears when calm again', () => {
    const c: EntityCondition[] = [];
    driveWindchill(c, 0.1);
    expect(c.find((x) => x.id === 'windchilled')).toBeUndefined();

    driveWindchill(c, 0.3);
    expect(c.find((x) => x.id === 'windchilled')).toBeUndefined();

    driveWindchill(c, 0.7);
    const w = c.find((x) => x.id === 'windchilled');
    expect(w).toBeDefined();
    expect(w!.severity).toBeGreaterThan(0);

    driveWindchill(c, 0.05);
    expect(c.find((x) => x.id === 'windchilled')).toBeUndefined();
  });

  it('graduates slightly → extremely windy as the wind rises', () => {
    const slight: EntityCondition[] = [];
    const extreme: EntityCondition[] = [];
    driveWindchill(slight, 0.45);
    driveWindchill(extreme, 1.0);
    const sev = (c: EntityCondition[]) => c.find((x) => x.id === 'windchilled')!.severity;
    expect(sev(slight)).toBeLessThan(sev(extreme));
    expect(getConditionCurrentStage(slight.find((x) => x.id === 'windchilled')!)?.label).toBe(
      'slightly windy'
    );
    expect(getConditionCurrentStage(extreme.find((x) => x.id === 'windchilled')!)?.label).toBe(
      'extremely windy'
    );
  });

  it('is a nuisance only — no life-threatening stage, never touches STRENGTH/CONSTITUTION', () => {
    const c: EntityCondition[] = [];
    driveWindchill(c, 1.0);
    const stage = getConditionCurrentStage(c.find((x) => x.id === 'windchilled')!);
    expect(stage!.lifeThreatening).toBeFalsy();
    expect(stage!.modifiers.strength).toBeUndefined();
    expect(stage!.modifiers.constitution).toBeUndefined();
    expect(stage!.modifiers.dexterity).toBeLessThan(1);
    expect(stage!.modifiers.moveSpeed).toBeLessThan(1);
  });
});

describe('wind direction drifts day to day', () => {
  it('seeds a direction and keeps it in 0–7 across many days', () => {
    let wx = makeWeather('clear');
    expect(wx.windDir).toBe(0);
    const rng = new SeededRng(123);
    for (let d = 0; d < 200; d++) {
      wx = advanceWeatherForDay(wx, 'spring', rng);
      expect(wx.windDir).toBeGreaterThanOrEqual(0);
      expect(wx.windDir!).toBeLessThanOrEqual(7);
    }
  });
});
