import { describe, it, expect } from 'vitest';
import { SeededRng } from '../core/rng';
import { TICKS_PER_SECOND } from '../core/time';
import type { WorldTile, WeatherType } from '../core/types';
import {
  TURNS_PER_DAY,
  DAYS_PER_SEASON,
  SEASONS,
  seasonForTurn,
  dayIndexForTurn,
  recomputeWorldTemperature,
  biomeBaseTemp,
  seasonRegrowthMultiplier,
  advanceWeatherForDay,
  weatherEffects,
  getEnvironmentTint,
  tileTemperature,
  tileWetness,
  coldExposure,
  heatExposure,
  effectiveTemperature,
  computeThermalAt,
  rebuildThermalField,
  thermalAt,
  isRoofedTile,
  weatherLabel,
  weatherOverlayKind,
  weatherIsHeavy,
  weatherFallSpeed,
  weatherDensity,
  weatherPanelSaturation,
  weatherChronicleSeverity,
  SEASON_LABELS,
  type ThermalSample
} from './EnvironmentService';
import { comfortRange, driveTemperatureConditions } from '../core/needs';
import type { EntityCondition, PlacedBuilding } from '../core/types';

function bld(
  type: string,
  x: number,
  y: number,
  extra: Partial<PlacedBuilding> = {}
): PlacedBuilding {
  return { id: `${type}-${x}-${y}`, type, x, y, status: 'complete', progress: 1, ...extra };
}
const NO_THERMAL: ThermalSample = {
  warmth: 0,
  insulation: 0,
  weatherProtection: 0,
  roofed: false
};

const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;
const TICKS_PER_SEASON = TICKS_PER_DAY * DAYS_PER_SEASON;

function tile(terrainType: string): WorldTile {
  return {
    x: 0,
    y: 0,
    type: 'land',
    discovered: true,
    ascii: '.',
    terrainType,
    subType: 'dirt',
    density: 0.4,
    moisture: 0,
    temperature: 0,
    movementCost: 1,
    walkable: true,
    resources: {},
    territoryOwner: ''
  };
}

describe('EnvironmentService — seasons (Phase B)', () => {
  it('maps turn 0 to spring day 0', () => {
    expect(seasonForTurn(0)).toEqual({ season: 'spring', seasonDay: 0 });
  });

  it('advances through the four seasons and wraps after a year', () => {
    expect(seasonForTurn(TICKS_PER_SEASON).season).toBe('summer');
    expect(seasonForTurn(2 * TICKS_PER_SEASON).season).toBe('autumn');
    expect(seasonForTurn(3 * TICKS_PER_SEASON).season).toBe('winter');
    // 4 seasons = one full year → back to spring.
    expect(seasonForTurn(4 * TICKS_PER_SEASON).season).toBe('spring');
  });

  it('tracks the 0-indexed day within a season', () => {
    expect(seasonForTurn(TICKS_PER_DAY * 5).seasonDay).toBe(5);
    expect(seasonForTurn(TICKS_PER_DAY * (DAYS_PER_SEASON - 1)).seasonDay).toBe(
      DAYS_PER_SEASON - 1
    );
    // day 30 rolls into the next season at day 0.
    expect(seasonForTurn(TICKS_PER_DAY * DAYS_PER_SEASON)).toEqual({
      season: 'summer',
      seasonDay: 0
    });
  });

  it('dayIndexForTurn counts whole in-game days', () => {
    expect(dayIndexForTurn(0)).toBe(0);
    expect(dayIndexForTurn(TICKS_PER_DAY - 1)).toBe(0);
    expect(dayIndexForTurn(TICKS_PER_DAY)).toBe(1);
  });
});

describe('EnvironmentService — temperature (Phase B, PERF-1)', () => {
  it('recomputes temperature = biome base + season offset', () => {
    const map = [[tile('plains'), tile('mountain')]];
    recomputeWorldTemperature(map, 'summer');
    expect(map[0][0].temperature).toBe(biomeBaseTemp('plains') + SEASONS.summer.tempOffset);
    expect(map[0][1].temperature).toBe(biomeBaseTemp('mountain') + SEASONS.summer.tempOffset);
  });

  it('winter is colder than summer for the same biome', () => {
    const summer = [[tile('plains')]];
    const winter = [[tile('plains')]];
    recomputeWorldTemperature(summer, 'summer');
    recomputeWorldTemperature(winter, 'winter');
    expect(winter[0][0].temperature).toBeLessThan(summer[0][0].temperature);
  });

  it('mutates IN PLACE — same array AND same tile refs (PERF-1: no worldMap.map / ref flip)', () => {
    const map = [[tile('plains')]];
    const rowRef = map[0];
    const tileRef = map[0][0];
    recomputeWorldTemperature(map, 'autumn');
    expect(map[0]).toBe(rowRef);
    expect(map[0][0]).toBe(tileRef);
  });

  it('biomeBaseTemp falls back for unknown biomes', () => {
    expect(biomeBaseTemp('not-a-biome')).toBeTypeOf('number');
  });
});

describe('EnvironmentService — seasonal regrowth (Subsystem 2)', () => {
  it('spring regrows faster than winter', () => {
    expect(seasonRegrowthMultiplier('spring')).toBeGreaterThan(seasonRegrowthMultiplier('winter'));
  });

  it('defaults to 1 when season is undefined', () => {
    expect(seasonRegrowthMultiplier(undefined)).toBe(1);
  });
});

describe('EnvironmentService — weather (Phase C)', () => {
  it('weatherEffects defaults to clear when undefined', () => {
    const fx = weatherEffects(undefined);
    expect(fx).toEqual(weatherEffects({ type: 'clear', intensity: 0, turnsRemaining: 0 }));
    expect(fx.fatigueMul).toBe(1);
  });

  it('harsher weather raises the fatigue multiplier and lowers temperature', () => {
    expect(
      weatherEffects({ type: 'blizzard', intensity: 1, turnsRemaining: 0 }).fatigueMul
    ).toBeGreaterThan(
      weatherEffects({ type: 'rain', intensity: 0.5, turnsRemaining: 0 }).fatigueMul
    );
    expect(
      weatherEffects({ type: 'blizzard', intensity: 1, turnsRemaining: 0 }).tempDelta
    ).toBeLessThan(0);
    expect(
      weatherEffects({ type: 'heat_wave', intensity: 0.75, turnsRemaining: 0 }).tempDelta
    ).toBeGreaterThan(0);
  });

  it('advanceWeatherForDay is deterministic for a given seed', () => {
    const a = advanceWeatherForDay(
      { type: 'clear', intensity: 0, turnsRemaining: 0 },
      'autumn',
      new SeededRng(42)
    );
    const b = advanceWeatherForDay(
      { type: 'clear', intensity: 0, turnsRemaining: 0 },
      'autumn',
      new SeededRng(42)
    );
    expect(a).toEqual(b);
  });

  it('a fresh roll draws a duration in [50, 600] and a valid type', () => {
    const valid: WeatherType[] = [
      'clear',
      'rain',
      'heavy_rain',
      'snow',
      'blizzard',
      'heat_wave',
      'fog'
    ];
    const rng = new SeededRng(7);
    for (let i = 0; i < 200; i++) {
      const w = advanceWeatherForDay(
        { type: 'clear', intensity: 0, turnsRemaining: 0 },
        'winter',
        rng
      );
      expect(valid).toContain(w.type);
      expect(w.turnsRemaining).toBeGreaterThanOrEqual(50);
      expect(w.turnsRemaining).toBeLessThanOrEqual(600);
    }
  });

  it('an unexpired spell runs down its timer without re-rolling the type', () => {
    const w = advanceWeatherForDay(
      { type: 'rain', intensity: 0.5, turnsRemaining: TICKS_PER_DAY * 3 },
      'spring',
      new SeededRng(1)
    );
    expect(w.type).toBe('rain');
    expect(w.turnsRemaining).toBe(TICKS_PER_DAY * 2);
  });

  it('winter precipitation is snow, warm seasons rain (over many rolls)', () => {
    const rng = new SeededRng(99);
    const winterTypes = new Set<WeatherType>();
    const springTypes = new Set<WeatherType>();
    for (let i = 0; i < 500; i++) {
      winterTypes.add(
        advanceWeatherForDay({ type: 'clear', intensity: 0, turnsRemaining: 0 }, 'winter', rng).type
      );
      springTypes.add(
        advanceWeatherForDay({ type: 'clear', intensity: 0, turnsRemaining: 0 }, 'spring', rng).type
      );
    }
    expect(winterTypes.has('snow')).toBe(true);
    expect(winterTypes.has('rain')).toBe(false);
    expect(springTypes.has('rain')).toBe(true);
    expect(springTypes.has('snow')).toBe(false);
  });
});

describe('EnvironmentService — per-tile display fields (HUD)', () => {
  it('tileTemperature = biome base + season offset + weather delta', () => {
    const base = tileTemperature('plains', 'spring', {
      type: 'clear',
      intensity: 0,
      turnsRemaining: 0
    });
    const cold = tileTemperature('plains', 'spring', {
      type: 'snow',
      intensity: 0.5,
      turnsRemaining: 0
    });
    expect(cold).toBeLessThan(base);
    // winter is colder than summer for the same tile.
    expect(tileTemperature('plains', 'winter', undefined)).toBeLessThan(
      tileTemperature('plains', 'summer', undefined)
    );
  });

  it('tileWetness is 0–100 and rises with rain', () => {
    const dry = tileWetness('plains', { type: 'clear', intensity: 0, turnsRemaining: 0 });
    const wet = tileWetness('plains', { type: 'heavy_rain', intensity: 0.75, turnsRemaining: 0 });
    expect(wet).toBeGreaterThan(dry);
    expect(
      tileWetness('river', { type: 'heavy_rain', intensity: 1, turnsRemaining: 0 })
    ).toBeLessThanOrEqual(100);
    expect(
      tileWetness('mountain', { type: 'heat_wave', intensity: 1, turnsRemaining: 0 })
    ).toBeGreaterThanOrEqual(0);
  });

  it('wetter biomes read wetter than drier ones', () => {
    expect(tileWetness('river', undefined)).toBeGreaterThan(tileWetness('mountain', undefined));
  });
});

describe('EnvironmentService — weather mood', () => {
  it('clear skies lift mood, storms depress it', () => {
    expect(weatherEffects({ type: 'clear', intensity: 0, turnsRemaining: 0 }).mood).toBeGreaterThan(
      0
    );
    expect(weatherEffects({ type: 'blizzard', intensity: 1, turnsRemaining: 0 }).mood).toBeLessThan(
      0
    );
    expect(weatherEffects({ type: 'blizzard', intensity: 1, turnsRemaining: 0 }).mood).toBeLessThan(
      weatherEffects({ type: 'rain', intensity: 0.5, turnsRemaining: 0 }).mood
    );
  });
});

describe('Temperature comfort + exposure (hypothermia / heat stroke)', () => {
  it('comfortRange shifts with traits', () => {
    expect(comfortRange(undefined)).toEqual({ min: 5, max: 30 });
    expect(comfortRange([{ name: 'Insulated' }])).toEqual({ min: -5, max: 25 });
    expect(comfortRange([{ name: 'Cold Blooded' }])).toEqual({ min: 15, max: 40 });
  });

  it('exposure is 0 inside the comfort band and grows outside it', () => {
    expect(coldExposure(20, 5)).toBe(0);
    expect(heatExposure(20, 30)).toBe(0);
    expect(coldExposure(-5, 5)).toBeGreaterThan(0); // 10°C below comfort
    expect(heatExposure(45, 30)).toBeGreaterThan(0); // 15°C above comfort
    expect(coldExposure(-100, 5)).toBe(100); // clamped
    expect(heatExposure(200, 30)).toBe(100); // clamped
  });

  it('driveTemperatureConditions onsets hypothermia under sustained cold and recovers in warmth', () => {
    const conditions: EntityCondition[] = [];
    // High cold exposure for many ticks → hypothermia appears and climbs.
    for (let i = 0; i < 500; i++) driveTemperatureConditions(conditions, 100, 0);
    const cold = conditions.find((c) => c.id === 'hypothermia');
    expect(cold).toBeDefined();
    expect(cold!.severity).toBeGreaterThan(0);
    // No exposure → it recovers back toward 0 and clears.
    for (let i = 0; i < 5000; i++) driveTemperatureConditions(conditions, 0, 0);
    expect(conditions.find((c) => c.id === 'hypothermia')).toBeUndefined();
  });

  it('heat exposure drives heat_stroke, not hypothermia', () => {
    const conditions: EntityCondition[] = [];
    for (let i = 0; i < 500; i++) driveTemperatureConditions(conditions, 0, 100);
    expect(conditions.find((c) => c.id === 'heat_stroke')).toBeDefined();
    expect(conditions.find((c) => c.id === 'hypothermia')).toBeUndefined();
  });
});

describe('Thermal model — fire warmth, roof shelter, effective temperature', () => {
  it('effectiveTemperature: roof weather protection blocks the weather swing', () => {
    expect(effectiveTemperature(10, -20, NO_THERMAL)).toBe(-10); // exposed: full delta
    expect(
      effectiveTemperature(10, -20, { ...NO_THERMAL, weatherProtection: 1, roofed: true })
    ).toBe(10); // fully protected: no delta
  });

  it('effectiveTemperature: insulation pulls the interior toward the neutral baseline', () => {
    // base 35°C, full insulation → neutral 15°C
    expect(effectiveTemperature(35, 0, { ...NO_THERMAL, insulation: 1, roofed: true })).toBe(15);
  });

  it('effectiveTemperature: fire warmth adds on top', () => {
    expect(effectiveTemperature(0, 0, { ...NO_THERMAL, warmth: 10 })).toBe(10);
  });

  it('computeThermalAt: a lit campfire radiates warmth that falls off and stops past its radius', () => {
    const fire = [bld('campfire', 5, 5, { lit: true })];
    expect(computeThermalAt(5, 5, fire).warmth).toBeGreaterThan(0);
    expect(computeThermalAt(6, 5, fire).warmth).toBeGreaterThan(0);
    // campfire lightRadius is 6 → a tile 7 away gets nothing.
    expect(computeThermalAt(5, 12, fire).warmth).toBe(0);
    // closer is warmer than farther.
    expect(computeThermalAt(5, 5, fire).warmth).toBeGreaterThan(
      computeThermalAt(8, 5, fire).warmth
    );
  });

  it('computeThermalAt: an UNLIT fuelled fire gives no warmth', () => {
    expect(computeThermalAt(5, 5, [bld('campfire', 5, 5, { lit: false })]).warmth).toBe(0);
  });

  it('computeThermalAt: a roof shelters its tile with insulation + weather protection', () => {
    const at = computeThermalAt(3, 3, [bld('thatch_roof', 3, 3)]);
    expect(at.roofed).toBe(true);
    expect(at.insulation).toBeGreaterThan(0);
    expect(at.weatherProtection).toBeGreaterThan(0);
    // a neighbouring tile is not roofed.
    expect(computeThermalAt(4, 3, [bld('thatch_roof', 3, 3)]).roofed).toBe(false);
  });

  it('rebuildThermalField + thermalAt + isRoofedTile mirror the on-demand compute', () => {
    rebuildThermalField([bld('thatch_roof', 1, 1), bld('campfire', 1, 1, { lit: true })]);
    expect(isRoofedTile(1, 1)).toBe(true);
    expect(isRoofedTile(9, 9)).toBe(false);
    expect(thermalAt(1, 1).roofed).toBe(true);
    expect(thermalAt(1, 1).warmth).toBeGreaterThan(0);
    rebuildThermalField([]); // reset shared singleton so later tests see a clean field
    expect(isRoofedTile(1, 1)).toBe(false);
  });

  it('tileTemperature/tileWetness factor a thermal sample (roof keeps a tile warmer + drier)', () => {
    const roof: ThermalSample = { warmth: 0, insulation: 0.5, weatherProtection: 1, roofed: true };
    const rain = { type: 'heavy_rain' as const, intensity: 0.75, turnsRemaining: 0 };
    // Under a roof during winter rain, the tile is warmer than fully exposed.
    expect(tileTemperature('plains', 'winter', rain, roof)).toBeGreaterThan(
      tileTemperature('plains', 'winter', rain, NO_THERMAL)
    );
    // …and drier (rain kept out).
    expect(tileWetness('plains', rain, roof)).toBeLessThan(tileWetness('plains', rain, NO_THERMAL));
  });
});

describe('EnvironmentService — data-driven weather/season metadata (jsonc)', () => {
  it('weather labels come from the data file', () => {
    expect(weatherLabel('rain')).toBe('Rain');
    expect(weatherLabel('heavy_rain')).toBe('Heavy rain');
    expect(weatherLabel(undefined)).toBe('Clear skies'); // falls back to default
    expect(weatherLabel('not_a_weather')).toBe('Clear skies'); // unknown → default
  });

  it('overlay kind + heavy flag are data-driven (drives the particle canvas)', () => {
    expect(weatherOverlayKind('rain')).toBe('rain');
    expect(weatherOverlayKind('heavy_rain')).toBe('rain');
    expect(weatherOverlayKind('snow')).toBe('snow');
    expect(weatherOverlayKind('blizzard')).toBe('snow');
    expect(weatherOverlayKind('fog')).toBe('fog');
    expect(weatherOverlayKind('clear')).toBe('none');
    expect(weatherOverlayKind('heat_wave')).toBe('none');
    expect(weatherIsHeavy('heavy_rain')).toBe(true);
    expect(weatherIsHeavy('blizzard')).toBe(true);
    expect(weatherIsHeavy('rain')).toBe(false);
  });

  it('panel saturation is data-driven — fog washes panels out the most', () => {
    expect(weatherPanelSaturation('clear')).toBe(1); // default, no field
    expect(weatherPanelSaturation('heat_wave')).toBe(1);
    expect(weatherPanelSaturation('fog')).toBe(0.45);
    expect(weatherPanelSaturation('fog')).toBeLessThan(weatherPanelSaturation('rain'));
    expect(weatherPanelSaturation(undefined)).toBe(1);
  });

  it('overlay fall speed + density are data-driven (with kind defaults)', () => {
    expect(weatherFallSpeed('rain')).toBe(680);
    expect(weatherFallSpeed('heavy_rain')).toBe(950);
    expect(weatherFallSpeed('snow')).toBe(80);
    expect(weatherDensity('rain')).toBe(160);
    expect(weatherDensity('heavy_rain')).toBe(240); // heavier rain = more drops
    // Unknown type → falls back to clear's def; clear has no fallSpeed/density → kind defaults.
    expect(weatherFallSpeed('not_a_weather')).toBe(680);
    expect(weatherDensity('not_a_weather')).toBe(160);
  });

  it('chronicle severity is data-driven', () => {
    expect(weatherChronicleSeverity('blizzard')).toBe('warning');
    expect(weatherChronicleSeverity('rain')).toBe('info');
  });

  it('season labels come from the data file', () => {
    expect(SEASON_LABELS.spring).toBe('Spring');
    expect(SEASON_LABELS.winter).toBe('Winter');
  });
});

describe('EnvironmentService — environment tint (Subsystem 2/5)', () => {
  it('multiplies season hue by weather hue', () => {
    const t = getEnvironmentTint('winter', { type: 'fog', intensity: 0.5, turnsRemaining: 0 });
    expect(t[0]).toBeCloseTo(SEASONS.winter.tint[0] * 0.85);
  });

  it('clear weather + no season is neutral white', () => {
    expect(getEnvironmentTint(undefined, undefined)).toEqual([1, 1, 1]);
  });
});
