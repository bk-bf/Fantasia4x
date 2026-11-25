import {
  ambientWind,
  weatherIsHeavy,
  weatherOverlayKind,
  windVector
} from '$lib/game/services/EnvironmentService';
import type { WeatherState } from '$lib/game/core/types';
import type { Attachment } from 'svelte/attachments';
import { PAINTED_BASE_URL } from '$lib/webgl/painted/loader';
import { heading, type Heading } from '$lib/webgl/painted/wind';
import SHEETS from './weatherSheets.json';

const { rain: RAIN, fog: FOG, fogInk: FOG_INK, fogPace: FOG_PACE, snow: SNOW } = SHEETS;

export const WEATHER_TILE = 32;
const SHRINK = 0.4;
const RAIN_STEP = 6;
const MAX_STEP_SECS = 0.25;

export type SheetTile = `rain${number}` | `storm${number}` | `fog${number}` | 'snow';

export interface WeatherSheet {
  tile: SheetTile;
  w: number;
  h: number;
  vx: number;
  vy: number;
  step: number;
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

export interface WeatherView {
  x: number;
  y: number;
}

const pace = (wind: number) => 0.85 + 0.5 * wind;
const round2 = (v: number) => Math.round(v * 100) / 100;

export function weatherScale(tileSize: number): number {
  const z = tileSize / WEATHER_TILE;
  return z >= 1 ? z : z ** SHRINK;
}

function windHeading(weather: WeatherState | undefined): Heading {
  const { dx, dy } = windVector(weather?.windDir);
  return heading(dx, dy);
}

function rain(heavy: boolean, amount: number, wind: number): WeatherGroup {
  const tile = heavy ? 'storm' : 'rain';
  return {
    kind: 'rain',
    opacity: round2(0.5 + 0.4 * amount),
    tint: '',
    sheets: RAIN.map((L, n) => {
      const secs = L.secs / pace(wind);
      return {
        tile: `${tile}${n}` as SheetTile,
        w: L.p,
        h: L.p * 3,
        vx: -L.p / 3 / secs,
        vy: L.p / secs,
        step: RAIN_STEP,
        gust: L.gust,
        at: n * 0.37,
        soft: false
      };
    })
  };
}

function fog(light: number, wind: number, toward: Heading): WeatherGroup {
  const drift = FOG_PACE[0] + FOG_PACE[1] * wind;
  return {
    kind: 'fog',
    opacity: round2(Math.min(1, (0.2 + 0.2 * light) * 2.5)),
    tint: `rgb(${FOG_INK.join(' ')} / 0.12)`,
    sheets: FOG.map((L, n) => {
      const speed = (L.size / L.secs) * L.pace * drift;
      return {
        tile: `fog${n}` as SheetTile,
        w: L.size,
        h: Math.round((L.size * L.h) / L.w),
        vx: toward.x * speed,
        vy: toward.y * speed,
        step: 0,
        gust: L.gust,
        at: n * 0.41,
        soft: true
      };
    })
  };
}

function snow(amount: number, wind: number): WeatherGroup {
  const fall = SNOW.fall * pace(wind);
  return {
    kind: 'snow',
    opacity: amount,
    tint: '',
    sheets: [
      {
        tile: 'snow',
        w: SNOW.size,
        h: SNOW.size,
        vx: fall * (SNOW.slope[0] + SNOW.slope[1] * wind),
        vy: fall,
        step: 0,
        gust: null,
        at: 0,
        soft: false
      }
    ]
  };
}

export function planWeather(weather: WeatherState | undefined, light: number): WeatherGroup[] {
  const kind = weatherOverlayKind(weather?.type);
  const wind = round2(ambientWind(weather));
  const out: WeatherGroup[] = [];
  if (kind === 'fog' || kind === 'foggy_rain')
    out.push(fog(Math.round(light * 16) / 16, wind, windHeading(weather)));
  if (kind === 'rain' || kind === 'foggy_rain')
    out.push(rain(weatherIsHeavy(weather?.type), weather?.intensity ?? 0.5, wind));
  if (kind === 'snow') out.push(snow(1, wind));
  if (kind === 'snowdust') out.push(snow(0.5, wind));
  return out;
}

export const tileImage = (tile: SheetTile): string => `url(${PAINTED_BASE_URL}weather/${tile}.png)`;

const wrap = (v: number, p: number) => ((v % p) + p) % p;

export interface SheetDrift {
  x: number;
  y: number;
}

export function advance(s: WeatherSheet, d: SheetDrift, secs: number): void {
  d.y = wrap(d.y + s.vy * secs, s.h);
  d.x = s.step ? 0 : wrap(d.x + s.vx * secs, s.w);
}

export interface SheetPlace {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function placeSheet(
  s: WeatherSheet,
  d: SheetDrift,
  view: WeatherView,
  scale: number,
  centre: { x: number; y: number }
): SheetPlace {
  const w = s.w * scale;
  const h = s.h * scale;
  const dy = s.step ? Math.floor(d.y / s.step) * s.step : d.y;
  const dx = s.step ? dy * (s.vx / s.vy) : d.x;
  const x = wrap(centre.x + (dx - view.x) * scale, w) - w;
  const y = wrap(centre.y + (dy - view.y) * scale, h) - h;
  return s.soft ? { x, y, w, h } : { x: Math.round(x), y: Math.round(y), w, h };
}

export const weatherMoves = (): boolean =>
  !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

export function weatherDriver(read: () => { scale: number; view: WeatherView }) {
  const live = new Map<HTMLElement, WeatherSheet>();
  const drift = new Map<SheetTile, SheetDrift>();
  const track =
    (s: WeatherSheet): Attachment<HTMLElement> =>
    (el) => {
      live.set(el, s);
      return () => live.delete(el);
    };
  const drive: Attachment<HTMLElement> = (root) => {
    const moving = weatherMoves();
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const secs = moving ? Math.min(MAX_STEP_SECS, Math.max(0, now - last) / 1000) : 0;
      last = now;
      const { scale, view } = read();
      const centre = { x: root.clientWidth / 2, y: root.clientHeight / 2 };
      for (const [el, s] of live) {
        let d = drift.get(s.tile);
        if (!d) drift.set(s.tile, (d = { x: 0, y: 0 }));
        advance(s, d, secs);
        const at = placeSheet(s, d, view, scale, centre);
        el.style.translate = `${at.x}px ${at.y}px`;
        const tile = el.firstElementChild as HTMLElement | null;
        const size = `${at.w}px ${at.h}px`;
        if (tile && tile.style.backgroundSize !== size) {
          tile.style.backgroundSize = size;
          tile.style.width = `calc(100% + ${at.w}px)`;
          tile.style.height = `calc(100% + ${at.h}px)`;
        }
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  };
  return { track, drive };
}

const gusts = new Map<string, Attachment<HTMLElement>>();

export function sheetGust(s: WeatherSheet): Attachment<HTMLElement> {
  const key = `${s.tile}|${s.gust?.join(',')}|${s.at}`;
  let made = gusts.get(key);
  if (!made) {
    const gust = s.gust;
    made = (el) => {
      if (!gust || !weatherMoves()) return;
      const run = el.animate([{ opacity: gust[1] }, { opacity: 1 }], {
        duration: gust[0] * 1000,
        easing: 'ease-in-out',
        iterations: Infinity,
        direction: 'alternate',
        delay: -gust[0] * s.at * 1000
      });
      return () => run.cancel();
    };
    gusts.set(key, made);
  }
  return made;
}
