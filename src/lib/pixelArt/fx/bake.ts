import { clamp } from '../noise';
import type { Rgb } from '../palette';
import type { Spr } from './spr';

export interface FxGrade {
  night: number;
  dusk: number;
}

const AMB = { dusk: [0.86, 0.6, 0.56], night: [0.24, 0.29, 0.5] };

let gradeKey = '';
let gen = 0;
let ambient: Rgb = [1, 1, 1];
const slots = new Map<number, Slot>();
const ids = new WeakMap<Spr, number>();
let nextId = 1;

const GRADE_STEPS = 16;
const GRADE_EVERY_MS = 1000;
let gradeAt = -Infinity;

const step = (v: number) => Math.round(v * GRADE_STEPS) / GRADE_STEPS;

export function setGrade(g: FxGrade, now: number): boolean {
  const q = { night: step(g.night), dusk: step(g.dusk) };
  const key = `${q.night}|${q.dusk}`;
  if (key === gradeKey || now - gradeAt < GRADE_EVERY_MS) return false;
  gradeKey = key;
  gradeAt = now;
  gen++;
  ambient = mul(q);
  resetAtlas();
  return true;
}

export const gradeGen = (): number => gen;

function mul(g: FxGrade): Rgb {
  const n = g.night;
  const d = g.dusk;
  return [0, 1, 2].map((i) => n * AMB.night[i] + (1 - n) * (d * AMB.dusk[i] + (1 - d)));
}

function sprId(s: Spr): number {
  let id = ids.get(s);
  if (!id) {
    id = nextId++;
    ids.set(s, id);
  }
  return id;
}

export interface Slot {
  x: number;
  y: number;
}

const ATLAS = 1024;
let atlas: HTMLCanvasElement | null = null;
let atlasG: CanvasRenderingContext2D | null = null;
let mirror: ImageData | null = null;
let shelfX = 0;
let shelfY = 0;
let shelfH = 0;
let epoch = 0;
let dirty: [number, number, number, number] | null = null;

function resetAtlas(): void {
  slots.clear();
  shelfX = shelfY = shelfH = 0;
  epoch++;
  dirty = null;
}

function alloc(w: number, h: number): Slot | null {
  if (shelfX + w > ATLAS) {
    shelfY += shelfH;
    shelfX = 0;
    shelfH = 0;
  }
  if (w > ATLAS || shelfY + h > ATLAS) return null;
  const at = { x: shelfX, y: shelfY };
  shelfX += w + 1;
  shelfH = Math.max(shelfH, h + 1);
  return at;
}

function grow(x0: number, y0: number, x1: number, y1: number): void {
  dirty = dirty
    ? [
        Math.min(dirty[0], x0),
        Math.min(dirty[1], y0),
        Math.max(dirty[2], x1),
        Math.max(dirty[3], y1)
      ]
    : [x0, y0, x1, y1];
}

function bake(s: Spr, at: Slot, m: Rgb, d: Uint8ClampedArray): void {
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const col = s.c[y * s.w + x];
      const p = ((at.y + y) * ATLAS + at.x + x) * 4;
      if (!col) {
        d.fill(0, p, p + 4);
        continue;
      }
      const k = s.e[y * s.w + x] / 255;
      for (let j = 0; j < 3; j++) d[p + j] = Math.min(255, col[j] * (k + m[j] * (1 - k)));
      d[p + 3] = 255;
    }
  grow(at.x, at.y, at.x + s.w, at.y + s.h);
}

export function atlasCanvas(): HTMLCanvasElement | null {
  if (!atlas) {
    atlas = document.createElement('canvas');
    atlas.width = atlas.height = ATLAS;
    atlasG = atlas.getContext('2d');
    mirror = atlasG?.createImageData(ATLAS, ATLAS) ?? null;
  }
  return mirror ? atlas : null;
}

export const atlasEpoch = (): number => epoch;

export function tex(s: Spr): Slot | null {
  if (!atlasCanvas() || !mirror) return null;
  const id = sprId(s);
  const had = slots.get(id);
  if (had) return had;
  let at = alloc(s.w, s.h);
  if (!at) {
    resetAtlas();
    at = alloc(s.w, s.h);
    if (!at) return null;
  }
  bake(s, at, ambient, mirror.data);
  slots.set(id, at);
  return at;
}

export function flushAtlas(): void {
  if (!dirty || !atlasG || !mirror) return;
  const [x0, y0, x1, y1] = dirty;
  atlasG.putImageData(mirror, 0, 0, x0, y0, x1 - x0, y1 - y0);
  dirty = null;
}

export function css(c: Rgb, e: number): string {
  const m = ambient;
  const k = e / 255;
  return `rgb(${c.map((v, i) => Math.min(255, Math.round(v * (k + m[i] * (1 - k))))).join(' ')})`;
}

export const gradeFromWeights = (w: readonly number[]): FxGrade => {
  const night = clamp(w[2], 0, 1);
  return { night, dusk: night < 1 ? clamp(w[1] / (1 - night), 0, 1) : 0 };
};
