import { SUNRISE_HOUR, SUNSET_HOUR } from '$lib/game/services/EnvironmentService';
import { paint } from './canvas';
import { clamp, dith, fbm, hash, mix } from './noise';
import { RAMPS, pick, type Rgb } from './palette';

export interface SkyAmbient {
  hour: number;
  light: number;
  warm: number;
  sky: readonly [number, number, number];
  rain: number;
  snow: number;
  fog: number;
}

export const SKY_BOWL_W = 102;
export const SKY_BOWL_H = 54;

const BAR = 8;
const RIM = 5;
const brass = RAMPS.brass;

function orb(a: SkyAmbient, cx: number, cy: number, radius: number) {
  const hr = ((a.hour % 24) + 24) % 24;
  const dayLen = SUNSET_HOUR - SUNRISE_HOUR;
  const day = hr >= SUNRISE_HOUR && hr < SUNSET_HOUR;
  const f = day ? (hr - SUNRISE_HOUR) / dayLen : ((hr - SUNSET_HOUR + 24) % 24) / (24 - dayLen);
  const ang = Math.PI * (1 - f);
  return { day, x: cx + Math.cos(ang) * radius, y: cy - Math.sin(ang) * radius * 0.92 };
}

function bar(x: number, y: number, cx: number, cy: number, r0: number): Rgb | null {
  const dx = x - cx;
  if (Math.abs(dx) > r0 + 6) return null;
  const j0 = y - cy;
  const j = BAR - j0;
  if (j0 === BAR || Math.abs(dx) > r0 + 5) return brass[0];
  if (j === 1) return brass[6];
  if (j === 7) return brass[1];
  if (j >= 3 && j <= 5 && Math.abs(dx) < r0 - 4 && (x - Math.round(cx) + 600) % 12 === 0)
    return brass[1];
  return pick(brass, 0.5 + (fbm(x * 0.05, y * 0.6, 3, 2) - 0.5) * 0.2, x, y, 0.8);
}

function rim(dx: number, dy: number, rr: number, r0: number): Rgb {
  const a = Math.atan2(-dy, dx);
  const u = (r0 - 1 - rr) / (RIM - 1);
  const li = (-dx * 0.55 + dy * 0.6) / r0;
  const tk = (a / Math.PI) * 12;
  const major = Math.round(tk) % 3 === 0;
  if (Math.abs(tk - Math.round(tk)) < (major ? 0.09 : 0.05) && u > 0.2 && u < (major ? 0.95 : 0.7))
    return brass[0];
  return brass[clamp(Math.round(3.4 + li * 2.6 + (u < 0.2 ? 1 : u > 0.85 ? -2 : 0)), 1, 6)];
}

function weatherPx(a: SkyAmbient, x: number, y: number, sk: number): Rgb | null {
  const cl =
    fbm(x * 0.09 + 7, y * 0.16, 44, 3) +
    sk * 0.28 -
    (a.fog ? 0.2 : 0.42) -
    (1 - Math.max(a.rain, a.snow, a.fog)) * 0.06;
  if (cl > 0.2) {
    const g = (70 + 130 * a.light * (a.fog ? 1 : 0.8)) * (cl > 0.3 ? 1 : 0.86);
    return [g * (0.8 + 0.2 * a.sky[0]), g * (0.86 + 0.14 * a.sky[1]), g * 1.04];
  }
  if (a.rain && (x + y * 2) % 7 === 0 && (y + (x >> 2)) % 5 < 3 && sk < 0.8) return [150, 176, 220];
  if (a.snow && hash(x, y, 51) > 0.93 && sk < 0.85) return [240, 244, 250];
  return null;
}

function bodyPx(
  a: SkyAmbient,
  o: ReturnType<typeof orb>,
  x: number,
  y: number,
  cloud: boolean
): Rgb | null {
  const od = Math.hypot(x - o.x, y - o.y);
  if (o.day) {
    if (od < 6.5 && !(cloud && a.fog)) return RAMPS.fire[od < 3 ? 4 : od < 5 ? 3 : 2];
    if (od < 11 && od > 8 && !cloud) {
      const ra = Math.atan2(y - o.y, x - o.x);
      if (Math.abs(((((ra / (Math.PI / 4)) % 1) + 1) % 1) - 0.5) > 0.36) return RAMPS.fire[3];
    }
    return null;
  }
  if (od < 6 && Math.hypot(x - o.x - 3, y - o.y + 1) >= 5) return RAMPS.moon[od < 4 ? 5 : 4];
  if (!cloud && od > 9 && hash(x, y, 31) > 0.975)
    return hash(x, y, 32) > 0.5 ? [232, 236, 250] : [150, 164, 210];
  return null;
}

export function skyBowl(a: SkyAmbient): HTMLCanvasElement {
  const w = SKY_BOWL_W;
  const h = SKY_BOWL_H;
  const cx = (w - 1) / 2;
  const cy = h - 9;
  const r0 = Math.min(cx, cy) - 1;
  const o = orb(a, cx, cy, r0 - RIM - 13);
  const cloud = a.rain > 0 || a.snow > 0 || a.fog > 0;
  const top = [28 + 70 * a.sky[0], 50 + 110 * a.sky[1], 86 + 150 * a.sky[2]];
  const low = [
    70 + 185 * a.sky[0] * (0.55 + a.warm * 0.45),
    62 + 150 * a.sky[1],
    70 + 110 * a.sky[2] * (1 - a.warm * 0.6)
  ];
  return paint(w, h, (x, y0) => {
    const y = h - 1 - y0;
    const dx = x - cx;
    const dy = y - cy;
    const rr = Math.hypot(dx, dy);
    if (y > cy + BAR) return null;
    if (y > cy) return bar(x, y, cx, cy, r0);
    if (rr > r0) return null;
    if (rr > r0 - 1) return brass[0];
    if (rr > r0 - RIM) return rim(dx, dy, rr, r0);
    if (rr > r0 - RIM - 1) return brass[0];
    const sk = 1 - clamp(-dy / (r0 - RIM), 0, 1);
    const lit = bodyPx(a, o, x, y, cloud) ?? (cloud ? weatherPx(a, x, y, sk) : null);
    if (lit) return lit;
    const t = sk + (dith(x, y) - 0.5) * 0.22;
    const glow = a.warm * Math.max(0, 1 - Math.hypot(x - o.x, y - o.y) / (r0 * 0.9)) * 0.5;
    return [
      mix(low[0], top[0], t) + glow * 90,
      mix(low[1], top[1], t) + glow * 40,
      mix(low[2], top[2], t)
    ].map((v) => clamp(Math.round(v / 12) * 12, 0, 255));
  });
}
