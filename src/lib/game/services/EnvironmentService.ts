import { TICKS_PER_SECOND } from '../core/util/time';
import { vlog } from '../core/util/logSink';
import { markTileDirty } from '../core/state/tileDeltas';
import { buildingLight } from './LightingService';
import { buildingService } from './BuildingService';
import { resourceObjectService } from './ResourceObjectService';
import { BIOMES, SUBTERRAINS, SUBTERRAIN_FALLBACK } from '../core/defs/terrains';
import seasonsData from '../database/world/seasons.json';
import weatherData from '../database/world/weather.json';
import type { SeededRng } from '../core/util/rng';
import type { Season, WeatherState, WeatherType, WorldTile, PlacedBuilding } from '../core/types';

export const TURNS_PER_DAY = 300;
const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;

export const TICKS_PER_GAME_HOUR = TICKS_PER_DAY / 24;
export const ticksFromGameHours = (hours: number): number =>
  Math.round(hours * TICKS_PER_GAME_HOUR);
export const gameHoursFromTicks = (ticks: number): number => ticks / TICKS_PER_GAME_HOUR;

export function getTimeOfDay(turn: number): number {
  return (turn % TICKS_PER_DAY) / TICKS_PER_DAY;
}

let _ambientTurn = Number.NaN;
let _ambientLight = 1;
export function getAmbientLight(turn: number): number {
  if (turn === _ambientTurn) return _ambientLight;
  _ambientTurn = turn;
  const { a, b, f } = resolveKeyframes(getTimeOfDay(turn));
  _ambientLight = lerp(a.light, b.light, f);
  return _ambientLight;
}

interface AmbientKeyframe {
  t: number;
  light: number;
  tint: [number, number, number];
}

const AMBIENT_KEYFRAMES: AmbientKeyframe[] = [
  { t: 0.0, light: 0.15, tint: [0.72, 0.4, 1.0] },
  { t: 0.21, light: 0.15, tint: [0.7, 0.42, 1.0] },
  { t: 0.26, light: 0.35, tint: [1.0, 0.6, 0.28] },
  { t: 0.31, light: 0.82, tint: [1.0, 0.68, 0.32] },
  { t: 0.37, light: 0.96, tint: [1.0, 0.9, 0.72] },
  { t: 0.5, light: 1.0, tint: [1.0, 1.0, 1.0] },
  { t: 0.64, light: 1.0, tint: [1.0, 0.98, 0.88] },
  { t: 0.72, light: 1.0, tint: [1.0, 0.8, 0.45] },
  { t: 0.78, light: 0.88, tint: [1.0, 0.6, 0.28] },
  { t: 0.84, light: 0.52, tint: [1.0, 0.5, 0.32] },
  { t: 0.9, light: 0.28, tint: [0.82, 0.45, 0.9] },
  { t: 0.95, light: 0.18, tint: [0.74, 0.4, 1.0] },
  { t: 1.0, light: 0.15, tint: [0.72, 0.4, 1.0] }
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

export function getAmbientTint(turn: number): [number, number, number] {
  const { a, b, f } = resolveKeyframes(getTimeOfDay(turn));
  return lerpTint(a.tint, b.tint, f);
}

const PANEL_BRIGHT_FLOOR = 0.45;
const PANEL_SAT = 0.8;
export function getPanelTint(turn: number): [number, number, number] {
  const light = getAmbientLight(turn);
  const tint = getAmbientTint(turn);
  const bright = PANEL_BRIGHT_FLOOR + (1 - PANEL_BRIGHT_FLOOR) * light;
  const mul = (c: number) => bright * (1 - PANEL_SAT + PANEL_SAT * c);
  return [mul(tint[0]), mul(tint[1]), mul(tint[2])];
}

export interface AmbientState {
  light: number;
  tint: [number, number, number];
  panelTint: [number, number, number];
}

interface GroveLight {
  x: number;
  y: number;
  intensity: number;
  radius: number;
}
let groveLightSources: GroveLight[] = [];
let groveLightMapRef: WorldTile[][] | null = null;

let groveVersion = 0;

interface BuildingLightSource {
  x: number;
  y: number;
  intensity: number;
  radius: number;
}
let buildingLightSources: BuildingLightSource[] = [];
let buildingLightRef: unknown = null;
let buildingLightSig = '';
let buildingLightVersion = 0;

function litBuildingSources(
  buildings: { type: string; status: string; lit?: boolean; x: number; y: number }[]
): BuildingLightSource[] {
  if (buildings === buildingLightRef) return buildingLightSources;
  buildingLightRef = buildings;
  const out: BuildingLightSource[] = [];
  let sig = '';
  for (const b of buildings) {
    const light = buildingLight(b);
    if (light) {
      out.push({ x: b.x, y: b.y, intensity: light.intensity, radius: light.radius });
      sig += b.x + ',' + b.y + ',' + light.radius + ',' + light.intensity + ';';
    }
  }
  buildingLightSources = out;
  if (sig !== buildingLightSig) {
    buildingLightSig = sig;
    buildingLightVersion++;
  }
  return out;
}

function scanGroveLight(worldMap: WorldTile[][]): GroveLight[] {
  const out: GroveLight[] = [];
  for (let y = 0; y < worldMap.length; y++) {
    const row = worldMap[y];
    for (let x = 0; x < row.length; x++) {
      const res = row[x]?.resources;
      if (!res) continue;
      for (const id in res) {
        if ((res[id] ?? 0) <= 0) continue;
        const glow = resourceObjectService.getById(id)?.glow;
        if (glow && glow.radius > 0)
          out.push({ x, y, intensity: glow.intensity, radius: glow.radius });
      }
    }
  }
  return out;
}

let pointLightField: Float32Array | null = null;
let pointLightW = 0;
let pointLightH = 0;
let fieldBuildVer = -1;
let fieldGroveVer = -1;

function splatSource(
  W: number,
  H: number,
  sx: number,
  sy: number,
  intensity: number,
  radius: number
): void {
  const field = pointLightField!;
  const r = Math.ceil(radius);
  const minX = Math.max(0, sx - r);
  const maxX = Math.min(W - 1, sx + r);
  const minY = Math.max(0, sy - r);
  const maxY = Math.min(H - 1, sy + r);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - sx;
      const dy = y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        const falloff = (1 - dist / radius) * (1 - dist / radius);
        field[y * W + x] += intensity * falloff;
      }
    }
  }
}

function rebuildPointLightField(
  W: number,
  H: number,
  emitters: BuildingLightSource[],
  groves: GroveLight[]
): void {
  if (!pointLightField || pointLightW !== W || pointLightH !== H) {
    pointLightField = new Float32Array(W * H);
    pointLightW = W;
    pointLightH = H;
  } else {
    pointLightField.fill(0);
  }
  for (const e of emitters) splatSource(W, H, e.x, e.y, e.intensity, e.radius);
  for (const g of groves) splatSource(W, H, g.x, g.y, g.intensity, g.radius);
}

export function computeTileLightLevel(
  turn: number,
  buildings: { type: string; status: string; lit?: boolean; x: number; y: number }[],
  x: number,
  y: number,
  worldMap?: WorldTile[][]
): number {
  const ambient = getAmbientLight(turn);
  const emitters = litBuildingSources(buildings);
  if (worldMap && worldMap !== groveLightMapRef) {
    groveLightMapRef = worldMap;
    groveLightSources = scanGroveLight(worldMap);
    groveVersion++;
  }
  const W = worldMap?.[0]?.length ?? 0;
  const H = worldMap?.length ?? 0;
  if (W === 0 || H === 0) {
    let point = 0;
    for (let i = 0; i < emitters.length; i++) {
      const e = emitters[i];
      const dist = Math.sqrt((x - e.x) ** 2 + (y - e.y) ** 2);
      if (dist < e.radius) point += e.intensity * (1 - dist / e.radius) ** 2;
    }
    return Math.min(1, Math.max(0.1, ambient + point));
  }
  if (
    buildingLightVersion !== fieldBuildVer ||
    groveVersion !== fieldGroveVer ||
    pointLightW !== W ||
    pointLightH !== H
  ) {
    rebuildPointLightField(W, H, emitters, groveLightSources);
    fieldBuildVer = buildingLightVersion;
    fieldGroveVer = groveVersion;
  }
  const point = x >= 0 && x < W && y >= 0 && y < H ? pointLightField![y * W + x] : 0;
  return Math.min(1, Math.max(0.1, ambient + point));
}

export interface SeasonDef {
  tempOffset: number;
  regrowthMultiplier: number;
  precipitation: number;
  tint: [number, number, number];
}

interface SeasonFileEntry extends SeasonDef {
  id: Season;
  label: string;
}
const SEASON_FILE = seasonsData as unknown as { daysPerSeason: number; seasons: SeasonFileEntry[] };

export const DAYS_PER_SEASON = SEASON_FILE.daysPerSeason;
const SEASON_ORDER: Season[] = SEASON_FILE.seasons.map((s) => s.id);
export const SEASON_IDS: Season[] = SEASON_ORDER;
export const SEASONS: Record<Season, SeasonDef> = Object.fromEntries(
  SEASON_FILE.seasons.map((s) => [s.id, s])
) as unknown as Record<Season, SeasonDef>;
export const SEASON_LABELS: Record<Season, string> = Object.fromEntries(
  SEASON_FILE.seasons.map((s) => [s.id, s.label])
) as unknown as Record<Season, string>;

const DEFAULT_BIOME_TEMP = 10;

export function dayIndexForTurn(turn: number): number {
  return Math.floor(turn / TICKS_PER_DAY);
}

export function seasonForTurn(turn: number): { season: Season; seasonDay: number } {
  const day = dayIndexForTurn(turn);
  return {
    season: SEASON_ORDER[Math.floor(day / DAYS_PER_SEASON) % SEASON_ORDER.length],
    seasonDay: day % DAYS_PER_SEASON
  };
}

export const LUNAR_CYCLE_DAYS = 30;
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
const MOON_PHASE_STARTS = [0, 2, 7, 10, 14, 17, 22, 25];

export function moonPhaseIndex(dayIndex: number): number {
  const cycleDay = ((dayIndex % LUNAR_CYCLE_DAYS) + LUNAR_CYCLE_DAYS) % LUNAR_CYCLE_DAYS;
  for (let i = MOON_PHASE_STARTS.length - 1; i >= 0; i--)
    if (cycleDay >= MOON_PHASE_STARTS[i]) return i;
  return 0;
}
export function moonPhaseName(dayIndex: number): (typeof MOON_PHASES)[number] {
  return MOON_PHASES[moonPhaseIndex(dayIndex)];
}
export function isFullMoon(dayIndex: number): boolean {
  return moonPhaseIndex(dayIndex) === 4;
}

export function celestialMoodEffect(turn: number): string | null {
  const tod = getTimeOfDay(turn);
  if (tod >= 0.24 && tod <= 0.33) return 'celestial_dawn';
  if (tod >= 0.82 && tod <= 0.91) return 'celestial_dusk';
  if ((tod > 0.91 || tod < 0.21) && isFullMoon(dayIndexForTurn(turn))) return 'celestial_full_moon';
  return null;
}

export const SUNRISE_HOUR = 6;
export const SUNSET_HOUR = 19;
export function isSunUp(hour: number): boolean {
  return hour >= SUNRISE_HOUR && hour < SUNSET_HOUR;
}
export function sunPhaseName(hour: number): string | undefined {
  if (!isSunUp(hour)) return undefined;
  if (hour <= 7) return 'Sunrise';
  if (hour <= 10) return 'Rising Sun';
  if (hour <= 13) return 'High Sun';
  if (hour <= 16) return 'Sinking Sun';
  return 'Sunset';
}

export function seasonRegrowthMultiplier(season: Season | undefined): number {
  return season ? SEASONS[season].regrowthMultiplier : 1;
}

export function biomeBaseTemp(terrainType: string): number {
  return BIOMES[terrainType]?.baseTemp ?? DEFAULT_BIOME_TEMP;
}

export function seasonBakedTemp(terrainType: string, season: Season | undefined): number {
  return biomeBaseTemp(terrainType) + (season ? SEASONS[season].tempOffset : 0);
}

export function recomputeWorldTemperature(worldMap: WorldTile[][], season: Season): number {
  const offset = SEASONS[season].tempOffset;
  let walkSum = 0;
  let walkCount = 0;
  let staleBefore = 0;
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
  vlog(
    'system',
    0,
    () =>
      `TEMP-BAKE season=${season} offset=${offset} walkable=${walkCount} staleBefore=${staleBefore} ` +
      `after[min=${minAfter} max=${maxAfter}]`
  );
  return walkCount > 0 ? walkSum / walkCount : offset;
}

const DIURNAL_AMPLITUDE = 7;
const DIURNAL_SEASON_SCALE: Record<Season, number> = {
  spring: 1.0,
  summer: 1.2,
  autumn: 1.0,
  winter: 0.6
};

const DIURNAL_KEYFRAMES: { t: number; v: number }[] = [
  { t: 0.0, v: -0.55 },
  { t: 0.21, v: -1.0 },
  { t: 0.33, v: -0.4 },
  { t: 0.5, v: 0.45 },
  { t: 0.625, v: 1.0 },
  { t: 0.75, v: 0.5 },
  { t: 0.875, v: -0.1 },
  { t: 1.0, v: -0.55 }
];

function diurnalCurve(t: number): number {
  for (let i = 0; i < DIURNAL_KEYFRAMES.length - 1; i++) {
    const a = DIURNAL_KEYFRAMES[i];
    const b = DIURNAL_KEYFRAMES[i + 1];
    if (t >= a.t && t <= b.t) return lerp(a.v, b.v, (t - a.t) / (b.t - a.t));
  }
  return DIURNAL_KEYFRAMES[DIURNAL_KEYFRAMES.length - 1].v;
}

export function diurnalTempDelta(turn: number, season: Season | undefined): number {
  const scale = season ? DIURNAL_SEASON_SCALE[season] : 1;
  return diurnalCurve(getTimeOfDay(turn)) * DIURNAL_AMPLITUDE * scale;
}

export interface WeatherEffects {
  tempDelta: number;
  fatigueMul: number;
  hungerMul: number;
  moveCostMul: number;
  mood: string;
}

export type WeatherOverlayKind =
  | 'none'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'leaves'
  | 'dust'
  | 'snowdust'
  | 'foggy_rain';

interface WeatherTransition {
  to: string;
  chance?: number;
  seasonPrecip?: boolean;
  seasons?: Season[];
  phase?: 'rising' | 'falling';
}
interface WeatherDef extends WeatherEffects {
  id: string;
  label: string;
  overlay: WeatherOverlayKind;
  heavy?: boolean;
  fallSpeed?: number;
  density?: number;
  panelSaturation?: number;
  windStrength?: number;
  sightMul?: number;
  particleColor?: [number, number, number];
  intensity: number;
  moistureBonus: number;
  tint: [number, number, number];
  severity: 'info' | 'warning';
}
interface ChainState {
  id: string;
  transitions: WeatherTransition[];
}
interface ChainDef {
  default: string;
  durationRange: [number, number];
  states: ChainState[];
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

const WET_PRECIP = new Set(['drizzle', 'rain', 'heavy_rain']);

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

const FREEZE_SNOW_BELOW = -1;
const FREEZE_RAIN_ABOVE = 1;
export function weatherFreezing(globalTemp: number, prevFreezing: boolean): boolean {
  if (globalTemp <= FREEZE_SNOW_BELOW) return true;
  if (globalTemp >= FREEZE_RAIN_ABOVE) return false;
  return prevFreezing;
}

function axesFromType(type: string | undefined): { precip: string; windLevel: string } {
  if (type && /_windy$/.test(type)) {
    return (
      REVERSE_GRID[SEASON_WINDY_CELL] ?? { precip: DEFAULT_PRECIP, windLevel: DEFAULT_WIND_LEVEL }
    );
  }
  return (type && REVERSE_GRID[type]) || { precip: DEFAULT_PRECIP, windLevel: DEFAULT_WIND_LEVEL };
}

function precipPhaseFor(precip: string, prev: 'rising' | 'falling'): 'rising' | 'falling' {
  if (precip === DEFAULT_PRECIP) return 'rising';
  if (precip === PRECIP_LADDER[PRECIP_LADDER.length - 1]) return 'falling';
  return prev;
}

function ladderDown(ladder: string[], id: string): string {
  const i = ladder.indexOf(id);
  return i > 0 ? ladder[i - 1] : id;
}

function weatherDef(type?: string): WeatherDef {
  return WEATHER[type ?? DEFAULT_WEATHER] ?? WEATHER[DEFAULT_WEATHER];
}

export const WEATHER_IDS: string[] = WEATHER_FILE.types.map((t) => t.id);

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

export const WEATHER_LABELS: Record<string, string> = Object.fromEntries(
  WEATHER_FILE.types.map((t) => [t.id, t.label])
);
export function weatherLabel(type?: string): string {
  return weatherDef(type).label;
}

export function weatherOverlayKind(type?: string): WeatherOverlayKind {
  return weatherDef(type).overlay;
}

export function weatherWindStrength(type?: string): number {
  const def = weatherDef(type);
  return def.windStrength ?? (def.heavy ? 0.6 : 0.2);
}

export function ambientWind(weather?: WeatherState): number {
  return Math.max(0, Math.min(1, Math.max(weatherWindStrength(weather?.type), weather?.wind ?? 0)));
}

export const WIND_DISPLAY_ONSET = 0.2;
export const WIND_DEGREE_WORDS = ['slightly', 'somewhat', 'fairly', 'very', 'extremely'] as const;
export function windDegreeWord(wind: number): string {
  if (wind < WIND_DISPLAY_ONSET) return '';
  return WIND_DEGREE_WORDS[Math.min(4, Math.floor((wind - WIND_DISPLAY_ONSET) / 0.16))];
}

export function weatherSightMul(type?: string): number {
  return weatherDef(type).sightMul ?? 1;
}

export function weatherParticleColor(type?: string): [number, number, number] | null {
  return weatherDef(type).particleColor ?? null;
}

export function weatherPanelSaturation(type?: string): number {
  return weatherDef(type).panelSaturation ?? 1;
}

const BLEAK_PANEL_SAT = 0.7;

export function effectivePanelSaturation(
  season: Season | undefined,
  weather: WeatherState | undefined
): number {
  const base = weatherPanelSaturation(weather?.type);
  return season === 'winter' ? Math.min(base, BLEAK_PANEL_SAT) : base;
}
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

export function weatherFallSpeed(type?: string): number {
  const def = weatherDef(type);
  return def.fallSpeed ?? FALL_SPEED_DEFAULT[def.overlay] ?? 680;
}

export function weatherDensity(type?: string): number {
  const def = weatherDef(type);
  return def.density ?? DENSITY_DEFAULT[def.overlay] ?? 160;
}

export function weatherChronicleSeverity(type: WeatherType): 'info' | 'warning' {
  return weatherDef(type).severity;
}

const EXPOSURE_PER_DEGREE = 5;

export function coldExposure(temp: number, comfortMin: number): number {
  return Math.max(0, Math.min(100, (comfortMin - temp) * EXPOSURE_PER_DEGREE));
}

export function heatExposure(temp: number, comfortMax: number): number {
  return Math.max(0, Math.min(100, (temp - comfortMax) * EXPOSURE_PER_DEGREE));
}

const WARMTH_SCALE = 60;
const WARMTH_REFERENCE_HEAT = 2;
const NEUTRAL_TEMP = 15;

export interface ThermalSample {
  warmth: number;
  insulation: number;
  weatherProtection: number;
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

function buildingShelter(b: {
  type: string;
  status: string;
}): { insulation: number; weatherProtection: number } | null {
  if (b.status !== 'complete') return null;
  const eff = buildingService.getBuildingById(b.type)?.effects;
  if (!eff?.roof) return null;
  return { insulation: eff.thermalInsulation ?? 0, weatherProtection: eff.weatherProtection ?? 0 };
}

let fireSources: FireSource[] = [];
let shelterTiles = new Map<string, { insulation: number; weatherProtection: number }>();

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

export function isRoofedTile(x: number, y: number): boolean {
  return shelterTiles.has(y + ',' + x);
}

const GROVE_SCAN_RADIUS = 8;

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

export function effectiveTemperature(
  baseTileTemp: number,
  weatherTempDelta: number,
  thermal: ThermalSample
): number {
  const outdoor = baseTileTemp + weatherTempDelta * (1 - thermal.weatherProtection);
  const insulated = NEUTRAL_TEMP + (outdoor - NEUTRAL_TEMP) * (1 - thermal.insulation);
  return insulated + thermal.warmth;
}

const FERMENT_TEMP_FLOOR = 4;
const FERMENT_TEMP_OPT_LO = 15;
const FERMENT_TEMP_OPT_HI = 28;
const FERMENT_TEMP_CEIL = 40;

export function fermentTempRate(temp: number): number {
  if (temp <= FERMENT_TEMP_FLOOR || temp >= FERMENT_TEMP_CEIL) return 0;
  if (temp < FERMENT_TEMP_OPT_LO)
    return (temp - FERMENT_TEMP_FLOOR) / (FERMENT_TEMP_OPT_LO - FERMENT_TEMP_FLOOR);
  if (temp > FERMENT_TEMP_OPT_HI)
    return (FERMENT_TEMP_CEIL - temp) / (FERMENT_TEMP_CEIL - FERMENT_TEMP_OPT_HI);
  return 1;
}

const DEFAULT_BIOME_MOISTURE = 35;

export function biomeBaseMoisture(terrainType: string): number {
  return BIOMES[terrainType]?.baseMoisture ?? DEFAULT_BIOME_MOISTURE;
}

function weatherMoistureBonus(weather?: WeatherState): number {
  return weatherDef(weather?.type).moistureBonus;
}

const WATER_EDGE_MOISTURE = 95;
const MOISTURE_FALLOFF_TILES = 9;

export function baseMoistureFromWater(biomeMoisture: number, distanceToWater: number): number {
  const fromWater = WATER_EDGE_MOISTURE * Math.exp(-distanceToWater / MOISTURE_FALLOFF_TILES);
  return Math.max(0, Math.min(100, Math.max(biomeMoisture, fromWater)));
}

export function tileWetness(
  baseMoisture: number,
  weather?: WeatherState,
  thermal: ThermalSample = NO_THERMAL,
  ice = 0
): number {
  const fromWeather = weatherMoistureBonus(weather) * (1 - thermal.weatherProtection);
  const wet = Math.max(0, Math.min(100, baseMoisture + fromWeather));
  return ice > 0 ? wet * (1 - Math.min(100, ice) / 100) : wet;
}

const HOUR_SECONDS = TURNS_PER_DAY / 24;
export const WET_TILE_THRESHOLD = 50;
const WET_HEAVY_THRESHOLD = 80;
const WET_SOAK_HOURS = 1;
const WET_SOAK_HOURS_HEAVY = 0.5;
const WET_DRY_HOURS_MAX = 5;
const WET_DRY_HOURS_MIN = 1;

export function accrueWetness(
  current: number,
  tileWet: number,
  dt: number,
  resistance: number,
  drySpeed01: number
): number {
  if (tileWet >= 100) return 100;
  if (tileWet > WET_TILE_THRESHOLD) {
    const soakHours = tileWet >= WET_HEAVY_THRESHOLD ? WET_SOAK_HOURS_HEAVY : WET_SOAK_HOURS;
    const res = Math.min(0.9, Math.max(0, resistance));
    return Math.min(100, current + (100 / (soakHours * HOUR_SECONDS)) * (1 - res) * dt);
  }
  if (current > 0) {
    const dryHours = WET_DRY_HOURS_MAX - (WET_DRY_HOURS_MAX - WET_DRY_HOURS_MIN) * drySpeed01;
    return Math.max(0, current - (100 / (dryHours * HOUR_SECONDS)) * dt);
  }
  return current;
}

export function creatureExposureAt(
  x: number,
  y: number,
  weather: WeatherState | undefined,
  worldMap: WorldTile[][],
  baseMoisture: number
): { wind: number; wetness: number } {
  return {
    wind: effectiveWindAt(x, y, weather, NO_THERMAL, worldMap),
    wetness: tileWetness(baseMoisture, weather, NO_THERMAL, worldMap[y]?.[x]?.ice ?? 0)
  };
}

export function tileTemperature(
  terrainType: string,
  season: Season | undefined,
  turn: number,
  weather?: WeatherState,
  thermal: ThermalSample = NO_THERMAL
): number {
  const base = seasonBakedTemp(terrainType, season);
  const airDelta = weatherEffects(weather).tempDelta + diurnalTempDelta(turn, season);
  return effectiveTemperature(base, airDelta, thermal);
}

function snowWetFactor(wetness: number): number {
  return 0.4 + (Math.max(0, Math.min(100, wetness)) / 100) * 1.4;
}
const SNOW_ACCRUAL_PER_HOUR = 1.75;
const SNOW_NATURAL_MAX = 50;
const SNOW_MELT_PER_HOUR = 2;
const SNOW_RENDER_STEP = 5;

const ICE_FREEZE_PER_HOUR = 3;
const ICE_MELT_PER_HOUR = 4;
const ICE_RENDER_STEP = 5;
const ICE_FULL_FREEZE_AT = 8;
export const ICE_WATER_MOVE_COST = 2;
export const ICE_VISIBLE = 8;
export const ICE_WALKABLE = 60;

function isSnowingWeather(weather?: WeatherState): boolean {
  const o = weatherOverlayKind(weather?.type);
  return o === 'snow' || o === 'snowdust';
}

export function accumulateSnow(
  worldMap: WorldTile[][],
  weather: WeatherState | undefined,
  season: Season | undefined,
  turn: number,
  hours = 1,
  patchWalkable?: (x: number, y: number, walkable: boolean) => void,
  startRow = 0,
  endRow = worldMap.length
): void {
  const snowing = isSnowingWeather(weather);
  const wDelta = weatherEffects(weather).tempDelta + diurnalTempDelta(turn, season);
  for (let y = startRow; y < endRow; y++) {
    const row = worldMap[y];
    for (const tile of row) {
      const baseTemp = tile.temperature ?? seasonBakedTemp(tile.terrainType, season);
      const temp = baseTemp + wDelta;

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
          markTileDirty(tile.y, tile.x, tile, 'snow');
        }
      }

      const prevIce = tile.ice ?? 0;
      const canFreeze = tile.walkable || tile.type === 'water';
      if (!canFreeze) {
        if (prevIce > 0) {
          tile.ice = 0;
          markTileDirty(tile.y, tile.x, tile, 'snow');
        }
        continue;
      }
      let nextIce = prevIce;
      if (temp < 0) {
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
          markTileDirty(tile.y, tile.x, tile, 'snow');
        }
      }
    }
  }
}

const DEFAULT_WIND = 0.3;
const WIND_DRIFT = 0.18;

const DEFAULT_WIND_DIR = 0;
const WIND_DIR_TURN_CHANCE = 0.4;
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
const WIND_SHADOW_LEN = 4;

export function windVector(dir?: number): { dx: number; dy: number } {
  const d = WIND_DIRS[(((dir ?? DEFAULT_WIND_DIR) % 8) + 8) % 8];
  return { dx: d.dx, dy: d.dy };
}
export function windDirLabel(dir?: number): string {
  return WIND_DIRS[(((dir ?? DEFAULT_WIND_DIR) % 8) + 8) % 8].label;
}

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
    if (!tile) break;
    if (tile.walkable === false) return 1 - (i - 1) / maxTiles;
  }
  return 0;
}

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
  return state?.id;
}

export function advanceWeatherForDay(
  weather: WeatherState,
  season: Season,
  rng: SeededRng,
  freezing = false
): WeatherState {
  let windDir = weather.windDir ?? DEFAULT_WIND_DIR;
  if (rng.chance(WIND_DIR_TURN_CHANCE)) windDir = (windDir + (rng.chance(0.5) ? 1 : 7)) % 8;

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

const WHITE: [number, number, number] = [1, 1, 1];

function weatherTint(weather?: WeatherState): [number, number, number] {
  return weatherDef(weather?.type).tint;
}

export function getEnvironmentTint(
  season: Season | undefined,
  weather: WeatherState | undefined
): [number, number, number] {
  const s = season ? SEASONS[season].tint : WHITE;
  const w = weatherTint(weather);
  return [s[0] * w[0], s[1] * w[1], s[2] * w[2]];
}

const WINTER_TINT_DESAT = 0.82;

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
  ambientTurn(gs: { turn: number; _debugTimeOfDay?: number }): number {
    return gs._debugTimeOfDay != null ? Math.round(gs._debugTimeOfDay * TICKS_PER_DAY) : gs.turn;
  }

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

  getSeason(turn: number): { season: Season; seasonDay: number } {
    return seasonForTurn(turn);
  }

  getWeatherEffects(weather?: WeatherState): WeatherEffects {
    return weatherEffects(weather);
  }

  getEnvironmentTint(
    season: Season | undefined,
    weather: WeatherState | undefined
  ): [number, number, number] {
    return getEnvironmentTint(season, weather);
  }

  getMapAmbientTint(
    baseTint: [number, number, number],
    season: Season | undefined,
    weather: WeatherState | undefined
  ): [number, number, number] {
    return getMapAmbientTint(baseTint, season, weather);
  }
}

export const environmentService = new EnvironmentServiceImpl();
