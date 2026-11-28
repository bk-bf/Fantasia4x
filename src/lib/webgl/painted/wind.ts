import WIND from './wind.json';
import type { PaintedWind } from './manifest.js';

export const WIND_SHAPE = WIND;

const IDLE_PERIOD = 8 * Math.PI;
const MAX_STEP = 0.25;
const GUST_PERIOD = 256;
const FX_PERIOD = 2048;

export interface Heading {
  x: number;
  y: number;
}

export function heading(dx: number, dy: number): Heading {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export interface WindUniforms {
  u_wind: [number, number, number, number];
  u_windFrame: [number, number, number, number];
  u_windDir: [number, number];
  u_windPace: number;
  u_treeClock: number;
  u_basePerArt: number;
  u_treeVeil: [number, number, number];
}

const T = WIND.trees;

export class WindClock {
  strength = 0;
  dir: Heading = { x: 1, y: 0 };
  scroll = 0;
  idle = 0;
  clock = 0;
  travelled = 0;
  loops = 0;
  pivot = { x: 0, y: 0 };
  frame = { x: 0, y: 0 };
  private target = { strength: 0, dir: { x: 1, y: 0 } as Heading };
  private last: number | null = null;

  set(strength: number, dir: Heading): void {
    this.target = { strength, dir };
    if (this.last !== null) return;
    this.strength = strength;
    this.dir = dir;
  }

  get scale(): number {
    return Math.min(WIND.maxScale, this.strength / WIND.mockupStrength);
  }

  tick(nowMs: number): number {
    const secs = this.last === null ? 0 : Math.min(MAX_STEP, Math.max(0, nowMs - this.last) / 1000);
    this.last = nowMs;
    const k = Math.min(1, secs / WIND.ease);
    this.strength += (this.target.strength - this.strength) * k;
    const from = Math.atan2(this.dir.y, this.dir.x);
    const turn = Math.atan2(this.target.dir.y, this.target.dir.x) - from;
    const swing = (Math.atan2(Math.sin(turn), Math.cos(turn)) || 0) * k;
    const most = WIND.maxTurn * secs;
    const angle = from + Math.max(-most, Math.min(most, swing));
    this.dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const pace = 0.5 + 0.5 * Math.min(1, this.scale);
    this.scroll = (this.scroll + WIND.gust.speed * pace * secs) % GUST_PERIOD;
    this.idle = (this.idle + secs) % IDLE_PERIOD;
    this.clock = (this.clock + secs) % FX_PERIOD;
    this.travelled += WIND.pace * secs;
    this.loops += secs / WIND.loopSeconds;
    return secs;
  }

  pivotTo(x: number, y: number): void {
    const dx = x - this.pivot.x;
    const dy = y - this.pivot.y;
    const { x: cx, y: cy } = this.dir;
    this.frame = { x: this.frame.x + dx * cx + dy * cy, y: this.frame.y - dx * cy + dy * cx };
    this.pivot = { x, y };
  }

  uniforms(artTile: number, basePerArt: number): WindUniforms {
    return {
      u_wind: [this.strength, this.travelled, this.loops, artTile],
      u_windFrame: [this.pivot.x, this.pivot.y, this.frame.x, this.frame.y],
      u_windDir: [this.dir.x, this.dir.y],
      u_windPace: WIND.pace,
      u_treeClock: this.clock,
      u_basePerArt: basePerArt,
      u_treeVeil: [T.veil[0], T.veil[1], T.veil[2]]
    };
  }
}

function cell(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 65535) / 65535;
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const top = cell(ix, iy) + (cell(ix + 1, iy) - cell(ix, iy)) * fx;
  const bottom = cell(ix, iy + 1) + (cell(ix + 1, iy + 1) - cell(ix, iy + 1)) * fx;
  return top + (bottom - top) * fy;
}

export function gustAt(x: number, y: number, clock: Pick<WindClock, 'dir' | 'scroll'>): number {
  const { dir } = clock;
  const [a, b] = WIND.gustNoise;
  const along = (x * dir.x + y * dir.y) * WIND.gust.along;
  const across = (x * -dir.y + y * dir.x) * WIND.gust.across;
  const raw =
    along -
    across +
    valueNoise(x * a.fx, y * a.fy) * a.amp +
    valueNoise(x * b.fx, y * b.fy) * b.amp -
    clock.scroll;
  const p = ((raw % GUST_PERIOD) + GUST_PERIOD) % GUST_PERIOD;
  if (p < WIND.gust.onset) return 0;
  const s = Math.sin(((p - WIND.gust.onset) / WIND.gust.width) * Math.PI);
  return s * s;
}

export function leanAt(
  x: number,
  y: number,
  amp: number,
  clock: Pick<WindClock, 'dir' | 'scroll' | 'scale' | 'idle'>
): number {
  if (!clock.scale) return 0;
  const ph = x * WIND.phase[0] + y * WIND.phase[1];
  const g = gustAt(x, y, clock) * WIND.sway.gust;
  const flutter = (1 - Math.abs(clock.dir.x)) * Math.sin(clock.idle * WIND.sway.flutterRate + ph);
  const idle = Math.sin(clock.idle * WIND.sway.idleRate + ph) * WIND.sway.idle;
  return amp * clock.scale * (idle + g * (clock.dir.x + flutter));
}

export function swayTable(raw: unknown, spriteIds: Iterable<string>): PaintedWind {
  const table = (raw ?? {}) as Partial<PaintedWind>;
  const sway: Record<string, number> = { ...(table.sway ?? {}) };
  const grass = Object.entries(WIND.grass);
  for (const id of spriteIds) {
    if (sway[id]) continue;
    const match = grass.find(([prefix]) => id.startsWith(prefix));
    if (match) sway[id] = match[1];
  }
  return { sway, leafy: table.leafy ?? [], trees: table.trees ?? {}, fx: table.fx ?? {} };
}
