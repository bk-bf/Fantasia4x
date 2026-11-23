import { clamp } from '$lib/pixelArt/noise';
import { PAINTED_BASE_URL } from '$lib/webgl/painted/loader';
import type { ColonyAmbient, ColonySeason } from './mainMenuAmbient';

export const COLONY_W = 1920;
export const COLONY_H = 1088;
const FOCUS_X = 912;
const FOCUS_Y = 526;
const DRIFT = 64;
export const DRIFT_SPEED = 30;
const DRIFT_TURN = 1.2;
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

function cameraAt(viewW: number, viewH: number, k: number, fx: number) {
  return {
    left: clamp(viewW * VIEW_X - fx * k, viewW - COLONY_W * k, 0),
    top: Math.round(clamp(viewH * VIEW_Y - FOCUS_Y * k, viewH - COLONY_H * k, 0))
  };
}

export function colonyDrift(viewW: number, viewH: number, k: number) {
  return {
    rest: cameraAt(viewW, viewH, k, FOCUS_X),
    from: cameraAt(viewW, viewH, k, FOCUS_X - DRIFT),
    to: cameraAt(viewW, viewH, k, FOCUS_X + DRIFT)
  };
}

export function driftOffset(span: number, seconds: number): number {
  if (span <= 0) return 0;
  const turn = Math.min(DRIFT_TURN, (2 * span) / DRIFT_SPEED);
  const ease = (DRIFT_SPEED * turn) / 4;
  const cruise = span / DRIFT_SPEED - turn / 2;
  const half = cruise + turn;
  const leg = (s: number) => {
    if (s < cruise) return ease + DRIFT_SPEED * s;
    const u = s - cruise;
    return span - ease + DRIFT_SPEED * u - (DRIFT_SPEED * u * u) / turn;
  };
  const cycle = 2 * half;
  const t = (((seconds + (span / 2 - ease) / DRIFT_SPEED) % cycle) + cycle) % cycle;
  return t < half ? leg(t) : span - leg(t - half);
}

export const snapToDevice = (css: number, dpr: number): number => Math.round(css * dpr) / dpr;
