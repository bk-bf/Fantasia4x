import type { Heading } from './wind.js';

export const STILL_WATER_TILES = { from: 0, to: 4 };
export const ART_PER_UNIT = 2;
export const SEA_SLOTS = 15;

const TAU = Math.PI * 2;
const NOISE_PERIOD = 1024;
const MAX_STEP = 0.25;
const GRAVITY = 9.8;
const PACE = 0.55;
const SHORE_RATE = 1.3;
const RUN_LAG = 1.4;
const LAMBDA = [30, 19, 12, 8];
const ANGLE = [-0.45, -0.12, 0.22, 0.55];
const ROUGH_TURN = 1.25;
const CHOPPY_TURN = 2;
const DRIFT = { calm: 2, gale: 12 };
const RIPPLE_RATE = 0.26 * 8;
const RIPPLE = { drift: 0.9, period: 553 };
const GLINT = { drift: 0.7, period: 2253 };
const FIELD_PERIOD = 2048;
const RIPPLE_PX = (RIPPLE_RATE * RIPPLE.drift * FIELD_PERIOD) / RIPPLE.period;
const GLINT_PX = (RIPPLE_RATE * GLINT.drift * FIELD_PERIOD) / GLINT.period;
const SEICHE_SECS = 14;
const SWAY = { ripple: 10, glint: 4, lean: 1.6 };
const GUST_PACE = { calm: 5, gale: 19 };
const RAIN_PERIOD = 1000;

export interface SeaWeather {
  rain: number;
}

export function gustiness(wind: number, rain: number): number {
  return Math.min(1, 0.25 + wind * 0.6 + rain * 0.3);
}

export interface MapMotion {
  sway: boolean;
  waves: boolean;
  waveMix: number;
}

export function waterStill(tilePx: number): boolean {
  return tilePx >= STILL_WATER_TILES.from && tilePx < STILL_WATER_TILES.to;
}

export function waterBlockShift(artPerPx: number): number {
  return Math.max(0, Math.ceil(Math.log2(Math.max(1, artPerPx)) - 1e-6));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function seaFor(wind: number) {
  const u = smoothstep(0.1, 1, wind);
  const swell = lerp(1, 1.45, u);
  return {
    amp: [lerp(0.55, 0.9, u), lerp(0.28, 1.15, u), lerp(0.12, 1, u), lerp(0.05, 0.75, u)].map(
      (v) => v * swell
    ),
    a: [lerp(1.3, 2.6, u), lerp(1, 0.25, u), lerp(1, 1.6, u), lerp(0.12, 0.9, u)],
    b: [lerp(0.33, 0.6, u), lerp(0.45, 0.35, u)],
    speed: lerp(1, 1.6, u)
  };
}

function wrap(v: number, period: number): number {
  return ((v % period) + period) % period;
}

function turn(dir: Heading, angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [dir.x * c - dir.y * s, dir.x * s + dir.y * c];
}

export class WaveClock {
  waveT = 0;
  t = 0;
  drift = { x: 0, y: 0 };
  ripple = { x: 0, y: 0 };
  glint = { x: 0, y: 0 };
  gust = 0;
  private last: number | null = null;

  tick(nowMs: number, wind: number, dir: Heading, still: boolean): void {
    const secs = this.last === null ? 0 : Math.min(MAX_STEP, Math.max(0, nowMs - this.last) / 1000);
    this.last = nowMs;
    if (still) return;
    this.waveT += secs * seaFor(wind).speed;
    this.t += secs;
    const pace = lerp(DRIFT.calm, DRIFT.gale, Math.min(1, Math.max(0, wind)));
    this.drift.x += dir.x * pace * secs;
    this.drift.y += dir.y * pace * secs;
    const fresh = 0.4 + 1.2 * wind;
    const carry = (at: { x: number; y: number }, speed: number) => {
      at.x = wrap(at.x + dir.x * speed * secs, FIELD_PERIOD);
      at.y = wrap(at.y + dir.y * speed * secs, FIELD_PERIOD);
    };
    carry(this.ripple, RIPPLE_PX * fresh);
    carry(this.glint, GLINT_PX * (0.5 + wind));
    this.gust = wrap(this.gust + lerp(GUST_PACE.calm, GUST_PACE.gale, wind) * secs, NOISE_PERIOD);
  }

  uniforms(
    wind: number,
    dir: Heading,
    artPerPx: number,
    waveMix = 1,
    weather: SeaWeather = { rain: 0 }
  ): Float32Array {
    const sea = seaFor(wind);
    const perPx = artPerPx / ART_PER_UNIT;
    const fade = LAMBDA.map((l) => smoothstep(3, 7, l / perPx));
    const phase = LAMBDA.map((l) => wrap(this.waveT * Math.sqrt((GRAVITY * TAU) / l) * PACE, TAU));
    const rough = ANGLE.flatMap((a) => turn(dir, a * ROUGH_TURN));
    const choppy = ANGLE.flatMap((a) => turn(dir, a * CHOPPY_TURN));
    const shore = wrap(this.waveT * SHORE_RATE, TAU);
    const surge = 0.5 + 0.5 * Math.sin(shore + RUN_LAG);
    const n = (v: number) => wrap(v, NOISE_PERIOD);
    const { x: dx, y: dy } = this.drift;
    const ampSum = sea.amp.reduce((s, v) => s + v, 0);
    const chop = 0.6 * (sea.amp[2] + sea.amp[3]) * smoothstep(3, 7, 3.3 / perPx);
    const t = this.t;
    const sway = Math.sin((TAU * t) / SEICHE_SECS);
    const swayed = (at: { x: number; y: number }, reach: number) => [
      wrap(at.x + dir.x * sway * reach, FIELD_PERIOD),
      wrap(at.y + dir.y * sway * reach, FIELD_PERIOD)
    ];
    return Float32Array.from([
      ...phase,
      ...sea.amp.map((v, i) => v * fade[i]),
      ...rough,
      ...choppy,
      sea.a[0],
      Math.min(1, Math.max(0, (sea.a[1] - 0.25) / 0.75)),
      sea.a[2],
      sea.a[3],
      sea.b[0],
      sea.b[1],
      chop,
      ampSum,
      n(dx * 0.05),
      n(dy * 0.05),
      n(dx * 0.4),
      n(dy * 0.4),
      n(t * 0.6),
      n(-t * 0.35),
      n(t * 0.5),
      n(t * 0.35),
      shore,
      1.2 + 2.6 * sea.a[2] * 0.8 * surge,
      n(dx * 0.7),
      n(dy * 0.7),
      dir.x,
      dir.y,
      n(t * 0.3),
      ART_PER_UNIT,
      surge,
      weather.rain,
      wrap(t, RAIN_PERIOD),
      gustiness(wind, weather.rain),
      ...swayed(this.ripple, SWAY.ripple),
      ...swayed(this.glint, SWAY.glint),
      dir.x * sway * SWAY.lean,
      dir.y * sway * SWAY.lean,
      this.gust,
      waveMix
    ]);
  }
}
