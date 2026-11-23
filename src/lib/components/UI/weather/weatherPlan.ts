import {
  ambientWind,
  weatherIsHeavy,
  weatherOverlayKind
} from '$lib/game/services/EnvironmentService';
import type { WeatherState } from '$lib/game/core/types';
import type { Attachment } from 'svelte/attachments';
import { PAINTED_BASE_URL } from '$lib/webgl/painted/loader';
import SHEETS from './weatherSheets.json';

const { rain: RAIN, fog: FOG, fogInk: FOG_INK, snow: SNOW } = SHEETS;

export type SheetTile = `rain${number}` | `storm${number}` | `fog${number}` | 'snow';

export interface WeatherSheet {
  tile: SheetTile;
  size: string;
  w: number;
  h: number;
  tx: number;
  ty: number;
  secs: number;
  steps: number;
  gust: readonly number[] | null;
  at: number;
  soft: boolean;
  drift: { tx: number; secs: number } | null;
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
      w: L.p * k,
      h: L.p * k,
      tx: (-L.p / 3) * k,
      ty: L.p * k,
      secs: round2(L.secs / pace(wind)),
      steps: L.p / 6,
      gust: L.gust,
      at: n * 0.37,
      soft: false,
      drift: null
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
      w: L.size * k,
      h: Math.round((L.size * L.h) / L.w) * k,
      tx: L.dir * L.size * k,
      ty: 0,
      secs: L.secs,
      steps: 0,
      gust: L.gust,
      at: n * 0.41,
      soft: true,
      drift: null
    }))
  };
}

function snow(amount: number, wind: number, k: number): WeatherGroup {
  const tile = SNOW.size * k;
  const fall = SNOW.fall * pace(wind);
  return {
    kind: 'snow',
    opacity: amount,
    tint: '',
    sheets: [
      {
        tile: 'snow',
        size: `${tile}px`,
        w: tile,
        h: tile,
        tx: 0,
        ty: tile,
        secs: round2(SNOW.size / fall),
        steps: 0,
        gust: null,
        at: 0,
        soft: false,
        drift: {
          tx: tile,
          secs: round2(SNOW.size / (fall * (SNOW.slope[0] + SNOW.slope[1] * wind)))
        }
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
  [s.tile, s.secs, s.tx, s.ty, s.steps, s.at, s.drift?.tx, s.drift?.secs].join('|');

const wrap = (v: number, p: number) => ((v % p) + p) % p;

export interface SheetAnchor {
  x: number;
  y: number;
  phase: number;
  drift: number;
}

export function anchorSheet(s: WeatherSheet, ox: number, oy: number, moving: boolean): SheetAnchor {
  if (!moving) {
    const rows = Math.floor(oy / s.h);
    const shear = s.ty ? s.tx : 0;
    return {
      x: Math.round(wrap(ox - rows * shear, s.w)),
      y: Math.round(oy - rows * s.h),
      phase: 0,
      drift: 0
    };
  }
  if (!s.ty) return { x: 0, y: Math.round(wrap(oy, s.h)), phase: wrap(ox / s.tx, 1), drift: 0 };
  const phase = wrap(oy / s.ty, 1);
  const rest = ox - Math.floor(oy / s.ty) * s.tx - phase * s.tx;
  if (s.drift) return { x: 0, y: 0, phase, drift: wrap(rest / s.drift.tx, 1) };
  return { x: Math.round(wrap(rest, s.w)), y: 0, phase, drift: 0 };
}

export function sheetReach(
  s: WeatherSheet,
  moving: boolean
): { left: number; top: number; w: number; h: number } {
  if (!moving) return { left: s.w, top: s.h, w: s.w, h: s.h };
  const drift = s.drift?.tx ?? 0;
  const spareX = s.ty && !s.drift ? s.w : 0;
  const spareY = s.ty ? 0 : s.h;
  return {
    left: Math.max(0, s.tx) + drift + spareX,
    top: s.ty + spareY,
    w: Math.abs(s.tx) + drift + spareX,
    h: s.ty + spareY
  };
}

export const weatherMoves = (): boolean =>
  !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const FALL = 'fall';
const DRIFT = 'drift';

const loopStart = (el: HTMLElement, id: string, secs: number) =>
  -Number(el.dataset[id] ?? 0) * secs * 1000;

const motion =
  (s: WeatherSheet): Attachment<HTMLElement> =>
  (el) => {
    if (!weatherMoves()) return;
    const fall = el.animate(
      [{ transform: 'none' }, { transform: `translate(${s.tx}px, ${s.ty}px)` }],
      {
        id: FALL,
        duration: s.secs * 1000,
        easing: s.steps ? `steps(${s.steps})` : 'linear',
        iterations: Infinity,
        delay: -s.secs * s.at * 1000
      }
    );
    fall.startTime = loopStart(el, FALL, s.secs);
    const runs = [fall];
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

const driftMotion =
  (s: WeatherSheet): Attachment<HTMLElement> =>
  (el) => {
    if (!s.drift || !weatherMoves()) return;
    const run = el.animate([{ transform: 'none' }, { transform: `translateX(${s.drift.tx}px)` }], {
      id: DRIFT,
      duration: s.drift.secs * 1000,
      easing: 'linear',
      iterations: Infinity
    });
    run.startTime = loopStart(el, DRIFT, s.drift.secs);
    return () => run.cancel();
  };

const motions = new Map<string, Attachment<HTMLElement>>();

function cached(
  key: string,
  make: (s: WeatherSheet) => Attachment<HTMLElement>,
  s: WeatherSheet
): Attachment<HTMLElement> {
  let made = motions.get(key);
  if (!made) {
    made = make(s);
    motions.set(key, made);
  }
  return made;
}

export const sheetMotion = (s: WeatherSheet): Attachment<HTMLElement> =>
  cached(sheetKey(s), motion, s);

export const sheetDrift = (s: WeatherSheet): Attachment<HTMLElement> =>
  cached(`drift|${sheetKey(s)}`, driftMotion, s);

function shiftLoop(el: HTMLElement, id: string, phase: number, secs: number) {
  el.dataset[id] = String(phase);
  const start = loopStart(el, id, secs);
  for (const run of el.getAnimations())
    if (run.id === id && (run.startTime === null || Math.abs(Number(run.startTime) - start) > 0.5))
      run.startTime = start;
}

export const fallAt =
  (phase: number, secs: number): Attachment<HTMLElement> =>
  (el) =>
    shiftLoop(el, FALL, phase, secs);

export const driftAt =
  (phase: number, secs: number): Attachment<HTMLElement> =>
  (el) =>
    shiftLoop(el, DRIFT, phase, secs);
