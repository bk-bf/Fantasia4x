import { clamp } from '$lib/pixelArt/noise';
import { PAINTED_BASE_URL } from '$lib/webgl/painted/loader';
import type { ColonyAmbient, ColonySeason } from './mainMenuAmbient';

export const COLONY_W = 1920;
export const COLONY_H = 1088;
export const COLONY_TILE = 32;
const FOCUS_X = 912;
const FOCUS_Y = 526;
const DRIFT = 64;
const DRIFT_PERIOD = 34;
const VIEW_X = 0.64;
const VIEW_Y = 0.56;

export type ColonyTime = 'day' | 'dusk' | 'night';

export interface ColonyLayer {
  time: ColonyTime;
  opacity: number;
}

export const colonyImage = (season: ColonySeason, time: ColonyTime, live: boolean): string =>
  `${PAINTED_BASE_URL}colony/${season}-${time}${live ? '-live' : ''}.png`;

export function colonyLayers(a: ColonyAmbient): ColonyLayer[] {
  const out: ColonyLayer[] = [];
  if (a.dusk < 0.99 && a.night < 0.99) out.push({ time: 'day', opacity: 1 });
  if (a.dusk > 0.01 && a.night < 0.99) out.push({ time: 'dusk', opacity: a.dusk });
  if (a.night > 0.01) out.push({ time: 'night', opacity: a.night });
  if (out.length && out[0].time !== 'day') out[0] = { ...out[0], opacity: 1 };
  return out;
}

export const colonyZoom = (scale: number, viewW: number, viewH: number): number =>
  Math.max(scale, Math.ceil(Math.max(viewW / COLONY_W, viewH / COLONY_H)));

export function colonyCamera(viewW: number, viewH: number, k: number, seconds: number) {
  const fx = FOCUS_X + Math.sin(seconds / DRIFT_PERIOD) * DRIFT;
  return {
    left: Math.round(clamp(viewW * VIEW_X - fx * k, viewW - COLONY_W * k, 0)),
    top: Math.round(clamp(viewH * VIEW_Y - FOCUS_Y * k, viewH - COLONY_H * k, 0))
  };
}
