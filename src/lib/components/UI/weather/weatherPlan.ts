import {
  ambientWind,
  weatherIsHeavy,
  weatherOverlayKind
} from '$lib/game/services/EnvironmentService';
import type { WeatherState } from '$lib/game/core/types';
import type { Attachment } from 'svelte/attachments';
import { PAINTED_BASE_URL } from '$lib/webgl/painted/loader';
import SHEETS from './weatherSheets.json';

const { rain: RAIN, fog: FOG, fogInk: FOG_INK, snowTile: SNOW_TILE } = SHEETS;

export type SheetTile = `rain${number}` | `storm${number}` | `fog${number}` | 'snow';

export interface WeatherSheet {
  tile: SheetTile;
  size: string;
  tx: number;
  ty: number;
  secs: number;
  steps: number;
  gust: readonly number[] | null;
  at: number;
  soft: boolean;
}

export interface WeatherGroup {
  kind: 'rain' | 'fog' | 'snow';
  opacity: number;
  tint: string;
  sheets: WeatherSheet[];
}

const pace = (wind: number) => 0.85 + 0.5 * wind;
const round2 = (v: number) => Math.round(v * 100) / 100;

function rain(heavy: boolean, amount: number, wind: number, k: number): WeatherGroup {
  const tile = heavy ? 'storm' : 'rain';
  return {
    kind: 'rain',
    opacity: round2(0.5 + 0.4 * amount),
    tint: '',
    sheets: RAIN.map((L, n) => ({
      tile: `${tile}${n}` as SheetTile,
      size: `${L.p * k}px ${L.p * 3 * k}px`,
      tx: (-L.p / 3) * k,
      ty: L.p * k,
      secs: round2(L.secs / pace(wind)),
      steps: L.p / 6,
      gust: L.gust,
      at: n * 0.37,
      soft: false
    }))
  };
}

function fog(light: number, k: number): WeatherGroup {
  return {
    kind: 'fog',
    opacity: round2(Math.min(1, (0.2 + 0.2 * light) * 2.5)),
    tint: `rgb(${FOG_INK.join(' ')} / 0.12)`,
    sheets: FOG.map((L, n) => ({
      tile: `fog${n}` as SheetTile,
      size: `${L.size * k}px ${Math.round((L.size * L.h) / L.w) * k}px`,
      tx: L.dir * L.size * k,
      ty: 0,
      secs: L.secs,
      steps: 0,
      gust: L.gust,
      at: n * 0.41,
      soft: true
    }))
  };
}

function snow(amount: number, wind: number, k: number): WeatherGroup {
  return {
    kind: 'snow',
    opacity: amount,
    tint: '',
    sheets: [
      {
        tile: 'snow',
        size: `${SNOW_TILE * k}px`,
        tx: SNOW_TILE * k * Math.max(1, Math.round(0.4 + 2 * wind)),
        ty: SNOW_TILE * 4 * k,
        secs: round2(18 / pace(wind)),
        steps: 0,
        gust: null,
        at: 0,
        soft: false
      }
    ]
  };
}

export function planWeather(
  weather: WeatherState | undefined,
  light: number,
  k: number
): WeatherGroup[] {
  const kind = weatherOverlayKind(weather?.type);
  const wind = round2(ambientWind(weather));
  const out: WeatherGroup[] = [];
  if (kind === 'fog' || kind === 'foggy_rain') out.push(fog(Math.round(light * 16) / 16, k));
  if (kind === 'rain' || kind === 'foggy_rain')
    out.push(rain(weatherIsHeavy(weather?.type), weather?.intensity ?? 0.5, wind, k));
  if (kind === 'snow') out.push(snow(1, wind, k));
  if (kind === 'snowdust') out.push(snow(0.5, wind, k));
  return out;
}

export const tileImage = (tile: SheetTile): string => `url(${PAINTED_BASE_URL}weather/${tile}.png)`;

export const sheetKey = (s: WeatherSheet): string =>
  [s.tile, s.secs, s.tx, s.ty, s.steps, s.at].join('|');

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const motion =
  (s: WeatherSheet): Attachment<HTMLElement> =>
  (el) => {
    if (reducedMotion()) return;
    const runs = [
      el.animate([{ transform: 'none' }, { transform: `translate(${s.tx}px, ${s.ty}px)` }], {
        duration: s.secs * 1000,
        easing: s.steps ? `steps(${s.steps})` : 'linear',
        iterations: Infinity,
        delay: -s.secs * s.at * 1000
      })
    ];
    if (s.gust)
      runs.push(
        el.animate([{ opacity: s.gust[1] }, { opacity: 1 }], {
          duration: s.gust[0] * 1000,
          easing: 'ease-in-out',
          iterations: Infinity,
          direction: 'alternate',
          delay: -s.gust[0] * s.at * 1000
        })
      );
    return () => runs.forEach((r) => r.cancel());
  };

const motions = new Map<string, Attachment<HTMLElement>>();

export function sheetMotion(s: WeatherSheet): Attachment<HTMLElement> {
  const key = sheetKey(s);
  let made = motions.get(key);
  if (!made) {
    made = motion(s);
    motions.set(key, made);
  }
  return made;
}
