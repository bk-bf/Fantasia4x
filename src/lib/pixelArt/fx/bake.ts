import { clamp } from '../noise';
import type { Rgb } from '../palette';
import type { Spr } from './spr';

export interface FxGrade {
  night: number;
  dusk: number;
}

const AMB = { dusk: [0.86, 0.6, 0.56], night: [0.24, 0.29, 0.5] };
const CACHE_LIMIT = 4000;

let gradeKey = '';
let gen = 0;
let ambient: Rgb = [1, 1, 1];
const baked = new Map<number, HTMLCanvasElement>();
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
  baked.clear();
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

function bake(s: Spr, m: Rgb): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = s.w;
  c.height = s.h;
  const g = c.getContext('2d');
  if (!g) return c;
  const im = g.createImageData(s.w, s.h);
  const d = im.data;
  for (let i = 0, p = 0; i < s.c.length; i++, p += 4) {
    const col = s.c[i];
    if (!col) continue;
    const k = s.e[i] / 255;
    for (let j = 0; j < 3; j++) d[p + j] = Math.min(255, col[j] * (k + m[j] * (1 - k)));
    d[p + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}

export function tex(s: Spr): HTMLCanvasElement {
  const key = sprId(s);
  let c = baked.get(key);
  if (c) return c;
  if (baked.size >= CACHE_LIMIT) baked.clear();
  c = bake(s, ambient);
  baked.set(key, c);
  return c;
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
