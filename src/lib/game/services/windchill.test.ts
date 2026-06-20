import { describe, it, expect } from 'vitest';
import { SeededRng } from '../core/rng';
import type { WorldTile, WeatherState, EntityCondition } from '../core/types';
import {
  ambientWind,
  windVector,
  windDirLabel,
  windShelterAt,
  effectiveWindAt,
  makeWeather,
  advanceWeatherForDay,
  type ThermalSample
} from './EnvironmentService';
import { driveWindchill, getConditionCurrentStage } from '../core/needs';

// Graded wind: five degrees (slightly→extremely windy) drive the staged `windchilled` condition;
// roofs and the lee of impassable tiles (walls/mountains) shelter a tile from the wind.

const NO_THERMAL: ThermalSample = { warmth: 0, insulation: 0, weatherProtection: 0, roofed: false };

/** N×N walkable grid; `blocked` tiles (["y,x"]) are impassable (walls/mountains). */
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
    expect(ambientWind(gale())).toBeCloseTo(0.9); // wind 0.9 > clear windStrength
    expect(ambientWind(undefined)).toBeGreaterThanOrEqual(0); // no weather → calm-ish default
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
    expect(windDirLabel(8)).toBe('N'); // wraps
    expect(windDirLabel(-1)).toBe('NW');
  });
});

describe('windShelterAt — downwind shadow of an impassable tile', () => {
  // Wind blows toward N (dir 0); upwind is south (+y). A wall SOUTH of a tile shelters it.
  it('is full directly leeward of a wall and falls off with distance', () => {
    const map = grid(8, ['5,3']); // wall at (x=3, y=5)
    const close = windShelterAt(3, 4, 0, map); // one tile downwind (north) of the wall
    const far = windShelterAt(3, 2, 0, map); // three tiles downwind
    expect(close).toBeCloseTo(1); // tucked right behind it → full shelter
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(close); // fades with distance
  });

  it('gives no shelter in the open or on the upwind side of the wall', () => {
    const map = grid(8, ['5,3']);
    expect(windShelterAt(0, 0, 0, map)).toBe(0); // nowhere near the wall
    expect(windShelterAt(3, 6, 0, map)).toBe(0); // SOUTH of the wall = upwind, exposed
  });

  it('moves the sheltered side when the wind direction changes', () => {
    const map = grid(8, ['4,4']);
    // Wind toward N (0): south neighbour sheltered, north neighbour not.
    expect(windShelterAt(4, 3, 0, map)).toBeCloseTo(1);
    expect(windShelterAt(4, 5, 0, map)).toBe(0);
    // Wind toward S (4): the lee flips to the north neighbour.
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
    expect(roofed).toBe(0); // fully roofed → no wind
  });

  it('the lee of a wall reduces felt wind below the open field', () => {
    const map = grid(8, ['5,3']);
    const open = effectiveWindAt(0, 0, gale(), NO_THERMAL, map);
    const lee = effectiveWindAt(3, 4, gale(), NO_THERMAL, map); // directly behind the wall
    expect(lee).toBeLessThan(open);
    expect(lee).toBeCloseTo(0); // full shelter directly leeward
  });
});

describe('driveWindchill — effective wind → staged condition (direct, not accrued)', () => {
  it('adds nothing below onset, onsets past ~0.2, clears when calm again', () => {
    const c: EntityCondition[] = [];
    driveWindchill(c, 0.1);
    expect(c.find((x) => x.id === 'windchilled')).toBeUndefined();

    driveWindchill(c, 0.7);
    const w = c.find((x) => x.id === 'windchilled');
    expect(w).toBeDefined();
    expect(w!.severity).toBeGreaterThan(0);

    driveWindchill(c, 0.05); // sheltered → calm
    expect(c.find((x) => x.id === 'windchilled')).toBeUndefined();
  });

  it('graduates slightly → extremely windy as the wind rises', () => {
    const slight: EntityCondition[] = [];
    const extreme: EntityCondition[] = [];
    driveWindchill(slight, 0.25);
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

  it('is a nuisance only — no life-threatening stage, never touches STR/CON', () => {
    const c: EntityCondition[] = [];
    driveWindchill(c, 1.0);
    const stage = getConditionCurrentStage(c.find((x) => x.id === 'windchilled')!);
    expect(stage!.lifeThreatening).toBeFalsy();
    expect(stage!.modifiers.strength).toBeUndefined();
    expect(stage!.modifiers.constitution).toBeUndefined();
    expect(stage!.modifiers.dexterity).toBeLessThan(1); // buffeted: aim/balance
    expect(stage!.modifiers.moveSpeed).toBeLessThan(1); // walking into the wind
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
