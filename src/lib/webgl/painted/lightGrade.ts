import { dith, hash } from '../../pixelArt/noise.js';

export type Rgb = [number, number, number];

export interface LightGrade {
  ambient: Rgb;
  strength: number;
  vignette: number;
  radius: number;
  flicker: number;
}

export interface PointLight {
  x: number;
  y: number;
  color: Rgb;
  radius: number;
  intensity: number;
  flicker?: boolean;
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const LIGHT_STEPS = 7;
export const LIGHT_SQUASH = 1.25;
export const LIGHT_CEIL = 1.5;
export const MAX_LIGHTS = 64;
export const FLICKER_RATE = 6;
const FLICKER_RADII = [0.92, 1, 1.08];
const FLICKER_SEED = 7;

const NIGHT: LightGrade = {
  ambient: [0.24, 0.29, 0.5],
  strength: 1,
  vignette: 0.24,
  radius: 1,
  flicker: 1
};
const DUSK: LightGrade = {
  ambient: [0.86, 0.6, 0.56],
  strength: 0.6,
  vignette: 0.2,
  radius: 1,
  flicker: 1
};
const DAY: LightGrade = {
  ambient: [1, 1, 1],
  strength: 0.22,
  vignette: 0.16,
  radius: 0.7,
  flicker: 0
};

const ANCHORS: ReadonlyArray<{ light: number; grade: LightGrade }> = [
  { light: 0.15, grade: NIGHT },
  { light: 0.5, grade: DUSK },
  { light: 1, grade: DAY }
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function blend(a: LightGrade, b: LightGrade, t: number): LightGrade {
  return {
    ambient: [
      lerp(a.ambient[0], b.ambient[0], t),
      lerp(a.ambient[1], b.ambient[1], t),
      lerp(a.ambient[2], b.ambient[2], t)
    ],
    strength: lerp(a.strength, b.strength, t),
    vignette: lerp(a.vignette, b.vignette, t),
    radius: lerp(a.radius, b.radius, t),
    flicker: lerp(a.flicker, b.flicker, t)
  };
}

export function gradeForLight(light: number, env: Rgb = [1, 1, 1]): LightGrade {
  let g = ANCHORS[ANCHORS.length - 1].grade;
  if (light <= ANCHORS[0].light) g = ANCHORS[0].grade;
  else
    for (let i = 1; i < ANCHORS.length; i++) {
      const lo = ANCHORS[i - 1];
      const hi = ANCHORS[i];
      if (light > hi.light) continue;
      g = blend(lo.grade, hi.grade, (light - lo.light) / (hi.light - lo.light));
      break;
    }
  return { ...g, ambient: [g.ambient[0] * env[0], g.ambient[1] * env[1], g.ambient[2] * env[2]] };
}

export function stepFalloff(d: number, x: number, y: number): number {
  if (d >= 1) return 0;
  return Math.floor((1 - d) * (1 - d) * LIGHT_STEPS + dith(x, y)) / LIGHT_STEPS;
}

export function packLights(
  lights: readonly PointLight[],
  view: TileRect,
  grade: LightGrade,
  artTile: number,
  time: number,
  out: Float32Array
): number {
  const tick = Math.floor(time * FLICKER_RATE);
  let n = 0;
  for (let i = 0; i < lights.length && n < MAX_LIGHTS; i++) {
    const l = lights[i];
    const pick = FLICKER_RADII[Math.floor(hash(tick, i, FLICKER_SEED) * FLICKER_RADII.length)];
    const wobble = l.flicker ? 1 + (pick - 1) * grade.flicker : 1;
    const r = l.radius * grade.radius * wobble;
    const cx = l.x + 0.5;
    const cy = l.y + 0.5;
    if (cx + r < view.x || cx - r > view.x + view.w) continue;
    if (cy + r < view.y || cy - r > view.y + view.h) continue;
    out.set([cx * artTile, cy * artTile, r * artTile, l.intensity * grade.strength], n * 8);
    out.set([l.color[0], l.color[1], l.color[2], 0], n * 8 + 4);
    n++;
  }
  return n;
}
