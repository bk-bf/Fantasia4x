import { dith, hash } from '../../pixelArt/noise.js';

export type Rgb = [number, number, number];

export interface PointLight {
  x: number;
  y: number;
  color: Rgb;
  radius: number;
  intensity: number;
  flicker?: boolean;
  art?: { x: number; y: number; rad: number; night?: boolean };
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TimeGrade {
  ambient: Rgb;
  strength: number;
  radius: number;
  vignette: number;
}

export const TIMES: Readonly<Record<'day' | 'dusk' | 'night', TimeGrade>> = {
  day: { ambient: [1, 1, 1], strength: 0.22, radius: 0.7, vignette: 0.16 },
  dusk: { ambient: [0.86, 0.6, 0.56], strength: 0.6, radius: 1, vignette: 0.2 },
  night: { ambient: [0.24, 0.29, 0.5], strength: 1, radius: 1, vignette: 0.24 }
};

export type MapWeatherId = 'clear' | 'rain' | 'storm' | 'fog' | 'snow';

export interface MapWeather {
  sat: number;
  rain: number;
  fog: number;
}

export const MAP_WEATHER: Readonly<Record<MapWeatherId, MapWeather>> = {
  clear: { sat: 1, rain: 0, fog: 0 },
  rain: { sat: 0.95, rain: 0.5, fog: 0 },
  storm: { sat: 0.72, rain: 1, fog: 0 },
  fog: { sat: 0.68, rain: 0, fog: 1 },
  snow: { sat: 0.85, rain: 0, fog: 0 }
};

export function mapWeather(overlay: string, heavy: boolean): MapWeatherId {
  if (overlay === 'rain') return heavy ? 'storm' : 'rain';
  if (overlay === 'fog' || overlay === 'foggy_rain') return 'fog';
  if (overlay === 'snow' || overlay === 'snowdust') return 'snow';
  return 'clear';
}

export interface LightGrade {
  weights: Rgb;
  ambient: Rgb;
  vignette: number;
  saturation: number;
  brightness: number;
}

export const LIGHT_STEPS = 7;
export const LIGHT_SQUASH = 1.25;
export const LIGHT_CEIL = 1.5;
export const MAX_LIGHTS = 64;
export const FLICKER_RATE = 6;
const FLICKER_RADII = [0.92, 1, 1.08];
const FLICKER_SEED = 7;
const NIGHT_FROM = 0.2;
const NIGHT_TO = 0.55;
const DUSK_GAIN = 1.35;
const SATURATION_CURVE = 2.2;
const RAIN_DIM = 0.14;
const FOG_DIM = 0.06;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function gradeForHour(
  light: number,
  tint: Rgb,
  weather: MapWeather = MAP_WEATHER.clear
): LightGrade {
  const night = 1 - smooth(NIGHT_FROM, NIGHT_TO, light);
  const warm = Math.max(0, 1 - tint[2] / tint[0]) * (1 - night);
  const dusk = clamp01(warm * DUSK_GAIN);
  const weights: Rgb = [(1 - night) * (1 - dusk), (1 - night) * dusk, night];
  const times = [TIMES.day, TIMES.dusk, TIMES.night];
  const sum = (pick: (t: TimeGrade) => number) =>
    times.reduce((a, t, i) => a + weights[i] * pick(t), 0);
  const dull = weather.sat < 1;
  return {
    weights,
    ambient: [sum((t) => t.ambient[0]), sum((t) => t.ambient[1]), sum((t) => t.ambient[2])],
    vignette: sum((t) => t.vignette),
    saturation: dull ? Math.pow(weather.sat, SATURATION_CURVE) : 1,
    brightness: dull ? 1 - weather.rain * RAIN_DIM - weather.fog * FOG_DIM : 1
  };
}

export function stepFalloff(d: number, x: number, y: number): number {
  if (d >= 1) return 0;
  return Math.floor((1 - d) * (1 - d) * LIGHT_STEPS + dith(x, y)) / LIGHT_STEPS;
}

export function packLights(
  lights: readonly PointLight[],
  view: TileRect,
  artTile: number,
  time: number,
  out: Float32Array
): number {
  const tick = Math.floor(time * FLICKER_RATE);
  let n = 0;
  for (let i = 0; i < lights.length && n < MAX_LIGHTS; i++) {
    const l = lights[i];
    const pick = FLICKER_RADII[Math.floor(hash(tick, i, FLICKER_SEED) * FLICKER_RADII.length)];
    const cx = l.art ? l.x * artTile + l.art.x : (l.x + 0.5) * artTile;
    const cy = l.art ? l.y * artTile + l.art.y : (l.y + 0.5) * artTile;
    const r = l.art ? l.art.rad : l.radius * artTile;
    const lit = l.flicker ? r * pick : r;
    const reach = Math.max(lit, r) / artTile;
    if (cx / artTile + reach < view.x || cx / artTile - reach > view.x + view.w) continue;
    if (cy / artTile + reach < view.y || cy / artTile - reach > view.y + view.h) continue;
    out.set([cx, cy, lit, l.art?.night ? 0 : r * TIMES.day.radius], n * 8);
    out.set([l.color[0], l.color[1], l.color[2], l.art ? 1 : l.intensity], n * 8 + 4);
    n++;
  }
  return n;
}
