/* filepath: src/lib/game/services/EnvironmentService.ts */
/**
 * EnvironmentService — Day/Night ambient light & tint (Phase A)
 *
 * Computes per-turn ambient brightness and colour tint driven by the
 * sinusoidal day/night curve specified in LIVING-WORLD.md §Subsystem 1.
 *
 * No mutable state — all methods are pure functions of turn (and, for seasons/weather,
 * of the season/weather scalars in GameState). Phase B (seasons + temperature) and
 * Phase C (weather) live in the lower half of this file.
 */

import { TICKS_PER_SECOND } from '../core/time';
import { markTileDirty } from '../core/tileDeltas';
import { buildingLight } from './LightingService';
import { buildingService } from './BuildingService';
import { BIOMES } from '../core/Terrains';
import seasonsData from '../database/seasons.jsonc';
import weatherData from '../database/weather.jsonc';
import type { SeededRng } from '../core/rng';
import type { Season, WeatherState, WeatherType, WorldTile, PlacedBuilding } from '../core/types';

// In-game seconds per day. The simulation `turn` counts ticks, so a full day is
// TURNS_PER_DAY × TICKS_PER_SECOND ticks long.
export const TURNS_PER_DAY = 300;
const TICKS_PER_DAY = TURNS_PER_DAY * TICKS_PER_SECOND;

/**
 * Map turn (ticks) → fractional time-of-day in [0, 1).
 * 0.0 = midnight, 0.25 = 06:00, 0.5 = noon, 0.75 = 18:00.
 */
export function getTimeOfDay(turn: number): number {
  return (turn % TICKS_PER_DAY) / TICKS_PER_DAY;
}

/**
 * Ambient brightness in [0.15, 1.0], interpolated from AMBIENT_KEYFRAMES.
 *
 * The curve deliberately keeps full daylight through the afternoon and only
 * begins to fall off around 19:00, reaching night levels near 22:00 — so the
 * world does not darken too early. Midnight floors at 0.15 so glyphs stay
 * readable. Both the WebGL map and the HTML panels read from this single
 * value, keeping their brightness in lock-step.
 */
export function getAmbientLight(turn: number): number {
  const { a, b, f } = resolveKeyframes(getTimeOfDay(turn));
  return lerp(a.light, b.light, f);
}

/**
 * Unified ambient keyframes — t = timeOfDay (0.0 = midnight, 0.5 = noon).
 * t=0.00 and t=1.00 carry the same values so the day wraps seamlessly.
 *
 * `light` — scalar brightness [0.15, 1.0]; drives BOTH the WebGL ambient and
 *           the panel brightness (panels remap it with a higher floor), so the
 *           map and the sidebars dim and brighten together.
 * `tint`  — RGB multiplier used by the WebGL fragment shader (can go cool/blue).
 * `cssSp` — CSS sepia() for panel elements (0 = unchanged, 1 = full amber-brown).
 * `cssHr` — CSS hue-rotate() in degrees for panel elements.
 *
 * CSS params intentionally stay in the WARM range (hue-rotate ≤ 0°, i.e. shifting
 * amber toward orange/red) so transitions NEVER pass through pink on the hue wheel.
 * Night is handled with brightness-only — panels stay brownish, just dimmer.
 */
interface AmbientKeyframe {
  t: number;
  /** Scalar brightness [0.15, 1.0] — drives WebGL u_ambient AND panel dimming. */
  light: number;
  /**
   * NORMALISED colour (brightest channel ≈ 1.0) — carries HUE only, never
   * brightness. The shader multiplies it by `light`, so brightness comes
   * solely from `light`; keeping tint normalised means the brightest channel
   * never falls below `light` (0.15 floor) and glyphs stay visible at night.
   */
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

/** Find the two surrounding keyframes and return an interpolation factor [0,1]. */
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

/**
 * Ambient colour tint as an RGB triple used by the WebGL fragment shader.
 * Linearly interpolated between keyframes — no hard phase boundaries.
 */
export function getAmbientTint(turn: number): [number, number, number] {
  const { a, b, f } = resolveKeyframes(getTimeOfDay(turn));
  return lerpTint(a.tint, b.tint, f);
}

/**
 * Per-channel RGB multiplier for HTML panels.
 *
 * Applied via an SVG `feColorMatrix` (see +page.svelte) so panels are tinted by
 * the same hue the map uses — cool blue at night, warm amber at dawn/dusk — by
 * multiplying each colour channel directly. This avoids the pink artifact CSS
 * `hue-rotate` produces when rotating amber toward blue.
 *
 * Brightness and hue are computed SEPARATELY so the colour stays visible even
 * when the scene is dim. If hue were multiplied by `light`, night would crush
 * all channels toward the floor and wash the blue out — which is exactly what
 * looked "too subtle". Instead:
 *   - `bright` dims with `light` but floors at PANEL_BRIGHT_FLOOR for legibility.
 *   - `sat` mixes white→tint at a constant strength, so the hue reads clearly
 *     at any brightness. PANEL_SAT tunes how strong the tint is.
 */
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

/**
 * Compute total light (ambient + point sources) at a tile centre.
 * Mirrors the renderer's LightingService.sample() logic so UI numbers match
 * what the player sees on the map.
 */
export function computeTileLightLevel(
  turn: number,
  buildings: { type: string; status: string; lit?: boolean; x: number; y: number }[],
  x: number,
  y: number
): number {
  const ambient = getAmbientLight(turn);
  let point = 0;
  for (const b of buildings) {
    // Same data-driven emitter resolution the renderer uses, so UI light numbers match the map.
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
// Phase B — Seasons & Temperature (SEASONS_WEATHER Subsystems 2 & 3)
// ─────────────────────────────────────────────────────────────────────────────

export interface SeasonDef {
  /** °C added to each tile's biome base temperature for the whole season. */
  tempOffset: number;
  /** Multiplier applied to resource regrowth cooldowns (×<1 = faster regrowth). */
  regrowthMultiplier: number;
  /** Per-day chance the sky turns to precipitation (rain in warm seasons, snow in winter). */
  precipitation: number;
  /** Normalised RGB hue multiplied into the ambient tint (Subsystem 2 palette). */
  tint: [number, number, number];
}

// Data-driven (database/seasons.jsonc): the year cycle, its length, and each season's parameters.
interface SeasonFileEntry extends SeasonDef {
  id: Season;
  label: string;
}
const SEASON_FILE = seasonsData as unknown as { daysPerSeason: number; seasons: SeasonFileEntry[] };

/** Days in one season. One full year = DAYS_PER_SEASON × (number of seasons) in-game days. */
export const DAYS_PER_SEASON = SEASON_FILE.daysPerSeason;
/** The year cycle order (from seasons.jsonc). */
const SEASON_ORDER: Season[] = SEASON_FILE.seasons.map((s) => s.id);
/** The year cycle order, exported for the debug menu / pickers. */
export const SEASON_IDS: Season[] = SEASON_ORDER;
export const SEASONS: Record<Season, SeasonDef> = Object.fromEntries(
  SEASON_FILE.seasons.map((s) => [s.id, s])
) as unknown as Record<Season, SeasonDef>;
/** Human-readable season names (Chronicle / HUD), from seasons.jsonc. */
export const SEASON_LABELS: Record<Season, string> = Object.fromEntries(
  SEASON_FILE.seasons.map((s) => [s.id, s.label])
) as unknown as Record<Season, string>;

/** Fallback biome temperature for tiles whose biome carries no `baseTemp`. */
const DEFAULT_BIOME_TEMP = 12;

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

/**
 * Seasonal regrowth-rate multiplier (×1.2 spring … ×0.3 winter). Resource regrowth *cooldowns*
 * are DIVIDED by this when set, so a higher rate ⇒ a shorter cooldown ⇒ faster regrowth.
 */
export function seasonRegrowthMultiplier(season: Season | undefined): number {
  return season ? SEASONS[season].regrowthMultiplier : 1;
}

/** Biome baseline temperature (°C, conceptual) for a tile's terrainType. */
export function biomeBaseTemp(terrainType: string): number {
  return BIOMES[terrainType]?.baseTemp ?? DEFAULT_BIOME_TEMP;
}

/**
 * Recompute every tile's temperature IN PLACE for the given season (PERF-1: never
 * `worldMap.map()`, never flip the worldMap ref → no terrain rebuild / re-clone).
 *
 * `temperature` is a worker-only field (dropped from the slim worldMapDelta — PERF-2),
 * so this deliberately does NOT call `markTileDirty`: there is nothing for the renderer
 * to receive. The need-rate hot path (PawnService) reads the cached value; the live
 * weather delta is added there, not baked here, so weather changes never touch 38k tiles.
 */
export function recomputeWorldTemperature(worldMap: WorldTile[][], season: Season): number {
  const offset = SEASONS[season].tempOffset;
  let sum = 0;
  let count = 0;
  for (const row of worldMap) {
    for (const tile of row) {
      const temp = biomeBaseTemp(tile.terrainType) + offset;
      tile.temperature = temp;
      sum += temp;
      count++;
    }
  }
  // Average baked tile temperature (biome + season, no weather) — the topbar adds the weather delta.
  return count > 0 ? sum / count : offset;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase C — Weather (SEASONS_WEATHER Subsystem 4)
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

// Data-driven (database/weather.jsonc): every weather id + its effects, visuals, and transitions.
interface WeatherTransition {
  to: string;
  /** Fixed per-roll weight (a probability before normalisation; the leftover weight = "stays put"). */
  chance?: number;
  /** Use the current season's `precipitation` as the weight (clear → rain/snow). */
  seasonPrecip?: boolean;
  /** Gate this transition to specific seasons. */
  seasons?: Season[];
  /** Scale this branch's weight by ambient wind (high wind → far more likely; e.g. rain→storm). */
  windScaled?: boolean;
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
  /** Optional per-type spell duration; falls back to the global durationRange. */
  durationRange?: [number, number];
  transitions: WeatherTransition[];
}
const WEATHER_FILE = weatherData as unknown as {
  durationRange: [number, number];
  default: string;
  types: WeatherDef[];
};
const DEFAULT_WEATHER = WEATHER_FILE.default;
const DURATION_RANGE = WEATHER_FILE.durationRange;
const WEATHER: Record<string, WeatherDef> = Object.fromEntries(
  WEATHER_FILE.types.map((t) => [t.id, t])
);

/** Resolve a weather def by id, falling back to the default (clear) for unknown/undefined. */
function weatherDef(type?: string): WeatherDef {
  return WEATHER[type ?? DEFAULT_WEATHER] ?? WEATHER[DEFAULT_WEATHER];
}

/** All weather ids in declaration order (for the debug menu / pickers). */
export const WEATHER_IDS: string[] = WEATHER_FILE.types.map((t) => t.id);

/** Build a sticky WeatherState for a given type (debug): the spell runs effectively forever so the
 *  daily Markov chain won't re-roll it until the player changes it again. Ambient wind seeds from the
 *  type's own `windStrength` so a debug storm immediately looks/feels windy. */
export function makeWeather(type: string): WeatherState {
  const def = weatherDef(type);
  return {
    type: def.id,
    intensity: def.intensity,
    turnsRemaining: Number.MAX_SAFE_INTEGER,
    wind: def.windStrength ?? DEFAULT_WIND,
    windDir: DEFAULT_WIND_DIR
  };
}

/** Gameplay effects for a weather state (defaults to the fallback weather when undefined). */
export function weatherEffects(weather?: WeatherState): WeatherEffects {
  return weatherDef(weather?.type);
}

/** Human-readable weather names (Chronicle / HUD), keyed by id — from weather.jsonc. */
export const WEATHER_LABELS: Record<string, string> = Object.fromEntries(
  WEATHER_FILE.types.map((t) => [t.id, t.label])
);
/** Display label for a weather id (falls back through the default). */
export function weatherLabel(type?: string): string {
  return weatherDef(type).label;
}

/** Particle/haze overlay the WeatherCanvas should draw for a weather id (`none` = no animation). */
export function weatherOverlayKind(type?: string): WeatherOverlayKind {
  return weatherDef(type).overlay;
}

/** Inherent windiness 0–1 for a weather id (default by overlay kind). The WeatherCanvas combines this
 *  with the live ambient `wind` to set the overlay slant. */
export function weatherWindStrength(type?: string): number {
  const def = weatherDef(type);
  return def.windStrength ?? (def.heavy ? 0.6 : 0.2);
}

/**
 * Effective AMBIENT wind 0–1 for a weather state — the single source of truth shared by the visual
 * overlay slant (WeatherCanvas) and gameplay (windchill). The stronger of the weather type's inherent
 * `windStrength` and the live drifting `wind` scalar, so a debug gale feels windy immediately even
 * before the ambient walk catches up. This is the OPEN-FIELD value; shelter (roof/lee) is applied on
 * top by `effectiveWindAt`.
 */
export function ambientWind(weather?: WeatherState): number {
  return Math.max(0, Math.min(1, Math.max(weatherWindStrength(weather?.type), weather?.wind ?? 0)));
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

/**
 * Effective side-panel saturation. Each weather carries its own `panelSaturation` (rain/storm/fog
 * bleak, the mild windy variants barely so) — that's the daytime look. WINTER additionally clamps to
 * a blizzard-level wash so the whole cold season feels bleak regardless of weather. Non-winter weather
 * just uses its own value, so a light breeze barely desaturates while a storm still does.
 */
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

/** Overlay particle fall speed (px/sec) for a weather id — from weather.jsonc, default by overlay kind. */
export function weatherFallSpeed(type?: string): number {
  const def = weatherDef(type);
  return def.fallSpeed ?? FALL_SPEED_DEFAULT[def.overlay] ?? 680;
}

/** Overlay particle count per megapixel for a weather id — from weather.jsonc, default by overlay kind. */
export function weatherDensity(type?: string): number {
  const def = weatherDef(type);
  return def.density ?? DENSITY_DEFAULT[def.overlay] ?? 160;
}

/** Chronicle severity for a weather onset (from weather.jsonc). */
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
// Thermal field — fire warmth + roof shelter (SEASONS_WEATHER)
// ─────────────────────────────────────────────────────────────────────────────
//
// Fires (`effects.warmth`) radiate heat to nearby tiles; roofs (`effects.roof`) shelter the tiles
// under them — their `thermalInsulation` holds the interior near a neutral baseline and their
// `weatherProtection` keeps weather (temperature delta + rain) out. Effective temperature at a pawn:
//
//   outdoor   = tileTemp + weatherDelta·(1 − weatherProtection)   // roof blocks the weather swing
//   insulated = NEUTRAL + (outdoor − NEUTRAL)·(1 − insulation)     // roof holds interior near neutral
//   effective = insulated + Σ fire warmth                          // fires heat the interior on top
//
// The worker rebuilds a lightweight field once per tick (rebuildThermalField) so the per-pawn query
// (thermalAt) is O(fires)+O(1) — see GameEngineImpl.processEnvironment. The renderer/HUD, which has
// no field, computes one tile on demand from the buildings array (computeThermalAt).

/** °C produced at a fire's centre per unit of `effects.warmth` (0–1). */
const WARMTH_SCALE = 25;
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
function buildingWarmth(b: { type: string; status: string; lit?: boolean }): FireSource | null {
  if (b.status !== 'complete') return null;
  const def = buildingService.getBuildingById(b.type);
  const warmth = def?.effects?.warmth;
  if (!warmth || !def?.lightRadius) return null;
  const needsFuel = (def.maxFuel ?? 0) > 0;
  if (needsFuel && b.lit !== true) return null;
  return {
    x: (b as PlacedBuilding).x,
    y: (b as PlacedBuilding).y,
    degrees: warmth * WARMTH_SCALE,
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

/** Rebuild the thermal field from current buildings — once per tick (O(buildings)). */
export function rebuildThermalField(buildings: PlacedBuilding[] | undefined): void {
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
  fireSources = fires;
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

/** On-demand thermal sample from a buildings array (renderer/HUD has no prebuilt field). */
export function computeThermalAt(
  x: number,
  y: number,
  buildings: PlacedBuilding[] | undefined
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
  thermal: ThermalSample = NO_THERMAL
): number {
  const fromWeather = weatherMoistureBonus(weather) * (1 - thermal.weatherProtection);
  return Math.max(0, Math.min(100, baseMoisture + fromWeather));
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
    wetness: tileWetness(baseMoisture, weather, NO_THERMAL)
  };
}

/**
 * Effective temperature (°C) at a tile for display — mirrors what the need-rate hot path computes:
 * baked tile temperature (biome base + season offset) + the live weather delta, then shelter
 * (roof insulation + weather protection) + nearby fire warmth. Computed on demand from `terrainType`
 * + season + weather (+ optional thermal sample), so the worker-only `tile.temperature` never ships.
 */
export function tileTemperature(
  terrainType: string,
  season: Season | undefined,
  weather?: WeatherState,
  thermal: ThermalSample = NO_THERMAL
): number {
  const base = biomeBaseTemp(terrainType) + (season ? SEASONS[season].tempOffset : 0);
  return effectiveTemperature(base, weatherEffects(weather).tempDelta, thermal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Snow cover (SEASONS_WEATHER) — per-tile accumulation, mutated IN PLACE.
// ─────────────────────────────────────────────────────────────────────────────

/** Wetter tiles collect snow faster: dry ≈ 0.4×, soaked ≈ 1.8×. */
function snowWetFactor(wetness: number): number {
  return 0.4 + (Math.max(0, Math.min(100, wetness)) / 100) * 1.4;
}
/** Snow gained per in-game hour on a wet-neutral tile while it's snowing and below freezing. */
const SNOW_ACCRUAL_PER_HOUR = 3.5;
/** Snow lost per in-game hour once the tile is at/above 0°C. */
const SNOW_MELT_PER_HOUR = 4;
/** Only re-bake/ship a tile when its snow crosses one of these buckets (keeps deltas bounded). */
const SNOW_RENDER_STEP = 5;

/** True for the weather overlays that actually deposit snow. */
function isSnowingWeather(weather?: WeatherState): boolean {
  const o = weatherOverlayKind(weather?.type);
  return o === 'snow' || o === 'snowdust';
}

/**
 * Accumulate / melt snow across the whole map IN PLACE (PERF-1: mutate `tile.snow`, never rebuild
 * the worldMap). Snow builds only while it's snowing AND the tile's effective temperature is below
 * 0°C, scaled by the tile's wetness; it melts once at/above freezing. Call on a SLOW cadence (hourly)
 * — only tiles whose snow crosses a render bucket are marked dirty, so the worldMapDelta stays small.
 * Uses the baked `tile.temperature` (biome+season) + the live weather delta — all cheap scalars.
 */
export function accumulateSnow(
  worldMap: WorldTile[][],
  weather: WeatherState | undefined,
  hours = 1
): void {
  const snowing = isSnowingWeather(weather);
  const wDelta = weatherEffects(weather).tempDelta;
  for (const row of worldMap) {
    for (const tile of row) {
      const prev = tile.snow ?? 0;
      const temp = (tile.temperature ?? 0) + wDelta;
      let next = prev;
      if (snowing && temp < 0) {
        next = Math.min(
          100,
          prev +
            SNOW_ACCRUAL_PER_HOUR * snowWetFactor(tileWetness(tile.moisture ?? 0, weather)) * hours
        );
      } else if (temp >= 0 && prev > 0) {
        next = Math.max(0, prev - SNOW_MELT_PER_HOUR * hours);
      }
      if (next === prev) continue;
      tile.snow = next;
      // Only ship a delta when the change is visible (crossed a render bucket) — bounds churn.
      if (Math.floor(next / SNOW_RENDER_STEP) !== Math.floor(prev / SNOW_RENDER_STEP)) {
        markTileDirty(tile.y, tile.x, tile);
      }
    }
  }
}

/** Ambient-wind starting/fallback value when a WeatherState carries none (back-compat). */
const DEFAULT_WIND = 0.3;
/** Per-day ambient-wind random-walk step magnitude (±). */
const WIND_DRIFT = 0.18;
/** How hard ambient wind boosts a `windScaled` transition branch: weight × (1 + wind × this). */
const WIND_TRANSITION_BOOST = 2.5;

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
 * Data-driven connected-chain transition (weather.jsonc `transitions`). Unlike a first-match chain,
 * this is a WEIGHTED pick: each season-valid transition contributes a weight (its `chance`, or the
 * season `precipitation` for `seasonPrecip`, optionally amplified by ambient `wind` for `windScaled`
 * branches). One draw selects among them; the leftover weight (1 − Σ) is the chance the weather
 * simply persists. This is what makes weather flow along intensity ladders (clear→drizzle→rain→
 * heavy_rain→storm) and lets a windy day push toward the storm/windy branches.
 */
function rollWeatherType(
  prev: WeatherType,
  season: Season,
  wind: number,
  rng: SeededRng
): WeatherType {
  const transitions = weatherDef(prev).transitions ?? [];
  const weighted: Array<{ to: string; w: number }> = [];
  let total = 0;
  for (const tr of transitions) {
    if (tr.seasons && !tr.seasons.includes(season)) continue;
    let w = tr.seasonPrecip ? SEASONS[season].precipitation : (tr.chance ?? 0);
    if (tr.windScaled) w *= 1 + wind * WIND_TRANSITION_BOOST;
    if (w <= 0) continue;
    weighted.push({ to: tr.to, w });
    total += w;
  }
  if (total <= 0) return prev;
  // Draw over [0,1): walk the weighted branches; falling past the end (when Σ < 1) = stay put.
  const r = rng.random();
  let acc = 0;
  for (const { to, w } of weighted) {
    acc += w;
    if (r < acc) return to;
  }
  return prev;
}

/**
 * Advance the weather one in-game day (called on day boundaries only — at most one new
 * WeatherState object per day, so snapshot churn is negligible). Ambient wind random-walks every day
 * (so the "wind trajectory" drifts independently of the weather type); the type only re-rolls when
 * the current spell's `turnsRemaining` has elapsed, otherwise the spell simply runs down.
 */
export function advanceWeatherForDay(
  weather: WeatherState,
  season: Season,
  rng: SeededRng
): WeatherState {
  const wind = Math.max(
    0,
    Math.min(1, (weather.wind ?? DEFAULT_WIND) + (rng.random() * 2 - 1) * WIND_DRIFT)
  );
  // Direction backs/veers one of the 8 compass points on a chance roll (its own slow walk).
  let windDir = weather.windDir ?? DEFAULT_WIND_DIR;
  if (rng.chance(WIND_DIR_TURN_CHANCE)) windDir = (windDir + (rng.chance(0.5) ? 1 : 7)) % 8;
  const remaining = weather.turnsRemaining - TICKS_PER_DAY;
  if (remaining > 0) {
    return { ...weather, wind, windDir, turnsRemaining: remaining };
  }
  const type = rollWeatherType(weather.type, season, wind, rng);
  const def = weatherDef(type);
  const [minDur, maxDur] = def.durationRange ?? DURATION_RANGE;
  return {
    type,
    intensity: def.intensity,
    turnsRemaining: rng.int(minDur, maxDur),
    wind,
    windDir
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
