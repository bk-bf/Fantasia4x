import { describe, it, expect } from 'vitest';
import { SeededRng } from '../core/rng';
import { TICKS_PER_SECOND } from '../core/time';
import { moodEffect } from '../core/moodEffects';
import type { WorldTile, WeatherType, WeatherState } from '../core/types';
import {
  TURNS_PER_DAY,
  DAYS_PER_SEASON,
  SEASONS,
  seasonForTurn,
  dayIndexForTurn,
  LUNAR_CYCLE_DAYS,
  MOON_PHASES,
  moonPhaseIndex,
  moonPhaseName,
  isFullMoon,
  celestialMoodEffect,
  isSunUp,
  sunPhaseName,
  recomputeWorldTemperature,
  biomeBaseTemp,
  seasonRegrowthMultiplier,
  diurnalTempDelta,
  advanceWeatherForDay,
  rederiveWeatherType,
  weatherFreezing,
  weatherEffects,
  getEnvironmentTint,
  tileTemperature,
  tileWetness,
  biomeBaseMoisture,
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
  weatherSightMul,
  weatherWindStrength,
  windDegreeWord,
  ambientWind,
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
    expect(winter[0][0].temperature!).toBeLessThan(summer[0][0].temperature!);
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

  it('strips impassable tiles and averages only walkable land', () => {
    const cliff = tile('mountain');
    cliff.walkable = false;
    cliff.temperature = 99; // a stale baked value that must be cleared
    const map = [[tile('plains'), cliff]];
    const mean = recomputeWorldTemperature(map, 'summer');
    // Walkable plains keeps a baked temp; the impassable cliff is stripped to undefined.
    expect(map[0][0].temperature).toBe(biomeBaseTemp('plains') + SEASONS.summer.tempOffset);
    expect(map[0][1].temperature).toBeUndefined();
    // The returned mean ignores the impassable tile entirely (no cold-cliff drag).
    expect(mean).toBe(biomeBaseTemp('plains') + SEASONS.summer.tempOffset);
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

  it('a fresh roll draws a duration in [50, 400] and a valid type', () => {
    const valid: WeatherType[] = [
      'clear',
      'spring_windy',
      'summer_windy',
      'autumn_windy',
      'winter_windy',
      'drizzle',
      'rain',
      'windy_rain',
      'heavy_rain',
      'storm',
      'snow',
      'blizzard',
      'heat_wave',
      'fog',
      'gale',
      'foggy_rain'
    ];
    const rng = new SeededRng(7);
    for (let i = 0; i < 200; i++) {
      const w = advanceWeatherForDay(
        { type: 'clear', intensity: 0, turnsRemaining: 0, wind: 0.5 },
        'winter',
        rng
      );
      expect(valid).toContain(w.type);
      expect(w.turnsRemaining).toBeGreaterThanOrEqual(50);
      expect(w.turnsRemaining).toBeLessThanOrEqual(400);
    }
  });

  it('ambient wind random-walks but stays within [0, 1]', () => {
    const rng = new SeededRng(3);
    let w: WeatherState = { type: 'clear', intensity: 0, turnsRemaining: 0, wind: 0.5 };
    for (let i = 0; i < 400; i++) {
      w = advanceWeatherForDay(w, 'autumn', rng);
      expect(w.wind ?? 0).toBeGreaterThanOrEqual(0);
      expect(w.wind ?? 0).toBeLessThanOrEqual(1);
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

  it('precip phase is TEMPERATURE-driven: freezing→snow, warm→drizzle (over many rolls)', () => {
    const rng = new SeededRng(99);
    const frozenTypes = new Set<WeatherType>();
    const warmTypes = new Set<WeatherType>();
    for (let i = 0; i < 500; i++) {
      // freezing=true → the wet branch falls as snow; freezing=false → as drizzle. Independent of season.
      frozenTypes.add(
        advanceWeatherForDay({ type: 'clear', intensity: 0, turnsRemaining: 0 }, 'winter', rng, true)
          .type
      );
      warmTypes.add(
        advanceWeatherForDay({ type: 'clear', intensity: 0, turnsRemaining: 0 }, 'spring', rng, false)
          .type
      );
    }
    expect(frozenTypes.has('snow')).toBe(true);
    expect(frozenTypes.has('drizzle')).toBe(false);
    expect(warmTypes.has('drizzle')).toBe(true);
    expect(warmTypes.has('snow')).toBe(false);
  });

  it('rederiveWeatherType flips a rain spell to snow when freezing, and back', () => {
    const rain: WeatherState = {
      type: 'rain',
      intensity: 0.5,
      turnsRemaining: 0,
      precip: 'rain',
      windLevel: 'calm'
    };
    expect(rederiveWeatherType(rain, 'spring', false)).toBe('rain');
    expect(rederiveWeatherType(rain, 'spring', true)).toBe('snow');
  });

  it('weatherFreezing has hysteresis: snow ≤ −1°C, rain ≥ +1°C, prior phase holds between', () => {
    expect(weatherFreezing(-3, false)).toBe(true); // cold → snow
    expect(weatherFreezing(5, true)).toBe(false); // warm → rain
    expect(weatherFreezing(0, true)).toBe(true); // dead zone holds prior (was frozen)
    expect(weatherFreezing(0, false)).toBe(false); // dead zone holds prior (was thawed)
  });

  it('tileWetness reads down as ice covers the tile (frozen ≠ wet)', () => {
    const open = tileWetness(80, undefined, undefined, 0);
    const half = tileWetness(80, undefined, undefined, 50);
    const frozen = tileWetness(80, undefined, undefined, 100);
    expect(open).toBe(80);
    expect(half).toBeCloseTo(40);
    expect(frozen).toBe(0);
  });

  it('the wind readout never contradicts the derived type ("rain · extremely windy" is impossible)', () => {
    // The whole point of the orthogonal model: a calm-axis precip type (clear/rain/heavy_rain/snow) has
    // a windy/gale cell that routes to windy_rain/storm/winter_windy/blizzard/gale, so it can only ever
    // co-occur with calm or breezy wind. Its readout must therefore never reach "very"/"extremely".
    const calmAxis = new Set(['clear', 'rain', 'heavy_rain', 'snow']);
    const rng = new SeededRng(42);
    let w: WeatherState = { type: 'clear', intensity: 0, turnsRemaining: 0 };
    for (let i = 0; i < 3000; i++) {
      w = advanceWeatherForDay(w, i % 2 ? 'autumn' : 'spring', rng);
      if (calmAxis.has(w.type)) {
        expect(['', 'slightly', 'somewhat', 'fairly']).toContain(windDegreeWord(ambientWind(w)));
      }
    }
  });

  it('wind is independent of precip: dry windy days AND calm showers both occur', () => {
    // Orthogonality: over a long evolution we should see pure-wind dry types (a *_windy / gale with no
    // rain) AND pure-wet types at calm wind (rain / drizzle) — a windy day never depends on it raining.
    const rng = new SeededRng(8);
    let w: WeatherState = { type: 'clear', intensity: 0, turnsRemaining: 0 };
    const seen = new Set<WeatherType>();
    for (let i = 0; i < 4000; i++) {
      w = advanceWeatherForDay(w, 'autumn', rng);
      seen.add(w.type);
    }
    const dryWind = seen.has('autumn_windy') || seen.has('gale');
    const calmWet = seen.has('rain') || seen.has('drizzle');
    expect(dryWind).toBe(true);
    expect(calmWet).toBe(true);
  });

  it('a storm breaks: reaching the storm corner steps BOTH axes toward calm', () => {
    // storm = heavy_rain (precip peak) × gale (wind peak). On the next re-roll the front passes and both
    // chains step one rung down — heavy_rain→rain, gale→windy — so (rain, windy) derives windy_rain.
    const w = advanceWeatherForDay(
      {
        type: 'storm',
        intensity: 1,
        precip: 'heavy_rain',
        windLevel: 'gale',
        turnsRemaining: 0,
        windTurns: 0
      },
      'autumn',
      new SeededRng(5)
    );
    expect(w.type).toBe('windy_rain');
    expect(w.precip).toBe('rain');
    expect(w.windLevel).toBe('windy');
  });

  it('weatherSightMul shortens sight in fog/storm and is 1 in clear', () => {
    expect(weatherSightMul('clear')).toBe(1);
    expect(weatherSightMul('fog')).toBeLessThan(0.6);
    expect(weatherSightMul('storm')).toBeLessThan(1);
    expect(weatherSightMul('fog')).toBeLessThan(weatherSightMul('rain'));
  });

  it('weatherWindStrength is far higher for a storm than for clear', () => {
    expect(weatherWindStrength('storm')).toBeGreaterThan(weatherWindStrength('clear'));
    expect(weatherWindStrength('storm')).toBeGreaterThan(0.8);
  });
});

describe('EnvironmentService — per-tile display fields (HUD)', () => {
  it('tileTemperature = biome base + season offset + weather delta', () => {
    // Same turn for both calls so the diurnal swing is identical and the weather delta is isolated.
    const base = tileTemperature('plains', 'spring', 0, {
      type: 'clear',
      intensity: 0,
      turnsRemaining: 0
    });
    const cold = tileTemperature('plains', 'spring', 0, {
      type: 'snow',
      intensity: 0.5,
      turnsRemaining: 0
    });
    expect(cold).toBeLessThan(base);
    // winter is colder than summer for the same tile.
    expect(tileTemperature('plains', 'winter', 0, undefined)).toBeLessThan(
      tileTemperature('plains', 'summer', 0, undefined)
    );
  });

  it('diurnal swing: pre-dawn is colder than mid-afternoon, and is flat at season=undefined×0 reference', () => {
    const ticksPerDay = TURNS_PER_DAY * TICKS_PER_SECOND;
    const preDawn = Math.round(0.21 * ticksPerDay); // ~05:00, the curve trough
    const afternoon = Math.round(0.625 * ticksPerDay); // ~15:00, the curve crest
    // The diurnal delta itself dips below 0 pre-dawn and rises above 0 mid-afternoon.
    expect(diurnalTempDelta(preDawn, 'summer')).toBeLessThan(0);
    expect(diurnalTempDelta(afternoon, 'summer')).toBeGreaterThan(0);
    expect(diurnalTempDelta(afternoon, 'summer')).toBeGreaterThan(
      diurnalTempDelta(preDawn, 'summer')
    );
    // Summer swings harder than winter (clear/dry vs. cloud-blanketed) for the same time of day.
    expect(diurnalTempDelta(afternoon, 'summer')).toBeGreaterThan(
      diurnalTempDelta(afternoon, 'winter')
    );
    // It flows through into the tile's effective temperature: afternoon plains are warmer than pre-dawn.
    expect(tileTemperature('plains', 'summer', afternoon, undefined)).toBeGreaterThan(
      tileTemperature('plains', 'summer', preDawn, undefined)
    );
  });

  it('tileWetness is 0–100 and rises with rain', () => {
    const plains = biomeBaseMoisture('plains');
    const dry = tileWetness(plains, { type: 'clear', intensity: 0, turnsRemaining: 0 });
    const wet = tileWetness(plains, { type: 'heavy_rain', intensity: 0.75, turnsRemaining: 0 });
    expect(wet).toBeGreaterThan(dry);
    expect(
      tileWetness(biomeBaseMoisture('river'), {
        type: 'heavy_rain',
        intensity: 1,
        turnsRemaining: 0
      })
    ).toBeLessThanOrEqual(100);
    expect(
      tileWetness(biomeBaseMoisture('mountain'), {
        type: 'heat_wave',
        intensity: 1,
        turnsRemaining: 0
      })
    ).toBeGreaterThanOrEqual(0);
  });

  it('wetter biomes read wetter than drier ones', () => {
    expect(tileWetness(biomeBaseMoisture('river'), undefined)).toBeGreaterThan(
      tileWetness(biomeBaseMoisture('mountain'), undefined)
    );
  });
});

describe('EnvironmentService — weather mood', () => {
  it('clear skies lift mood, storms depress it', () => {
    // MOOD-REWORK: weather `mood` is now an effect id (mood.jsonc); resolve to its value.
    const val = (type: string) =>
      moodEffect(weatherEffects({ type, intensity: 0, turnsRemaining: 0 }).mood)?.value ?? 0;
    expect(val('clear')).toBeGreaterThan(0);
    expect(val('blizzard')).toBeLessThan(0);
    expect(val('blizzard')).toBeLessThan(val('rain'));
  });

  it('celestialMoodEffect fires the sky windows (dawn / dusk / full moon), else null', () => {
    const D = TURNS_PER_DAY * TICKS_PER_SECOND; // ticks in a day
    expect(celestialMoodEffect(Math.round(0.28 * D))).toBe('celestial_dawn'); // rising sun
    expect(celestialMoodEffect(Math.round(0.86 * D))).toBe('celestial_dusk'); // setting sun
    expect(celestialMoodEffect(Math.round(0.5 * D))).toBeNull(); // midday
    // deep night on a full-moon day (15) → the moon; new-moon day (0) → nothing.
    expect(isFullMoon(15)).toBe(true);
    expect(celestialMoodEffect(15 * D + Math.round(0.95 * D))).toBe('celestial_full_moon');
    expect(celestialMoodEffect(Math.round(0.95 * D))).toBeNull();
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

  it('a half-full exposure meter never onsets the condition — it needs a FULL (100) meter', () => {
    // The meter exists for a reason: cold/heat at 50% must NOT apply the condition (onset = 100).
    const cold: EntityCondition[] = [];
    for (let i = 0; i < 5000; i++) driveTemperatureConditions(cold, 50, 0);
    expect(cold.find((c) => c.id === 'hypothermia')).toBeUndefined();

    const heat: EntityCondition[] = [];
    for (let i = 0; i < 5000; i++) driveTemperatureConditions(heat, 0, 99);
    expect(heat.find((c) => c.id === 'heat_stroke')).toBeUndefined();
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
    expect(tileTemperature('plains', 'winter', 0, rain, roof)).toBeGreaterThan(
      tileTemperature('plains', 'winter', 0, rain, NO_THERMAL)
    );
    // …and drier (rain kept out).
    expect(tileWetness(biomeBaseMoisture('plains'), rain, roof)).toBeLessThan(
      tileWetness(biomeBaseMoisture('plains'), rain, NO_THERMAL)
    );
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
    expect(weatherPanelSaturation('fog')).toBe(0.68);
    expect(weatherPanelSaturation('fog')).toBeLessThan(weatherPanelSaturation('rain'));
    expect(weatherPanelSaturation(undefined)).toBe(1);
  });

  it('overlay fall speed + density are data-driven (with kind defaults)', () => {
    expect(weatherFallSpeed('rain')).toBe(680);
    expect(weatherFallSpeed('heavy_rain')).toBe(950);
    expect(weatherFallSpeed('snow')).toBe(80);
    expect(weatherDensity('rain')).toBe(160);
    expect(weatherDensity('heavy_rain')).toBe(240); // heavier rain = more drops
    // Unknown type → falls back to clear's def; clear's overlay is 'none' → no particles (0/0).
    expect(weatherFallSpeed('not_a_weather')).toBe(0);
    expect(weatherDensity('not_a_weather')).toBe(0);
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
    expect(t[0]).toBeCloseTo(SEASONS.winter.tint[0] * 0.88);
  });

  it('clear weather + no season is neutral white', () => {
    expect(getEnvironmentTint(undefined, undefined)).toEqual([1, 1, 1]);
  });
});

// ── Lunar counter (LINEAGES-II §1) — the moon is a pure function of the absolute day ──
describe('lunar cycle', () => {
  it('cycles through all 8 phases over one 30-day month, starting at New Moon', () => {
    expect(moonPhaseName(0)).toBe('New Moon');
    const seen = new Set<string>();
    for (let d = 0; d < LUNAR_CYCLE_DAYS; d++) seen.add(moonPhaseName(d));
    expect(seen.size).toBe(MOON_PHASES.length);
    // Deterministic wrap: day N and day N+cycle agree (save/load-safe, no drifting counter).
    expect(moonPhaseIndex(7)).toBe(moonPhaseIndex(7 + LUNAR_CYCLE_DAYS * 3));
  });

  it('the full moon is a 3-night window mid-cycle (days 14–16), dark before and after', () => {
    expect(isFullMoon(13)).toBe(false);
    expect(isFullMoon(14)).toBe(true);
    expect(isFullMoon(15)).toBe(true);
    expect(isFullMoon(16)).toBe(true);
    expect(isFullMoon(17)).toBe(false);
    // Exactly 3 full-moon days per cycle.
    let full = 0;
    for (let d = 0; d < LUNAR_CYCLE_DAYS; d++) if (isFullMoon(d)) full++;
    expect(full).toBe(3);
  });

  it('the sun tracks the HUD hours: up 06:00–18:59, down at night', () => {
    expect(isSunUp(5)).toBe(false);
    expect(isSunUp(6)).toBe(true);
    expect(isSunUp(12)).toBe(true);
    expect(isSunUp(18)).toBe(true);
    expect(isSunUp(19)).toBe(false);
    expect(isSunUp(23)).toBe(false);
  });

  it('the sun has an arc — sunrise → rising → high → sinking → sunset, nothing at night', () => {
    expect(sunPhaseName(6)).toBe('Sunrise');
    expect(sunPhaseName(8)).toBe('Rising Sun');
    expect(sunPhaseName(12)).toBe('High Sun');
    expect(sunPhaseName(15)).toBe('Sinking Sun');
    expect(sunPhaseName(18)).toBe('Sunset');
    expect(sunPhaseName(22)).toBeUndefined(); // the moon holds the slot at night
  });
});
