// Day/night ambient light, seasons, temperature, and weather.
// Pure functions of turn (and the season/weather scalars in GameState).

import { TICKS_PER_SECOND } from '../core/time';
import { vlog } from '../core/logSink';
import { markTileDirty } from '../core/tileDeltas';
import { buildingLight } from './LightingService';
import { buildingService } from './BuildingService';
import { resourceObjectService } from './ResourceObjectService';
import { BIOMES, SUBTERRAINS, SUBTERRAIN_FALLBACK } from '../core/Terrains';
import seasonsData from '../database/seasons.jsonc';
import weatherData from '../database/weather.jsonc';
import type { SeededRng } from '../core/rng';
import type { Season, WeatherState, WeatherType, WorldTile, PlacedBuilding } from '../core/types';

// In-game seconds per day; `turn` counts ticks, so a day is TURNS_PER_DAY × TICKS_PER_SECOND ticks.
export const TURNS_PER_DAY = 300;
const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;

/** Ticks in one in-game hour — author/display condition durations in hours via these, not raw ticks. */
export const TICKS_PER_GAME_HOUR = TICKS_PER_DAY / 24;
export const ticksFromGameHours = (hours: number): number =>
  Math.round(hours * TICKS_PER_GAME_HOUR);
export const gameHoursFromTicks = (ticks: number): number => ticks / TICKS_PER_GAME_HOUR;

/** Fractional time-of-day in [0, 1): 0 = midnight, 0.25 = 06:00, 0.5 = noon. */
export function getTimeOfDay(turn: number): number {
  return (turn % TICKS_PER_DAY) / TICKS_PER_DAY;
}

/** Ambient brightness in [0.15, 1.0]. Midnight floors at 0.15 so glyphs stay readable;
 *  both the WebGL map and the HTML panels read this single value. */
export function getAmbientLight(turn: number): number {
  const { a, b, f } = resolveKeyframes(getTimeOfDay(turn));
  return lerp(a.light, b.light, f);
}

// Ambient keyframes — t = timeOfDay; first/last carry the same values so the day wraps.
interface AmbientKeyframe {
  t: number;
  /** Scalar brightness [0.15, 1.0] — drives WebGL u_ambient AND panel dimming. */
  light: number;
  /** NORMALISED colour (brightest channel ≈ 1.0) — hue only, never brightness. The shader
   *  multiplies it by `light`, so glyphs never fall below the 0.15 floor at night. */
  tint: [number, number, number];
}

const AMBIENT_KEYFRAMES: AmbientKeyframe[] = [
  //  t      clock  light  normalised tint (hue only)
  { t: 0.0, light: 0.15, tint: [0.72, 0.4, 1.0] }, // 00:00 midnight    — purple-blue
  { t: 0.21, light: 0.15, tint: [0.7, 0.42, 1.0] }, // 05:00 pre-dawn    — purple-blue
  { t: 0.26, light: 0.35, tint: [1.0, 0.6, 0.28] }, // 06:12 early dawn  — orange glow starts
  { t: 0.31, light: 0.82, tint: [1.0, 0.68, 0.32] }, // 07:26 PEAK dawn   — full orange at rising brightness
  { t: 0.37, light: 0.96, tint: [1.0, 0.9, 0.72] }, // 08:53 morning     — warm white, nearly full bright
  { t: 0.5, light: 1.0, tint: [1.0, 1.0, 1.0] }, // 12:00 noon        — neutral
  { t: 0.64, light: 1.0, tint: [1.0, 0.98, 0.88] }, // 15:22 afternoon   — barely warm, still full brightness
  { t: 0.72, light: 1.0, tint: [1.0, 0.8, 0.45] }, // 17:17 PEAK golden — full amber at FULL brightness
  { t: 0.78, light: 0.88, tint: [1.0, 0.6, 0.28] }, // 18:43 sunset      — deep orange as dim begins
  { t: 0.84, light: 0.52, tint: [1.0, 0.5, 0.32] }, // 20:10 dusk        — red-orange, noticeably darker
  { t: 0.9, light: 0.28, tint: [0.82, 0.45, 0.9] }, // 21:36 late dusk   — violet into night
  { t: 0.95, light: 0.18, tint: [0.74, 0.4, 1.0] }, // 22:48 night       — purple-blue
  { t: 1.0, light: 0.15, tint: [0.72, 0.4, 1.0] } // 24:00 midnight wrap
];

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

function lerpTint(
  a: [number, number, number],
  b: [number, number, number],
  f: number
): [number, number, number] {
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

function resolveKeyframes(t: number): { a: AmbientKeyframe; b: AmbientKeyframe; f: number } {
  for (let i = 0; i < AMBIENT_KEYFRAMES.length - 1; i++) {
    const a = AMBIENT_KEYFRAMES[i];
    const b = AMBIENT_KEYFRAMES[i + 1];
    if (t >= a.t && t <= b.t) {
      return { a, b, f: (t - a.t) / (b.t - a.t) };
    }
  }
  const last = AMBIENT_KEYFRAMES[AMBIENT_KEYFRAMES.length - 1];
  return { a: last, b: last, f: 0 };
}

/** Ambient RGB tint for the WebGL fragment shader, interpolated between keyframes. */
export function getAmbientTint(turn: number): [number, number, number] {
  const { a, b, f } = resolveKeyframes(getTimeOfDay(turn));
  return lerpTint(a.tint, b.tint, f);
}

// Per-channel RGB multiplier for HTML panels (applied via SVG feColorMatrix in +page.svelte).
// Brightness and hue are computed SEPARATELY: multiplying hue by `light` would crush the tint
// at night. Brightness floors at PANEL_BRIGHT_FLOOR; PANEL_SAT sets constant tint strength.
const PANEL_BRIGHT_FLOOR = 0.45;
const PANEL_SAT = 0.8;
export function getPanelTint(turn: number): [number, number, number] {
  const light = getAmbientLight(turn);
  const tint = getAmbientTint(turn);
  const bright = PANEL_BRIGHT_FLOOR + (1 - PANEL_BRIGHT_FLOOR) * light;
  // mix(1.0, c, PANEL_SAT) — pull each channel from white toward the tint hue.
  const mul = (c: number) => bright * (1 - PANEL_SAT + PANEL_SAT * c);
  return [mul(tint[0]), mul(tint[1]), mul(tint[2])];
}

export interface AmbientState {
  /** Scalar brightness for WebGL u_ambient. */
  light: number;
  /** Normalised RGB hue for WebGL u_ambient_tint. */
  tint: [number, number, number];
  /** Per-channel RGB multiplier for the panel feColorMatrix tint. */
  panelTint: [number, number, number];
}

/** Total light (ambient + point sources) at a tile centre — mirrors LightingService.sample()
 *  so UI numbers match what the player sees on the map. */
export function computeTileLightLevel(
  turn: number,
  buildings: { type: string; status: string; lit?: boolean; x: number; y: number }[],
  x: number,
  y: number
): number {
  const ambient = getAmbientLight(turn);
  let point = 0;
  for (const b of buildings) {
    const light = buildingLight(b);
    if (!light) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < light.radius) {
      const falloff = (1 - dist / light.radius) * (1 - dist / light.radius);
      point += light.intensity * falloff;
    }
  }
  return Math.max(0.1, ambient + point);
}

// ─────────────────────────────────────────────────────────────────────────────
// Seasons & temperature
// ─────────────────────────────────────────────────────────────────────────────

export interface SeasonDef {
  /** °C added to each tile's biome base temperature for the whole season. */
  tempOffset: number;
  /** Multiplier applied to resource regrowth cooldowns (×<1 = faster regrowth). */
  regrowthMultiplier: number;
  /** Per-day chance the sky turns to precipitation (rain in warm seasons, snow in winter). */
  precipitation: number;
  /** Normalised RGB hue multiplied into the ambient tint. */
  tint: [number, number, number];
}

// Data-driven from database/seasons.jsonc.
interface SeasonFileEntry extends SeasonDef {
  id: Season;
  label: string;
}
const SEASON_FILE = seasonsData as unknown as { daysPerSeason: number; seasons: SeasonFileEntry[] };

export const DAYS_PER_SEASON = SEASON_FILE.daysPerSeason;
const SEASON_ORDER: Season[] = SEASON_FILE.seasons.map((s) => s.id);
/** Year cycle order, exported for the debug menu / pickers. */
export const SEASON_IDS: Season[] = SEASON_ORDER;
export const SEASONS: Record<Season, SeasonDef> = Object.fromEntries(
  SEASON_FILE.seasons.map((s) => [s.id, s])
) as unknown as Record<Season, SeasonDef>;
/** Human-readable season names (Chronicle / HUD). */
export const SEASON_LABELS: Record<Season, string> = Object.fromEntries(
  SEASON_FILE.seasons.map((s) => [s.id, s.label])
) as unknown as Record<Season, string>;

/** Fallback biome temperature for tiles whose biome carries no `baseTemp` (≈ plains baseline). */
const DEFAULT_BIOME_TEMP = 10;

/** Whole in-game days elapsed since turn 0. */
export function dayIndexForTurn(turn: number): number {
  return Math.floor(turn / TICKS_PER_DAY);
}

/** Map an absolute turn (ticks) → the season + 0-indexed day within it. */
export function seasonForTurn(turn: number): { season: Season; seasonDay: number } {
  const day = dayIndexForTurn(turn);
  return {
    season: SEASON_ORDER[Math.floor(day / DAYS_PER_SEASON) % SEASON_ORDER.length],
    seasonDay: day % DAYS_PER_SEASON
  };
}

// ── Lunar cycle (LINEAGES-II §1) ─────────────────────────────────────────────
// A proper lunar counter, pure function of the absolute day (deterministic across save/load — no
// separate mutable state to drift). 30-day month ⇒ 3 moons a season, 12 a year; the FULL MOON is a
// 3-night window mid-cycle — the werewolf transform gate and the `moonlightHours` awakening deed both
// read it. Surfaced in the topbar next to the time of day (sun up/down + the moon's phase).
export const LUNAR_CYCLE_DAYS = 30;
/** The 8 phase names, in cycle order. Player-facing (topbar + tooltips). */
export const MOON_PHASES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent'
] as const;
/** Day-in-cycle boundaries for each phase (start day, inclusive). Full Moon spans days 14–16. */
const MOON_PHASE_STARTS = [0, 2, 7, 10, 14, 17, 22, 25];

/** The moon's phase for an absolute day index (0–7 into {@link MOON_PHASES}). */
export function moonPhaseIndex(dayIndex: number): number {
  const cycleDay = ((dayIndex % LUNAR_CYCLE_DAYS) + LUNAR_CYCLE_DAYS) % LUNAR_CYCLE_DAYS;
  for (let i = MOON_PHASE_STARTS.length - 1; i >= 0; i--)
    if (cycleDay >= MOON_PHASE_STARTS[i]) return i;
  return 0;
}
/** Player-facing phase name for an absolute day index. */
export function moonPhaseName(dayIndex: number): (typeof MOON_PHASES)[number] {
  return MOON_PHASES[moonPhaseIndex(dayIndex)];
}
/** True during the 3-day full-moon window — the werewolf gate. */
export function isFullMoon(dayIndex: number): boolean {
  return moonPhaseIndex(dayIndex) === 4;
}

// Sun state for the topbar (and anything hour-gated): tracks the ambient keyframes — dawn glow starts
// ~06:00, sunset dimming begins ~18:43 — rounded to whole HUD hours.
export const SUNRISE_HOUR = 6;
export const SUNSET_HOUR = 19;
/** Is the sun up at this in-game hour (0–23)? */
export function isSunUp(hour: number): boolean {
  return hour >= SUNRISE_HOUR && hour < SUNSET_HOUR;
}
/** The sun's arc across the sky, the daytime twin of the moon's phase (topbar celestial readout).
 *  Undefined while the sun is down (the moon takes the slot). */
export function sunPhaseName(hour: number): string | undefined {
  if (!isSunUp(hour)) return undefined;
  if (hour <= 7) return 'Sunrise'; // 06–07 — the dawn glow keyframes
  if (hour <= 10) return 'Rising Sun'; // 08–10
  if (hour <= 13) return 'High Sun'; // 11–13 — the zenith plateau
  if (hour <= 16) return 'Sinking Sun'; // 14–16
  return 'Sunset'; // 17–18 — dimming begins ~18:43
}

/** Seasonal regrowth-rate multiplier. Regrowth *cooldowns* are DIVIDED by this —
 *  higher rate ⇒ shorter cooldown ⇒ faster regrowth. */
export function seasonRegrowthMultiplier(season: Season | undefined): number {
  return season ? SEASONS[season].regrowthMultiplier : 1;
}

/** Biome baseline temperature (°C, conceptual) for a tile's terrainType. */
export function biomeBaseTemp(terrainType: string): number {
  return BIOMES[terrainType]?.baseTemp ?? DEFAULT_BIOME_TEMP;
}

/** Season-baked tile temperature = biome baseline + season offset. The single formula the bake writes
 *  into `tile.temperature`, and the test for whether a tile is already baked for the current season. */
export function seasonBakedTemp(terrainType: string, season: Season | undefined): number {
  return biomeBaseTemp(terrainType) + (season ? SEASONS[season].tempOffset : 0);
}

/**
 * Recompute every WALKABLE tile's temperature IN PLACE for the given season — never rebuild the
 * worldMap or flip its ref (perf). Impassable tiles are stripped (`temperature = undefined`).
 * Returns the mean over walkable land (the HUD topbar value).
 * Deliberately no `markTileDirty`: `temperature` is worker-only and never ships to the renderer.
 * The weather delta is added at read time, not baked, so weather changes never touch every tile.
 */
export function recomputeWorldTemperature(worldMap: WorldTile[][], season: Season): number {
  const offset = SEASONS[season].tempOffset;
  let walkSum = 0;
  let walkCount = 0;
  let staleBefore = 0; // walkable tiles with no cached temp BEFORE this bake (never baked / reloaded)
  let minAfter = Infinity;
  let maxAfter = -Infinity;
  for (const row of worldMap) {
    for (const tile of row) {
      if (!tile.walkable) {
        if (tile.temperature !== undefined) tile.temperature = undefined;
        continue;
      }
      if (tile.temperature === undefined) staleBefore++;
      const temp = seasonBakedTemp(tile.terrainType, season);
      tile.temperature = temp;
      walkSum += temp;
      walkCount++;
      if (temp < minAfter) minAfter = temp;
      if (temp > maxAfter) maxAfter = temp;
    }
  }
  // Non-zero staleBefore on a settled map means walkable tiles were un-baked between seasons (a bug).
  vlog(
    'system',
    0,
    () =>
      `TEMP-BAKE season=${season} offset=${offset} walkable=${walkCount} staleBefore=${staleBefore} ` +
      `after[min=${minAfter} max=${maxAfter}]`
  );
  return walkCount > 0 ? walkSum / walkCount : offset;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diurnal temperature swing (day/night)
// ─────────────────────────────────────────────────────────────────────────────
// A single global scalar of time-of-day, folded into the same delta slot as the weather term in
// `effectiveTemperature`/`tileTemperature` — free per pawn, never baked into the worldMap, and
// damped by roofs/insulation like weather, so shelter flattens the night chill automatically.

/** Peak °C the open-air temperature deviates from the season-baked mean (×season scale). */
const DIURNAL_AMPLITUDE = 7;
/** Per-season amplitude scaling — summers swing hard, winter's cloud blanket damps it. */
const DIURNAL_SEASON_SCALE: Record<Season, number> = {
  spring: 1.0,
  summer: 1.2,
  autumn: 1.0,
  winter: 0.6
};

/** Normalised diurnal curve (−1 coldest … +1 warmest), phase-lagged behind the light curve:
 *  trough pre-dawn, crest mid-afternoon. Wraps at t=0/1. */
const DIURNAL_KEYFRAMES: { t: number; v: number }[] = [
  { t: 0.0, v: -0.55 }, // 00:00 — still cooling through the night
  { t: 0.21, v: -1.0 }, // 05:00 — coldest, just before dawn
  { t: 0.33, v: -0.4 }, // 08:00 — morning warm-up
  { t: 0.5, v: 0.45 }, // 12:00 — noon (air still climbing toward the afternoon peak)
  { t: 0.625, v: 1.0 }, // 15:00 — warmest
  { t: 0.75, v: 0.5 }, // 18:00 — evening cool-down begins
  { t: 0.875, v: -0.1 }, // 21:00 — night chill setting in
  { t: 1.0, v: -0.55 } // 24:00 — wrap (matches 00:00)
];

function diurnalCurve(t: number): number {
  for (let i = 0; i < DIURNAL_KEYFRAMES.length - 1; i++) {
    const a = DIURNAL_KEYFRAMES[i];
    const b = DIURNAL_KEYFRAMES[i + 1];
    if (t >= a.t && t <= b.t) return lerp(a.v, b.v, (t - a.t) / (b.t - a.t));
  }
  return DIURNAL_KEYFRAMES[DIURNAL_KEYFRAMES.length - 1].v;
}

/** °C the open-air temperature deviates from the season-baked mean at this turn (diurnal cycle).
 *  Rides the weather-delta slot, so roofs + insulation flatten it. */
export function diurnalTempDelta(turn: number, season: Season | undefined): number {
  const scale = season ? DIURNAL_SEASON_SCALE[season] : 1;
  return diurnalCurve(getTimeOfDay(turn)) * DIURNAL_AMPLITUDE * scale;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weather
// ─────────────────────────────────────────────────────────────────────────────

export interface WeatherEffects {
  /** °C delta added to effective temperature while this weather is active. */
  tempDelta: number;
  /** Multiplier on the fatigue (rest) need rate. */
  fatigueMul: number;
  /** Multiplier on the hunger need rate. */
  hungerMul: number;
  /** Multiplier on movement cost (gameplay hook; not yet consumed by movement). */
  moveCostMul: number;
  /** Per-second mood drift while this weather holds (+ pleasant, − miserable). */
  mood: number;
}

/** The overlay animation the WeatherCanvas draws for a weather type. */
export type WeatherOverlayKind =
  | 'none'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'leaves'
  | 'dust'
  | 'snowdust'
  | 'foggy_rain';

// Data-driven from database/weather.jsonc: weather types plus two orthogonal Markov chains
// (`precip` × `wind`) whose product derives the active type via `grid`.
interface WeatherTransition {
  to: string;
  /** Fixed per-roll weight (a probability before normalisation; the leftover weight = "stays put"). */
  chance?: number;
  /** Use the current season's `precipitation` as the weight (dry → drizzle/snow). */
  seasonPrecip?: boolean;
  /** Gate this transition to specific seasons. */
  seasons?: Season[];
  /** Gate this branch to a single travel phase along the precip ladder (rising vs. falling). */
  phase?: 'rising' | 'falling';
}
interface WeatherDef extends WeatherEffects {
  id: string;
  label: string;
  /** The UI animation. Purely visual. */
  overlay: WeatherOverlayKind;
  heavy?: boolean;
  /** Overlay particle fall speed, px/sec (visual). Defaults by overlay kind. */
  fallSpeed?: number;
  /** Overlay particle count per megapixel of screen (visual), before intensity/zoom. Defaults by kind. */
  density?: number;
  /** Side-panel colour saturation while active (1 = normal, <1 = washed-out/bleak). Default 1. */
  panelSaturation?: number;
  /** Inherent windiness 0–1 — drives the visual overlay slant. Combined with ambient `wind` at runtime. */
  windStrength?: number;
  /** Environmental sight multiplier 0–1 (1 = clear; fog/storm shorten detection). Default 1. */
  sightMul?: number;
  /** Tint for `leaves`/`dust` overlay particles, 0–255 RGB. */
  particleColor?: [number, number, number];
  intensity: number;
  moistureBonus: number;
  tint: [number, number, number];
  severity: 'info' | 'warning';
}
/** One node of an evolution chain (precip or wind) with its weighted neighbours. */
interface ChainState {
  id: string;
  transitions: WeatherTransition[];
}
interface ChainDef {
  default: string;
  durationRange: [number, number];
  states: ChainState[];
  /** Wind chain only: the 0–1 ambient-wind band each level random-walks within. */
  bands?: Record<string, [number, number]>;
}
const WEATHER_FILE = weatherData as unknown as {
  default: string;
  types: WeatherDef[];
  precip: ChainDef;
  wind: ChainDef;
  ladders: { precip: string[]; wind: string[] };
  stormCorner: string[];
  grid: Record<string, Record<string, string>>;
};
const DEFAULT_WEATHER = WEATHER_FILE.default;
const WEATHER: Record<string, WeatherDef> = Object.fromEntries(
  WEATHER_FILE.types.map((t) => [t.id, t])
);

// ── The two evolution chains (precip × wind) + the derivation grid ──
const PRECIP_CHAIN = WEATHER_FILE.precip;
const WIND_CHAIN = WEATHER_FILE.wind;
const PRECIP_STATES: Record<string, ChainState> = Object.fromEntries(
  PRECIP_CHAIN.states.map((s) => [s.id, s])
);
const WIND_STATES: Record<string, ChainState> = Object.fromEntries(
  WIND_CHAIN.states.map((s) => [s.id, s])
);
const WIND_BANDS: Record<string, [number, number]> = WIND_CHAIN.bands ?? {};
const PRECIP_LADDER = WEATHER_FILE.ladders.precip;
const WIND_LADDER = WEATHER_FILE.ladders.wind;
const STORM_CORNER = new Set(WEATHER_FILE.stormCorner);
const WEATHER_GRID = WEATHER_FILE.grid;
const DEFAULT_PRECIP = PRECIP_CHAIN.default;
const DEFAULT_WIND_LEVEL = WIND_CHAIN.default;
const SEASON_WINDY_CELL = '$season_windy';

/** Reverse map: derived display id → the (precip, windLevel) cell that produces it — recovers the
 *  axes from a state that only carries `type`. Season-windy cells key on the literal `$season_windy`. */
const REVERSE_GRID: Record<string, { precip: string; windLevel: string }> = (() => {
  const out: Record<string, { precip: string; windLevel: string }> = {};
  for (const precip of Object.keys(WEATHER_GRID)) {
    for (const windLevel of Object.keys(WEATHER_GRID[precip])) {
      const cell = WEATHER_GRID[precip][windLevel];
      if (!(cell in out)) out[cell] = { precip, windLevel };
    }
  }
  return out;
})();

/** Wet precip families that FALL AS SNOW when the air is below freezing (temperature-driven phase). */
const WET_PRECIP = new Set(['drizzle', 'rain', 'heavy_rain']);

/** Displayed weather id for a (precip, wind) pair. When `freezing`, wet precip routes through the
 *  grid's `snow` row — the Markov chain tracks how MUCH moisture; air temp decides rain vs snow. */
function deriveWeatherType(
  precip: string,
  windLevel: string,
  season: Season,
  freezing = false
): WeatherType {
  const effPrecip = freezing && WET_PRECIP.has(precip) ? 'snow' : precip;
  const cell = WEATHER_GRID[effPrecip]?.[windLevel] ?? DEFAULT_WEATHER;
  return cell === SEASON_WINDY_CELL ? `${season}_windy` : cell;
}

/** Re-derive the DISPLAY type from the freezing flag without advancing the Markov chain — the live
 *  intraday rain⇄snow switch. The engine reassigns `weather.type` only when it actually changes. */
export function rederiveWeatherType(
  weather: WeatherState,
  season: Season,
  freezing: boolean
): string {
  const { precip, windLevel } = weather.precip
    ? { precip: weather.precip, windLevel: weather.windLevel ?? DEFAULT_WIND_LEVEL }
    : axesFromType(weather.type);
  return deriveWeatherType(precip, windLevel, season, freezing);
}

/** Hysteresis band for rain⇄snow: the prior phase HOLDS in the −1…+1°C dead zone so precipitation
 *  doesn't flicker type around freezing. */
const FREEZE_SNOW_BELOW = -1;
const FREEZE_RAIN_ABOVE = 1;
export function weatherFreezing(globalTemp: number, prevFreezing: boolean): boolean {
  if (globalTemp <= FREEZE_SNOW_BELOW) return true;
  if (globalTemp >= FREEZE_RAIN_ABOVE) return false;
  return prevFreezing;
}

/** Recover the (precip, windLevel) axes from a state that only carries a derived `type`. */
function axesFromType(type: string | undefined): { precip: string; windLevel: string } {
  if (type && /_windy$/.test(type)) {
    return (
      REVERSE_GRID[SEASON_WINDY_CELL] ?? { precip: DEFAULT_PRECIP, windLevel: DEFAULT_WIND_LEVEL }
    );
  }
  return (type && REVERSE_GRID[type]) || { precip: DEFAULT_PRECIP, windLevel: DEFAULT_WIND_LEVEL };
}

/** Top ladder rung flips the wet chain into its `falling` descent; `dry` resets the climb;
 *  off-ladder precip carries the prior phase forward. */
function precipPhaseFor(precip: string, prev: 'rising' | 'falling'): 'rising' | 'falling' {
  if (precip === DEFAULT_PRECIP) return 'rising';
  if (precip === PRECIP_LADDER[PRECIP_LADDER.length - 1]) return 'falling';
  return prev;
}

/** Step one rung toward the calm/dry end; no-op if already there or off-ladder. */
function ladderDown(ladder: string[], id: string): string {
  const i = ladder.indexOf(id);
  return i > 0 ? ladder[i - 1] : id;
}

function weatherDef(type?: string): WeatherDef {
  return WEATHER[type ?? DEFAULT_WEATHER] ?? WEATHER[DEFAULT_WEATHER];
}

/** All weather ids in declaration order (for the debug menu / pickers). */
export const WEATHER_IDS: string[] = WEATHER_FILE.types.map((t) => t.id);

/** Sticky WeatherState for a display type (debug / menu backdrop): both chains' spells run
 *  effectively forever, and wind is seeded mid-band so a debug storm feels stormy immediately. */
export function makeWeather(type: string): WeatherState {
  const def = weatherDef(type);
  const { precip, windLevel } = axesFromType(def.id);
  const band = WIND_BANDS[windLevel] ?? [DEFAULT_WIND, DEFAULT_WIND];
  return {
    type: def.id,
    intensity: def.intensity,
    precip,
    windLevel,
    turnsRemaining: Number.MAX_SAFE_INTEGER,
    windTurns: Number.MAX_SAFE_INTEGER,
    wind: (band[0] + band[1]) / 2,
    windDir: DEFAULT_WIND_DIR,
    phase: precipPhaseFor(precip, 'rising')
  };
}

export function weatherEffects(weather?: WeatherState): WeatherEffects {
  return weatherDef(weather?.type);
}

/** Human-readable weather names (Chronicle / HUD), keyed by id. */
export const WEATHER_LABELS: Record<string, string> = Object.fromEntries(
  WEATHER_FILE.types.map((t) => [t.id, t.label])
);
export function weatherLabel(type?: string): string {
  return weatherDef(type).label;
}

/** Particle/haze overlay the WeatherCanvas should draw for a weather id (`none` = no animation). */
export function weatherOverlayKind(type?: string): WeatherOverlayKind {
  return weatherDef(type).overlay;
}

/** Inherent windiness 0–1 for a weather id (default by overlay kind). */
export function weatherWindStrength(type?: string): number {
  const def = weatherDef(type);
  return def.windStrength ?? (def.heavy ? 0.6 : 0.2);
}

/** Ambient wind 0–1 — single source of truth for overlay slant AND windchill: the stronger of the
 *  type's inherent `windStrength` and the drifting `wind` scalar. Open-field value; shelter applies
 *  on top in `effectiveWindAt`. */
export function ambientWind(weather?: WeatherState): number {
  return Math.max(0, Math.min(1, Math.max(weatherWindStrength(weather?.type), weather?.wind ?? 0)));
}

/** DISPLAY threshold (when wind is worth mentioning) — deliberately lower than needs' WIND_ONSET
 *  (when wind actually chills a pawn); the world can read "slightly windy" while pawns are unbothered. */
export const WIND_DISPLAY_ONSET = 0.2;
/** Wind degree words — shared by the weather readout and the tile HUD so both agree. */
export const WIND_DEGREE_WORDS = ['slightly', 'somewhat', 'fairly', 'very', 'extremely'] as const;
/** Wind 0–1 → degree word, or '' when below the display onset (calm). */
export function windDegreeWord(wind: number): string {
  if (wind < WIND_DISPLAY_ONSET) return '';
  return WIND_DEGREE_WORDS[Math.min(4, Math.floor((wind - WIND_DISPLAY_ONSET) / 0.16))];
}

/** Environmental sight multiplier 0–1 for a weather id (1 = clear; fog/storm shorten detection). */
export function weatherSightMul(type?: string): number {
  return weatherDef(type).sightMul ?? 1;
}

/** Particle tint (0–255 RGB) for a `leaves`/`dust` overlay, or null when the type has none. */
export function weatherParticleColor(type?: string): [number, number, number] | null {
  return weatherDef(type).particleColor ?? null;
}

/** Side-panel colour saturation for a weather id (1 = normal, <1 = washed-out). Default 1. */
export function weatherPanelSaturation(type?: string): number {
  return weatherDef(type).panelSaturation ?? 1;
}

/** Blizzard-level wash the panels are clamped to whenever the world should feel bleak. */
const BLEAK_PANEL_SAT = 0.7;

/** Effective side-panel saturation: the weather's own `panelSaturation`, additionally clamped to a
 *  blizzard-level wash in winter so the whole cold season feels bleak regardless of weather. */
export function effectivePanelSaturation(
  season: Season | undefined,
  weather: WeatherState | undefined
): number {
  const base = weatherPanelSaturation(weather?.type);
  return season === 'winter' ? Math.min(base, BLEAK_PANEL_SAT) : base;
}
/** Whether a weather id is "heavy" (bigger/faster overlay — e.g. heavy_rain / blizzard). */
export function weatherIsHeavy(type?: string): boolean {
  return weatherDef(type).heavy === true;
}

const FALL_SPEED_DEFAULT: Record<WeatherOverlayKind, number> = {
  none: 0,
  rain: 680,
  snow: 80,
  snowdust: 90,
  leaves: 60,
  dust: 40,
  fog: 0,
  foggy_rain: 560
};
const DENSITY_DEFAULT: Record<WeatherOverlayKind, number> = {
  none: 0,
  rain: 160,
  snow: 80,
  snowdust: 90,
  leaves: 45,
  dust: 70,
  fog: 0,
  foggy_rain: 110
};

/** Overlay particle fall speed (px/sec), default by overlay kind. */
export function weatherFallSpeed(type?: string): number {
  const def = weatherDef(type);
  return def.fallSpeed ?? FALL_SPEED_DEFAULT[def.overlay] ?? 680;
}

/** Overlay particle count per megapixel, default by overlay kind. */
export function weatherDensity(type?: string): number {
  const def = weatherDef(type);
  return def.density ?? DENSITY_DEFAULT[def.overlay] ?? 160;
}

export function weatherChronicleSeverity(type: WeatherType): 'info' | 'warning' {
  return weatherDef(type).severity;
}

// Temperature exposure → a 0–100 "need-like" value driving hypothermia / heat stroke conditions.
// 1°C past the comfort band ≈ EXPOSURE_PER_DEGREE points, so ~20°C past comfort saturates at 100.
const EXPOSURE_PER_DEGREE = 5;

/** Cold exposure 0–100: how far `temp` (°C) is below `comfortMin`, scaled. 0 when within comfort. */
export function coldExposure(temp: number, comfortMin: number): number {
  return Math.max(0, Math.min(100, (comfortMin - temp) * EXPOSURE_PER_DEGREE));
}

/** Heat exposure 0–100: how far `temp` (°C) is above `comfortMax`, scaled. 0 when within comfort. */
export function heatExposure(temp: number, comfortMax: number): number {
  return Math.max(0, Math.min(100, (temp - comfortMax) * EXPOSURE_PER_DEGREE));
}

// ─────────────────────────────────────────────────────────────────────────────
// Thermal field — fire warmth + roof shelter
// ─────────────────────────────────────────────────────────────────────────────
// Effective temperature at a pawn:
//   outdoor   = tileTemp + weatherDelta·(1 − weatherProtection)   // roof blocks the weather swing
//   insulated = NEUTRAL + (outdoor − NEUTRAL)·(1 − insulation)     // roof holds interior near neutral
//   effective = insulated + Σ fire warmth                          // fires heat the interior on top
// The worker rebuilds a lightweight field once per tick (rebuildThermalField) so the per-pawn query
// (thermalAt) is O(fires)+O(1). The renderer/HUD computes one tile on demand (computeThermalAt).

/** °C at a fire's centre per unit of `effects.warmth` (0–1), falling off linearly over its light radius. */
const WARMTH_SCALE = 60;
/** Fuel heat rating that yields full rated warmth; hotter fuel radiates proportionally more,
 *  green wood less — clamped to [0.4×, 2×]. */
const WARMTH_REFERENCE_HEAT = 2;
/** Interior temperature (°C) a fully-insulated roof tends toward. */
const NEUTRAL_TEMP = 15;

export interface ThermalSample {
  /** Additive °C from nearby fires. */
  warmth: number;
  /** 0–1 roof insulation (dampens deviation from NEUTRAL_TEMP). */
  insulation: number;
  /** 0–1 roof weather protection (blocks weather temp delta + keeps the tile dry). */
  weatherProtection: number;
  /** True when the tile is under a roof. */
  roofed: boolean;
}
const NO_THERMAL: ThermalSample = {
  warmth: 0,
  insulation: 0,
  weatherProtection: 0,
  roofed: false
};

interface FireSource {
  x: number;
  y: number;
  degrees: number;
  radius: number;
}

/** A lit, complete fire building's warmth contribution (°C at centre + radius), or null. */
function buildingWarmth(b: {
  type: string;
  status: string;
  lit?: boolean;
  fireHeat?: number;
}): FireSource | null {
  if (b.status !== 'complete') return null;
  const def = buildingService.getBuildingById(b.type);
  const warmth = def?.effects?.warmth;
  if (!warmth || !def?.lightRadius) return null;
  const needsFuel = (def.maxFuel ?? 0) > 0;
  if (needsFuel && b.lit !== true) return null;
  // A fuelled fire radiates in proportion to its stoked fuel's heat; fuel-free warmth buildings keep full output.
  const heatScale = needsFuel
    ? Math.max(0.4, Math.min(2, (b.fireHeat ?? WARMTH_REFERENCE_HEAT) / WARMTH_REFERENCE_HEAT))
    : 1;
  return {
    x: (b as PlacedBuilding).x,
    y: (b as PlacedBuilding).y,
    degrees: warmth * WARMTH_SCALE * heatScale,
    radius: def.lightRadius
  };
}

/** A complete roof's shelter (insulation + weather protection) at its tile, or null. */
function buildingShelter(b: {
  type: string;
  status: string;
}): { insulation: number; weatherProtection: number } | null {
  if (b.status !== 'complete') return null;
  const eff = buildingService.getBuildingById(b.type)?.effects;
  if (!eff?.roof) return null;
  return { insulation: eff.thermalInsulation ?? 0, weatherProtection: eff.weatherProtection ?? 0 };
}

// Worker-side per-tick field (rebuilt in the environment phase; queried per pawn).
let fireSources: FireSource[] = [];
let shelterTiles = new Map<string, { insulation: number; weatherProtection: number }>();

// Grove thermal auras (emberwood warms, moonwood cools — negative `degrees`). Static resources, so the
// full-map scan is cached and redone only when the worldMap REFERENCE changes — never per tick.
// Caveat: harvesting a grove to 0 leaves its aura until the next worldMap rebuild (rare + minor).
let groveSources: FireSource[] = [];
let groveMapRef: WorldTile[][] | null = null;

function scanGroveThermal(worldMap: WorldTile[][]): FireSource[] {
  const out: FireSource[] = [];
  for (let y = 0; y < worldMap.length; y++) {
    const row = worldMap[y];
    for (let x = 0; x < row.length; x++) {
      const res = row[x]?.resources;
      if (!res) continue;
      for (const id in res) {
        if ((res[id] ?? 0) <= 0) continue;
        const t = resourceObjectService.getById(id)?.thermal;
        if (t && t.radius > 0) out.push({ x, y, degrees: t.degrees, radius: t.radius });
      }
    }
  }
  return out;
}

/** Rebuild the thermal field from current buildings — once per tick (O(buildings)). `worldMap`
 *  (when passed) folds in the cached grove auras. */
export function rebuildThermalField(
  buildings: PlacedBuilding[] | undefined,
  worldMap?: WorldTile[][]
): void {
  const fires: FireSource[] = [];
  const shelter = new Map<string, { insulation: number; weatherProtection: number }>();
  for (const b of buildings ?? []) {
    const f = buildingWarmth(b);
    if (f) fires.push(f);
    const s = buildingShelter(b);
    if (s) {
      const key = b.y + ',' + b.x;
      const prev = shelter.get(key);
      shelter.set(
        key,
        prev
          ? {
              insulation: Math.max(prev.insulation, s.insulation),
              weatherProtection: Math.max(prev.weatherProtection, s.weatherProtection)
            }
          : s
      );
    }
  }
  if (worldMap && worldMap !== groveMapRef) {
    groveMapRef = worldMap;
    groveSources = scanGroveThermal(worldMap);
  }
  fireSources = groveSources.length ? fires.concat(groveSources) : fires;
  shelterTiles = shelter;
}

/** Sample the prebuilt thermal field at a tile (worker hot path: O(fires) + O(1)). */
export function thermalAt(x: number, y: number): ThermalSample {
  let warmth = 0;
  for (let i = 0; i < fireSources.length; i++) {
    const f = fireSources[i];
    const dx = x - f.x;
    const dy = y - f.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < f.radius) warmth += f.degrees * (1 - dist / f.radius);
  }
  const s = shelterTiles.get(y + ',' + x);
  if (!s && warmth === 0) return NO_THERMAL;
  return {
    warmth,
    insulation: s?.insulation ?? 0,
    weatherProtection: s?.weatherProtection ?? 0,
    roofed: !!s
  };
}

/** Is the tile under a roof? (Reads the prebuilt field — used for the `sheltered` status.) */
export function isRoofedTile(x: number, y: number): boolean {
  return shelterTiles.has(y + ',' + x);
}

/** Max grove thermal radius to scan around a tile in computeThermalAt's local window. */
const GROVE_SCAN_RADIUS = 8;

/** On-demand thermal sample from a buildings array (renderer/HUD has no prebuilt field). When
 *  `worldMap` is supplied, grove auras within ±GROVE_SCAN_RADIUS fold in so the HUD matches the sim. */
export function computeThermalAt(
  x: number,
  y: number,
  buildings: PlacedBuilding[] | undefined,
  worldMap?: WorldTile[][]
): ThermalSample {
  let warmth = 0;
  let insulation = 0;
  let weatherProtection = 0;
  let roofed = false;
  for (const b of buildings ?? []) {
    const f = buildingWarmth(b);
    if (f) {
      const dx = x - f.x;
      const dy = y - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < f.radius) warmth += f.degrees * (1 - dist / f.radius);
    }
    if (b.x === x && b.y === y) {
      const s = buildingShelter(b);
      if (s) {
        roofed = true;
        insulation = Math.max(insulation, s.insulation);
        weatherProtection = Math.max(weatherProtection, s.weatherProtection);
      }
    }
  }
  if (worldMap) {
    for (let yy = Math.max(0, y - GROVE_SCAN_RADIUS); yy <= y + GROVE_SCAN_RADIUS; yy++) {
      const row = worldMap[yy];
      if (!row) continue;
      for (let xx = Math.max(0, x - GROVE_SCAN_RADIUS); xx <= x + GROVE_SCAN_RADIUS; xx++) {
        const res = row[xx]?.resources;
        if (!res) continue;
        for (const id in res) {
          if ((res[id] ?? 0) <= 0) continue;
          const t = resourceObjectService.getById(id)?.thermal;
          if (!t || t.radius <= 0) continue;
          const dist = Math.sqrt((x - xx) ** 2 + (y - yy) ** 2);
          if (dist < t.radius) warmth += t.degrees * (1 - dist / t.radius);
        }
      }
    }
  }
  return { warmth, insulation, weatherProtection, roofed };
}

/** Effective temperature (°C) at a tile = weather-shielded outdoor temp, insulated toward neutral, plus fire warmth. */
export function effectiveTemperature(
  baseTileTemp: number,
  weatherTempDelta: number,
  thermal: ThermalSample
): number {
  const outdoor = baseTileTemp + weatherTempDelta * (1 - thermal.weatherProtection);
  const insulated = NEUTRAL_TEMP + (outdoor - NEUTRAL_TEMP) * (1 - thermal.insulation);
  return insulated + thermal.warmth;
}

// Per-biome baseline wetness (0–100%) lives in terrains.jsonc (`baseMoisture`). Weather adds/removes
// on top. Derived display value — not a persisted per-tile field, so it never rides the snapshot
// (computed on demand for the hovered tile).
const DEFAULT_BIOME_MOISTURE = 35;

/** Biome baseline wetness (0–100%) for a tile's terrainType. */
export function biomeBaseMoisture(terrainType: string): number {
  return BIOMES[terrainType]?.baseMoisture ?? DEFAULT_BIOME_MOISTURE;
}

function weatherMoistureBonus(weather?: WeatherState): number {
  return weatherDef(weather?.type).moistureBonus;
}

// Base tile wetness is distributed by DISTANCE TO WATER (SEASONS_WEATHER): tiles touching water are
// near-saturated and the damp thins out with distance like it would spread from a shoreline, bottoming
// out at the biome's own baseline far inland. The per-tile distance field is computed once at world-gen
// (WorldGenerator.assignMoisture, a chamfer distance transform) and baked into `tile.moisture`; the two
// functions below are just the falloff CURVE and the weather add-on, kept here with the rest of the
// wetness model so the worldgen pass and the runtime read it from one place.
const WATER_EDGE_MOISTURE = 95; // base wetness % of a tile right beside water
const MOISTURE_FALLOFF_TILES = 9; // distance (tiles) over which water's influence falls to ~37% (1/e)

/** Base wetness (0–100%) for a tile from its biome baseline and distance (in tiles) to the nearest
 *  water. Water saturates adjacent ground (≈WATER_EDGE_MOISTURE) and decays exponentially with
 *  distance — the "spider-web thinning" — never dropping below the biome's own baseMoisture floor. */
export function baseMoistureFromWater(biomeMoisture: number, distanceToWater: number): number {
  const fromWater = WATER_EDGE_MOISTURE * Math.exp(-distanceToWater / MOISTURE_FALLOFF_TILES);
  return Math.max(0, Math.min(100, Math.max(biomeMoisture, fromWater)));
}

/** Display/sim wetness (0–100%) for a tile = its baked base moisture (distance-to-water falloff) plus
 *  the current weather contribution. Pass the tile's `moisture` so this stays a pure scalar function;
 *  the weather (rain) contribution is kept out under a roof. */
export function tileWetness(
  baseMoisture: number,
  weather?: WeatherState,
  thermal: ThermalSample = NO_THERMAL,
  ice = 0
): number {
  const fromWeather = weatherMoistureBonus(weather) * (1 - thermal.weatherProtection);
  const wet = Math.max(0, Math.min(100, baseMoisture + fromWeather));
  // Frozen water isn't liquid: ice cover suppresses effective wetness so a frozen tile reads dry (and
  // pawns/mobs stop soaking on it) — a full sheet ⇒ 0% wet. This is what stops "wet dirt at −3°C".
  return ice > 0 ? wet * (1 - Math.min(100, ice) / 100) : wet;
}

// ── Wetness meter (SEASONS_WEATHER) — shared by pawns AND mobs ────────────────────────────────────
// The `wet` condition onsets at a FULL meter (100) for EVERY entity (uniform, like every metered
// condition); susceptibility differs only in how FAST the meter fills — gated by the `wetness_resistance`
// stat (fur/hide/fitness), so a hardy/woolly creature soaks slower. NOT a different onset threshold.
const HOUR_SECONDS = TURNS_PER_DAY / 24; // in-game seconds per hour (300/24 = 12.5)
export const WET_TILE_THRESHOLD = 50; // tile wetness % above which an entity starts to soak
const WET_HEAVY_THRESHOLD = 80; // above this the meter fills twice as fast (full in ~½ hour)
const WET_SOAK_HOURS = 1; // >50% tile → full meter (0→100) in ~1 in-game hour (at zero resistance)
const WET_SOAK_HOURS_HEAVY = 0.5; // >80% tile → full in ~30 in-game minutes
const WET_DRY_HOURS_MAX = 5; // cold + exposed → full dry (100→0) takes ~5 in-game hours
const WET_DRY_HOURS_MIN = 1; // warm + sheltered → ~1 in-game hour

/**
 * Advance a wetness meter (0–100) one step toward soaked/dry. Soaks on a wet (>50%) tile, fill rate
 * slowed by `resistance` (0–1, the `wetness_resistance` stat) — so every entity onsets `wet` at 100, but
 * a water-shedding creature climbs there slower. Dries off wet ground, faster when warm/sheltered
 * (`drySpeed01` 0–1). `dt` = elapsed in-game seconds. Shared by PawnService + the mob lifecycle.
 */
export function accrueWetness(
  current: number,
  tileWet: number,
  dt: number,
  resistance: number,
  drySpeed01: number
): number {
  if (tileWet >= 100) return 100; // standing water / torrential rain → instantly soaked
  if (tileWet > WET_TILE_THRESHOLD) {
    const soakHours = tileWet >= WET_HEAVY_THRESHOLD ? WET_SOAK_HOURS_HEAVY : WET_SOAK_HOURS;
    const res = Math.min(0.9, Math.max(0, resistance)); // capped so it never fully prevents soaking
    return Math.min(100, current + (100 / (soakHours * HOUR_SECONDS)) * (1 - res) * dt);
  }
  if (current > 0) {
    const dryHours = WET_DRY_HOURS_MAX - (WET_DRY_HOURS_MAX - WET_DRY_HOURS_MIN) * drySpeed01;
    return Math.max(0, current - (100 / (dryHours * HOUR_SECONDS)) * dt);
  }
  return current;
}

/**
 * Wild-creature weather exposure at a tile: effective wind (0–1) and wetness (0–100), computed with NO
 * shelter (wild mobs don't take cover under roofs — lee-of-terrain wind shelter from `worldMap` still
 * applies). Lets the creature tick drive `windchilled`/`wet` without building a ThermalSample or tracking
 * accrued meters the way pawns do. `baseMoisture` is the tile's baked moisture.
 */
export function creatureExposureAt(
  x: number,
  y: number,
  weather: WeatherState | undefined,
  worldMap: WorldTile[][],
  baseMoisture: number
): { wind: number; wetness: number } {
  return {
    wind: effectiveWindAt(x, y, weather, NO_THERMAL, worldMap),
    // Ice on the tile reads wetness down (frozen ≠ wet) — a creature on frozen ground doesn't soak.
    wetness: tileWetness(baseMoisture, weather, NO_THERMAL, worldMap[y]?.[x]?.ice ?? 0)
  };
}

/**
 * Effective temperature (°C) at a tile for display — mirrors what the need-rate hot path computes:
 * baked tile temperature (biome base + season offset) + the live weather delta + the diurnal day/night
 * swing, then shelter (roof insulation + weather protection) + nearby fire warmth. Computed on demand
 * from `terrainType` + season + turn + weather (+ optional thermal sample), so the worker-only
 * `tile.temperature` never ships.
 */
export function tileTemperature(
  terrainType: string,
  season: Season | undefined,
  turn: number,
  weather?: WeatherState,
  thermal: ThermalSample = NO_THERMAL
): number {
  // Single source of truth for the base (biome + season): `seasonBakedTemp` — the SAME helper the sim's
  // per-pawn temperature path uses, so the HUD and the cold/heat simulation can never disagree.
  const base = seasonBakedTemp(terrainType, season);
  const airDelta = weatherEffects(weather).tempDelta + diurnalTempDelta(turn, season);
  return effectiveTemperature(base, airDelta, thermal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Snow cover (SEASONS_WEATHER) — per-tile accumulation, mutated IN PLACE.
// ─────────────────────────────────────────────────────────────────────────────

/** Wetter tiles collect snow faster: dry ≈ 0.4×, soaked ≈ 1.8×. */
function snowWetFactor(wetness: number): number {
  return 0.4 + (Math.max(0, Math.min(100, wetness)) / 100) * 1.4;
}
/** Snow gained per in-game hour on a wet-neutral tile while it's snowing and below freezing. */
const SNOW_ACCRUAL_PER_HOUR = 1.75;
/** Natural snow caps here (not 100): the in-game world tops out at the renderer's ~half-coverage look.
 *  The debug slider (devSetMapSnow) can still push past this to preview heavier cover. */
const SNOW_NATURAL_MAX = 50;
/** Snow lost per in-game hour once the tile is at/above 0°C. */
const SNOW_MELT_PER_HOUR = 2;
/** Only re-bake/ship a tile when its snow crosses one of these buckets (keeps deltas bounded). */
const SNOW_RENDER_STEP = 5;

// ── Ice (the tile's OWN moisture freezing in place — distinct from snow, which falls from the sky) ──
/** Ice gained per in-game hour while below 0°C (gradual, like growth — wetness doesn't flash-freeze). */
const ICE_FREEZE_PER_HOUR = 3;
/** Ice lost per in-game hour once at/above 0°C (thaws a touch faster than it forms). */
const ICE_MELT_PER_HOUR = 4;
/** Only re-bake/ship a tile when its ice crosses one of these buckets (bounds deltas, like snow). */
const ICE_RENDER_STEP = 5;
/** °C below freezing at which ice forms at full rate; nearer 0 freezes slower (floor keeps it progressing). */
const ICE_FULL_FREEZE_AT = 8;
/** Movement cost of a frozen-over water tile — walkable but slippery, slower than open ground. */
export const ICE_WATER_MOVE_COST = 2;
/** Below this %, ice is HIDDEN (no readout, no overlay) so a stray rime doesn't clutter every cold tile. */
export const ICE_VISIBLE = 8;
/** Ice thickness at which an (otherwise impassable) water tile freezes solid → walkable. Reverts on thaw.
 *  The freeze ceiling is the tile's own water content, so only genuinely wet tiles (open water/marsh)
 *  ever reach this — dry land tops out far lower — and a cliff is never turned walkable. */
export const ICE_WALKABLE = 60;

/** True for the weather overlays that actually deposit snow. */
function isSnowingWeather(weather?: WeatherState): boolean {
  const o = weatherOverlayKind(weather?.type);
  return o === 'snow' || o === 'snowdust';
}

/**
 * Accumulate / melt SNOW and ICE across the whole map IN PLACE (PERF-1: mutate `tile.snow`/`tile.ice`,
 * never rebuild the worldMap). Snow falls from the sky (builds only while it's SNOWING and temp < 0°C);
 * ice is the tile's OWN moisture freezing in place (builds whenever temp < 0°C, gradually, capped by how
 * much water the tile holds). Both melt at/above freezing. Call on a SLOW cadence (hourly) — only tiles
 * whose snow/ice crosses a render bucket (or whose walkability flips) are marked dirty, so the
 * worldMapDelta stays small. `patchWalkable` is wired by the engine to the pathfinder so a water tile
 * that freezes solid (ice ≥ ICE_WALKABLE) becomes walkable-but-slippery and reverts on thaw.
 * Uses the baked `tile.temperature` (biome+season) + the live weather delta + the diurnal swing.
 */
export function accumulateSnow(
  worldMap: WorldTile[][],
  weather: WeatherState | undefined,
  season: Season | undefined,
  turn: number,
  hours = 1,
  patchWalkable?: (x: number, y: number, walkable: boolean) => void
): void {
  const snowing = isSnowingWeather(weather);
  const wDelta = weatherEffects(weather).tempDelta + diurnalTempDelta(turn, season);
  for (const row of worldMap) {
    for (const tile of row) {
      // Walkable tiles read their baked cache; impassable tiles (cliffs/peaks) carry no cached temp, so
      // recompute their biome temp on the fly here — keeps high peaks snow-capped without storing a temp.
      const baseTemp = tile.temperature ?? seasonBakedTemp(tile.terrainType, season);
      const temp = baseTemp + wDelta;

      // ── Snow (deposited by snowfall) ──
      const prevSnow = tile.snow ?? 0;
      let nextSnow = prevSnow;
      if (snowing && temp < 0) {
        nextSnow = Math.min(
          SNOW_NATURAL_MAX,
          prevSnow +
            SNOW_ACCRUAL_PER_HOUR * snowWetFactor(tileWetness(tile.moisture ?? 0, weather)) * hours
        );
      } else if (temp >= 0 && prevSnow > 0) {
        nextSnow = Math.max(0, prevSnow - SNOW_MELT_PER_HOUR * hours);
      }
      if (nextSnow !== prevSnow) {
        tile.snow = nextSnow;
        if (Math.floor(nextSnow / SNOW_RENDER_STEP) !== Math.floor(prevSnow / SNOW_RENDER_STEP)) {
          // 'snow' kind: repaints only the blended snow layer — a whole-map onset/melt wave must
          // never re-bake the terrain/resource grids (the snow-onset hiccup).
          markTileDirty(tile.y, tile.x, tile, 'snow');
        }
      }

      // ── Ice (the tile's own water freezing in place — gradual, capped by its liquid water content) ──
      // Only WET-CAPABLE tiles freeze: walkable ground (holds a wet rime) and OPEN WATER (impassable, but
      // freezes solid → walkable). DRY IMPASSABLE ROCK (cliffs / mountain peaks) has no liquid water to
      // freeze, so it's skipped entirely — no wasted per-tile work and no nonsensical ice sheet on a cliff
      // face (snow still caps those peaks above). `type === 'water'` is the open-water signal.
      const prevIce = tile.ice ?? 0;
      const canFreeze = tile.walkable || tile.type === 'water';
      if (!canFreeze) {
        // Clear any stray ice such a tile picked up before this gate existed (e.g. the debug slider).
        if (prevIce > 0) {
          tile.ice = 0;
          markTileDirty(tile.y, tile.x, tile, 'snow');
        }
        continue;
      }
      let nextIce = prevIce;
      if (temp < 0) {
        // Ceiling = how much liquid water the tile actually holds (raw wetness, no ice read-down): open
        // water freezes to a thick sheet, dry dirt only a thin rime.
        const wetCeiling = Math.min(100, tileWetness(tile.moisture ?? 0, weather));
        if (wetCeiling > prevIce) {
          const coldFactor = Math.min(1, Math.max(0.15, -temp / ICE_FULL_FREEZE_AT));
          nextIce = Math.min(wetCeiling, prevIce + ICE_FREEZE_PER_HOUR * coldFactor * hours);
        }
      } else if (prevIce > 0) {
        nextIce = Math.max(0, prevIce - ICE_MELT_PER_HOUR * hours);
      }
      if (nextIce !== prevIce) {
        tile.ice = nextIce;
        // A normally-impassable water tile freezes solid → walkable-but-slippery once the sheet crosses
        // ICE_WALKABLE, and thaws back to open water below it. Gated on the BASE subterrain being
        // unwalkable, so a frozen land tile is never affected and only water we froze is reverted.
        let flipped = false;
        const baseSub = SUBTERRAINS[tile.subType] ?? SUBTERRAIN_FALLBACK;
        if (!baseSub.walkable) {
          const wasWalk = prevIce >= ICE_WALKABLE;
          const nowWalk = nextIce >= ICE_WALKABLE;
          if (nowWalk && !wasWalk) {
            tile.walkable = true;
            tile.movementCost = ICE_WATER_MOVE_COST;
            patchWalkable?.(tile.x, tile.y, true);
            flipped = true;
          } else if (!nowWalk && wasWalk) {
            tile.walkable = false;
            tile.movementCost = baseSub.movementCost;
            patchWalkable?.(tile.x, tile.y, false);
            flipped = true;
          }
        }
        if (
          flipped ||
          Math.floor(nextIce / ICE_RENDER_STEP) !== Math.floor(prevIce / ICE_RENDER_STEP)
        ) {
          // 'snow' kind: the ice glaze renders in the blended snow layer; the walkable flip carries
          // no terrain-grid visual (pathfinding is patched directly above), so terrain stays cached.
          markTileDirty(tile.y, tile.x, tile, 'snow');
        }
      }
    }
  }
}

/** Ambient-wind starting/fallback value when a WeatherState carries none (back-compat). */
const DEFAULT_WIND = 0.3;
/** Per-day ambient-wind random-walk step magnitude (±), within the current wind level's band. */
const WIND_DRIFT = 0.18;

// ── Wind direction (8-way compass) — drives the downwind shelter shadow ───────
/** Starting/fallback wind direction (index into WIND_DIRS) when a WeatherState carries none. */
const DEFAULT_WIND_DIR = 0;
/** Per-day chance the wind backs/veers one step (±1 of the 8 compass points). */
const WIND_DIR_TURN_CHANCE = 0.4;
/** Unit (dx, dy) the wind BLOWS TOWARD for each 8-way index, and its label. y+ is south. */
const WIND_DIRS: ReadonlyArray<{ dx: number; dy: number; label: string }> = [
  { dx: 0, dy: -1, label: 'N' },
  { dx: 1, dy: -1, label: 'NE' },
  { dx: 1, dy: 0, label: 'E' },
  { dx: 1, dy: 1, label: 'SE' },
  { dx: 0, dy: 1, label: 'S' },
  { dx: -1, dy: 1, label: 'SW' },
  { dx: -1, dy: 0, label: 'W' },
  { dx: -1, dy: -1, label: 'NW' }
];
/** How many tiles downwind a wall/mountain shelters; nearer the wall = calmer. */
const WIND_SHADOW_LEN = 4;

/** The (dx, dy) the wind blows toward for an 8-way direction index (wraps; tolerates undefined). */
export function windVector(dir?: number): { dx: number; dy: number } {
  const d = WIND_DIRS[(((dir ?? DEFAULT_WIND_DIR) % 8) + 8) % 8];
  return { dx: d.dx, dy: d.dy };
}
/** Compass label (N/NE/E…) for an 8-way wind direction index. */
export function windDirLabel(dir?: number): string {
  return WIND_DIRS[(((dir ?? DEFAULT_WIND_DIR) % 8) + 8) % 8].label;
}

/**
 * Shelter 0–1 a tile gets from sitting in the lee of an impassable tile (mountain/cliff/built wall —
 * `worldMap[y][x].walkable === false`). Ray-marches UPWIND (opposite the wind vector) up to
 * `WIND_SHADOW_LEN` tiles: the nearest blocker gives `1 − (i−1)/WIND_SHADOW_LEN` — full shelter
 * directly behind it (i=1), fading to open wind further downwind. O(WIND_SHADOW_LEN); pawns are few,
 * so this is cheap enough to call per pawn per tick without a precomputed field. 0 in the open / upwind.
 */
export function windShelterAt(
  x: number,
  y: number,
  windDir: number | undefined,
  worldMap: WorldTile[][],
  maxTiles = WIND_SHADOW_LEN
): number {
  const { dx, dy } = windVector(windDir);
  for (let i = 1; i <= maxTiles; i++) {
    const tx = x - dx * i;
    const ty = y - dy * i;
    const tile = worldMap[ty]?.[tx];
    if (!tile) break; // off the map upwind → treat as open
    if (tile.walkable === false) return 1 - (i - 1) / maxTiles;
  }
  return 0;
}

/**
 * Effective wind 0–1 a pawn actually feels at a tile = open-field `ambientWind`, cut by a roof's
 * `weatherProtection` (a roof keeps the weather — wind included — out) and by the downwind shelter of
 * a wall/mountain (`windShelterAt`). Drives the `windchilled` condition and amplifies cold exposure.
 */
export function effectiveWindAt(
  x: number,
  y: number,
  weather: WeatherState | undefined,
  thermal: ThermalSample,
  worldMap: WorldTile[][]
): number {
  const open = ambientWind(weather);
  if (open <= 0) return 0;
  const roofed = open * (1 - thermal.weatherProtection);
  if (roofed <= 0) return 0;
  return roofed * (1 - windShelterAt(x, y, weather?.windDir, worldMap));
}

/**
 * Weighted Markov step over one chain's `transitions` (weather.jsonc `precip`/`wind` states). Each
 * season-valid and phase-valid neighbour contributes a weight (its `chance`, or the season
 * `precipitation` for `seasonPrecip`); one draw selects among them and the leftover weight (1 − Σ) is
 * the chance the state simply persists. Drawing over the real pool (Σ + persist) keeps every branch's
 * proportional share regardless of array order. Returns the next state id (or the current one on persist).
 */
function rollChain(
  state: ChainState | undefined,
  season: Season,
  phase: 'rising' | 'falling',
  rng: SeededRng
): string | undefined {
  const transitions = state?.transitions ?? [];
  const weighted: Array<{ to: string; w: number }> = [];
  let total = 0;
  for (const tr of transitions) {
    if (tr.seasons && !tr.seasons.includes(season)) continue;
    if (tr.phase && tr.phase !== phase) continue;
    const w = tr.seasonPrecip ? SEASONS[season].precipitation : (tr.chance ?? 0);
    if (w <= 0) continue;
    weighted.push({ to: tr.to, w });
    total += w;
  }
  if (total <= 0) return state?.id;
  const persist = Math.max(0, 1 - total);
  const r = rng.random() * (total + persist);
  let acc = 0;
  for (const { to, w } of weighted) {
    acc += w;
    if (r < acc) return to;
  }
  return state?.id; // fell into the persist slice
}

/**
 * Advance the weather one in-game day (day boundaries only — one new WeatherState per day, negligible
 * snapshot churn). TWO orthogonal chains step independently: PRECIP (wet axis) and WIND (windy axis),
 * each re-rolling when its own spell elapses. The displayed `type` is DERIVED from the (precip, wind)
 * pair, so wind and rain can never contradict and a storm needs BOTH chains at their peak at once. When
 * yesterday's pair landed on a storm-corner type, both chains step one rung toward calm before deriving
 * — the front passes and spends the storm on both axes. The ambient-wind scalar random-walks but stays
 * inside its wind level's band, so the readout always matches the level (and thus the type).
 */
export function advanceWeatherForDay(
  weather: WeatherState,
  season: Season,
  rng: SeededRng,
  freezing = false
): WeatherState {
  // Ambient wind direction backs/veers one of the 8 compass points on a chance roll (its own slow walk).
  let windDir = weather.windDir ?? DEFAULT_WIND_DIR;
  if (rng.chance(WIND_DIR_TURN_CHANCE)) windDir = (windDir + (rng.chance(0.5) ? 1 : 7)) % 8;

  // Recover both axes (a legacy save / debug state may carry only `type`).
  const recovered = axesFromType(weather.type);
  let precip = weather.precip ?? recovered.precip;
  let windLevel = weather.windLevel ?? recovered.windLevel;
  let phase = precipPhaseFor(precip, weather.phase ?? 'rising');

  let precipTurns = (weather.turnsRemaining ?? 0) - TICKS_PER_DAY;
  let windTurns = (weather.windTurns ?? 0) - TICKS_PER_DAY;
  const reroll = precipTurns <= 0 || windTurns <= 0;
  const [pMin, pMax] = PRECIP_CHAIN.durationRange;
  const [wMin, wMax] = WIND_CHAIN.durationRange;

  if (STORM_CORNER.has(weather.type ?? '') && reroll) {
    // The front passes: both axes step one rung toward calm and the wet chain enters its descent.
    precip = ladderDown(PRECIP_LADDER, precip);
    windLevel = ladderDown(WIND_LADDER, windLevel);
    phase = 'falling';
    precipTurns = rng.int(pMin, pMax);
    windTurns = rng.int(wMin, wMax);
  } else {
    if (precipTurns <= 0) {
      precip = rollChain(PRECIP_STATES[precip], season, phase, rng) ?? precip;
      phase = precipPhaseFor(precip, phase);
      precipTurns = rng.int(pMin, pMax);
    }
    if (windTurns <= 0) {
      windLevel = rollChain(WIND_STATES[windLevel], season, phase, rng) ?? windLevel;
      windTurns = rng.int(wMin, wMax);
    }
  }

  const band = WIND_BANDS[windLevel] ?? [DEFAULT_WIND, DEFAULT_WIND];
  let wind = (weather.wind ?? (band[0] + band[1]) / 2) + (rng.random() * 2 - 1) * WIND_DRIFT;
  wind = Math.max(band[0], Math.min(band[1], wind));

  const type = deriveWeatherType(precip, windLevel, season, freezing);
  const def = weatherDef(type);
  return {
    type,
    intensity: def.intensity,
    precip,
    windLevel,
    turnsRemaining: precipTurns,
    windTurns,
    wind,
    windDir,
    phase
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined seasonal + weather visual tint (Subsystems 2 & 5 — folded into the
// existing ambient uniform, PERF-5: a uniform update, never a terrain rebuild).
// ─────────────────────────────────────────────────────────────────────────────

const WHITE: [number, number, number] = [1, 1, 1];

/** Hue multiplier for a weather type — from weather.jsonc `tint`. */
function weatherTint(weather?: WeatherState): [number, number, number] {
  return weatherDef(weather?.type).tint;
}

/** Season hue × weather hue, multiplied into the day/night ambient tint by the renderer. */
export function getEnvironmentTint(
  season: Season | undefined,
  weather: WeatherState | undefined
): [number, number, number] {
  const s = season ? SEASONS[season].tint : WHITE;
  const w = weatherTint(weather);
  return [s[0] * w[0], s[1] * w[1], s[2] * w[2]];
}

/** How far winter pulls the map's ambient hue toward neutral (0 = unchanged, 1 = fully grey). */
const WINTER_TINT_DESAT = 0.82;

/**
 * Final ambient tint the RENDERER multiplies onto the map = day/night `baseTint` × season/weather
 * hue, then — in WINTER — desaturated toward neutral. With the map under white snow, the strong
 * dawn/dusk/night hues (orange/purple) paint the snow garishly; winter mutes the HUE while leaving
 * brightness (the separate `light` scalar) alone, so winter nights read as a normal dark, not violet.
 * Other seasons are unchanged.
 */
export function getMapAmbientTint(
  baseTint: [number, number, number],
  season: Season | undefined,
  weather: WeatherState | undefined
): [number, number, number] {
  const env = getEnvironmentTint(season, weather);
  const t: [number, number, number] = [
    baseTint[0] * env[0],
    baseTint[1] * env[1],
    baseTint[2] * env[2]
  ];
  if (season !== 'winter') return t;
  const lum = 0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2];
  const k = WINTER_TINT_DESAT;
  return [lerp(t[0], lum, k), lerp(t[1], lum, k), lerp(t[2], lum, k)];
}

class EnvironmentServiceImpl {
  /**
   * Turn to feed into ambient light/tint calculations. Honours the debug `_debugTimeOfDay` override
   * (a fixed fraction of the day) by mapping it to a synthetic turn, so the renderer can hold the
   * world at a chosen day/night phase while the real sim turn keeps advancing. Falls back to the
   * live turn when no override is set.
   */
  ambientTurn(gs: { turn: number; _debugTimeOfDay?: number }): number {
    return gs._debugTimeOfDay != null ? Math.round(gs._debugTimeOfDay * TICKS_PER_DAY) : gs.turn;
  }

  /**
   * Season to drive visuals (panel bleakness, map-tint desaturation). Honours the debug `_debugSeason`
   * override IMMEDIATELY — `gs.season` only catches up after `processEnvironment` runs a tick, so while
   * paused the override wouldn't apply and the UI would read the stale season (e.g. stay winter-bleak
   * after toggling to summer). Falls back to the live season.
   */
  effectiveSeason(gs: { season?: Season; _debugSeason?: Season }): Season | undefined {
    return gs._debugSeason ?? gs.season;
  }

  getAmbient(turn: number): AmbientState {
    return {
      light: getAmbientLight(turn),
      tint: getAmbientTint(turn),
      panelTint: getPanelTint(turn)
    };
  }

  /** Season + 0-indexed day for a turn. */
  getSeason(turn: number): { season: Season; seasonDay: number } {
    return seasonForTurn(turn);
  }

  /** Gameplay effects for the current weather. */
  getWeatherEffects(weather?: WeatherState): WeatherEffects {
    return weatherEffects(weather);
  }

  /** Combined season + weather hue for the renderer's ambient multiply. */
  getEnvironmentTint(
    season: Season | undefined,
    weather: WeatherState | undefined
  ): [number, number, number] {
    return getEnvironmentTint(season, weather);
  }

  /** Final map ambient tint (day/night × season/weather, winter-desaturated). See getMapAmbientTint. */
  getMapAmbientTint(
    baseTint: [number, number, number],
    season: Season | undefined,
    weather: WeatherState | undefined
  ): [number, number, number] {
    return getMapAmbientTint(baseTint, season, weather);
  }
}

export const environmentService = new EnvironmentServiceImpl();
