import { clamp } from '../noise';
import type { Rgb } from '../palette';

export interface FxGrade {
  night: number;
  dusk: number;
}

const AMB = { dusk: [0.86, 0.6, 0.56], night: [0.24, 0.29, 0.5] };
const GRADE_STEPS = 16;
const GRADE_EVERY_MS = 1000;

let gradeKey = '';
let gradeAt = -Infinity;
let gen = 0;
let ambient: Rgb = [1, 1, 1];

const step = (v: number) => Math.round(v * GRADE_STEPS) / GRADE_STEPS;

function mul(g: FxGrade): Rgb {
  const n = g.night;
  const d = g.dusk;
  return [0, 1, 2].map((i) => n * AMB.night[i] + (1 - n) * (d * AMB.dusk[i] + (1 - d)));
}

export function setGrade(g: FxGrade, now: number): boolean {
  const q = { night: step(g.night), dusk: step(g.dusk) };
  const key = `${q.night}|${q.dusk}`;
  if (key === gradeKey || now - gradeAt < GRADE_EVERY_MS) return false;
  gradeKey = key;
  gradeAt = now;
  gen++;
  ambient = mul(q);
  return true;
}

export const gradeGen = (): number => gen;

export const ambientNow = (): Rgb => ambient;

export function css(c: Rgb, e: number): string {
  const m = ambient;
  const k = e / 255;
  return `rgb(${c.map((v, i) => Math.min(255, Math.round(v * (k + m[i] * (1 - k))))).join(' ')})`;
}

export const gradeFromWeights = (w: readonly number[]): FxGrade => {
  const night = clamp(w[2], 0, 1);
  return { night, dusk: night < 1 ? clamp(w[1] / (1 - night), 0, 1) : 0 };
};
