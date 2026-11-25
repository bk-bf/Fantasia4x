import {
  ambientWind,
  environmentService,
  getAmbientLight,
  getAmbientTint,
  getTimeOfDay,
  weatherIsHeavy,
  weatherOverlayKind,
  type WeatherOverlayKind
} from '$lib/game/services/EnvironmentService';
import type { WeatherState } from '$lib/game/core/types';
import type { Season } from '$lib/game/core/types/environment';
import { clamp } from '$lib/pixelArt/noise';
import type { SkyAmbient } from '$lib/pixelArt/skyBowl';

type Rgb3 = [number, number, number];

const WEATHER_TINT: Partial<Record<WeatherOverlayKind, Rgb3>> = {
  rain: [0.8, 0.85, 1],
  foggy_rain: [0.76, 0.8, 0.95],
  fog: [0.88, 0.88, 0.9],
  snow: [0.92, 0.96, 1],
  snowdust: [0.92, 0.96, 1],
  dust: [1, 0.9, 0.78]
};

const WEATHER_SAT: Partial<Record<WeatherOverlayKind, number>> = {
  rain: 0.95,
  foggy_rain: 0.68,
  fog: 0.68,
  snow: 0.85,
  snowdust: 0.85
};

export type ColonySeason = 'autumn' | 'winter';

export interface ColonyAmbient {
  season: ColonySeason;
  dusk: number;
  night: number;
  filter: string;
}

const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface MenuAmbient {
  sky: SkyAmbient;
  lamp: number;
  wind: number;
  colony: ColonyAmbient;
}

export function menuAmbient(gs: {
  turn: number;
  _debugTimeOfDay?: number;
  weather?: WeatherState;
  season?: Season;
}): MenuAmbient {
  const turn = environmentService.ambientTurn(gs);
  const light = getAmbientLight(turn);
  const tint = getAmbientTint(turn);
  const kind = weatherOverlayKind(gs.weather?.type);
  const wt = WEATHER_TINT[kind] ?? [1, 1, 1];
  const night = 1 - smooth(0.2, 0.55, light);
  const heavy = weatherIsHeavy(gs.weather?.type);
  const rain = kind === 'rain' || kind === 'foggy_rain' ? (heavy ? 1 : 0.5) : 0;
  const fog = kind === 'fog' || kind === 'foggy_rain' ? 1 : 0;
  const snow = kind === 'snow' || kind === 'snowdust';
  const sat = Math.min(WEATHER_SAT[kind] ?? 1, heavy ? 0.72 : 1);
  const warm = Math.max(0, 1 - tint[2] / tint[0]) * (1 - night);
  const sky: Rgb3 = [0, 1, 2].map((i) => tint[i] * wt[i] * (0.25 + 0.75 * light)) as Rgb3;
  return {
    sky: {
      hour: getTimeOfDay(turn) * 24,
      light,
      warm,
      sky,
      rain: kind === 'rain' || kind === 'foggy_rain' ? 1 : 0,
      snow: kind === 'snow' || kind === 'snowdust' ? 1 : 0,
      fog: kind === 'fog' || kind === 'foggy_rain' ? 1 : 0
    },
    lamp: 1 - smooth(0.3, 0.8, light),
    wind: Math.round((0.4 + 1.9 * ambientWind(gs.weather)) * 4) / 4,
    colony: {
      season: snow || gs.season === 'winter' ? 'winter' : 'autumn',
      dusk: Math.round(clamp(warm * 1.35, 0, 1) * 32) / 32,
      night: Math.round(night * 32) / 32,
      filter:
        sat < 1
          ? `saturate(${Math.pow(sat, 2.2).toFixed(3)}) brightness(${(1 - rain * 0.14 - fog * 0.06).toFixed(3)})`
          : ''
    }
  };
}

export const skyKey = (a: SkyAmbient): string =>
  [Math.round(a.hour * 4), Math.round(a.light * 16), a.rain, a.snow, a.fog].join('|');
