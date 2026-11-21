import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRY_ART } from '../../../../tools/tileset/sources.mjs';
import { readPaintedLightFlag } from '$lib/webgl/painted/flag';
import {
  LIGHT_SQUASH,
  MAX_LIGHTS,
  gradeForLight,
  packLights,
  stepFalloff,
  type LightGrade
} from '$lib/webgl/painted/lightGrade';

type Rgb = [number, number, number];
type MockupLight = { x: number; y: number; col: Rgb };
type Mockup = {
  lightAdd: (
    r: { W: number; H: number },
    l: MockupLight,
    L: Float32Array,
    rad: number,
    lk: number
  ) => void;
  TIMES: Record<'day' | 'dusk' | 'night', { amb: Rgb; lk: number; vig: number }>;
};

const ART = join(process.cwd(), 'tools/tileset/art');
const mockup: Mockup = new Function(
  `'use strict';\n${REGISTRY_ART.slice(0, 6)
    .map((f) => readFileSync(join(ART, f), 'utf8').replace(/^'use strict';\n/, ''))
    .join('\n;')}\nreturn { lightAdd, TIMES };`
)();

const W = 96;
const H = 80;

function ours(l: MockupLight, rad: number, lk: number): Float32Array {
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - l.x, (y - l.y) * LIGHT_SQUASH) / rad;
      const q = stepFalloff(d, x, y) * lk;
      for (let c = 0; c < 3; c++) out[(y * W + x) * 3 + c] = l.col[c] * q;
    }
  return out;
}

describe('painted light switch', () => {
  it('is on with the painted tiles unless turned off', () => {
    expect(readPaintedLightFlag('', null)).toBe(true);
    expect(readPaintedLightFlag('?painted=1', null)).toBe(true);
    expect(readPaintedLightFlag('?light=old', null)).toBe(false);
    expect(readPaintedLightFlag('', '0')).toBe(false);
  });
});

describe('stepped point light', () => {
  it.each([
    [{ x: 40, y: 38, col: [1, 0.6, 0.24] as Rgb }, 30, 1],
    [{ x: 12.5, y: 70, col: [0.4, 0.8, 1] as Rgb }, 52, 0.6],
    [{ x: 60, y: 20, col: [1, 0.55, 0.22] as Rgb }, 21, 0.22]
  ])('matches the mockup lightAdd at every pixel of a light at %o', (l, rad, lk) => {
    const theirs = new Float32Array(W * H * 3);
    mockup.lightAdd({ W, H }, l, theirs, rad, lk);
    const mine = ours(l, rad, lk);
    for (let i = 0; i < theirs.length; i++) expect(mine[i]).toBeCloseTo(theirs[i], 6);
    expect(theirs.some((v) => v > 0)).toBe(true);
  });

  it('cuts the falloff into seven steps', () => {
    const levels = new Set<number>();
    for (let x = 0; x < 64; x++) levels.add(stepFalloff(x / 64, x, 0));
    expect([...levels].every((q) => Number.isInteger(q * 7))).toBe(true);
    expect(stepFalloff(1, 0, 0)).toBe(0);
  });
});

describe('time of day grade', () => {
  const expectGrade = (g: LightGrade, t: { amb: Rgb; lk: number; vig: number }) => {
    g.ambient.forEach((v, i) => expect(v).toBeCloseTo(t.amb[i], 6));
    expect(g.strength).toBeCloseTo(t.lk, 6);
    expect(g.vignette).toBeCloseTo(t.vig, 6);
  };

  it('is the mockup grade at full day, dusk and night light', () => {
    expectGrade(gradeForLight(1), mockup.TIMES.day);
    expectGrade(gradeForLight(0.5), mockup.TIMES.dusk);
    expectGrade(gradeForLight(0.15), mockup.TIMES.night);
    expectGrade(gradeForLight(0.05), mockup.TIMES.night);
  });

  it('blends between grades by light level', () => {
    const g = gradeForLight(0.75);
    const { day, dusk } = mockup.TIMES;
    g.ambient.forEach((v, i) => expect(v).toBeCloseTo((day.amb[i] + dusk.amb[i]) / 2, 6));
    expect(g.radius).toBeCloseTo(0.85, 6);
  });

  it('shrinks lights by day and stops their flicker', () => {
    expect(gradeForLight(1).radius).toBeCloseTo(0.7, 6);
    expect(gradeForLight(1).flicker).toBe(0);
    expect(gradeForLight(0.3).radius).toBe(1);
  });

  it('carries the season and weather tint on the ambient', () => {
    const g = gradeForLight(1, [0.9, 0.95, 1.1]);
    expect(g.ambient).toEqual([0.9, 0.95, 1.1]);
  });
});

describe('light list', () => {
  const night = gradeForLight(0.15);
  const fire = { x: 10, y: 10, color: [1, 0.55, 0.22] as Rgb, radius: 6, intensity: 1.1 };

  it('packs position, radius and strength in art pixels', () => {
    const out = new Float32Array(MAX_LIGHTS * 8);
    const n = packLights([fire], { x: 0, y: 0, w: 30, h: 20 }, night, 32, 0, out);
    expect(n).toBe(1);
    expect([...out.slice(0, 8)].map((v) => +v.toFixed(4))).toEqual([
      336, 336, 192, 1.1, 1, 0.55, 0.22, 0
    ]);
  });

  it('leaves out lights that cannot reach the view', () => {
    const out = new Float32Array(MAX_LIGHTS * 8);
    const far = { ...fire, x: 100 };
    expect(packLights([far, fire], { x: 0, y: 0, w: 30, h: 20 }, night, 32, 0, out)).toBe(1);
  });

  it('keeps at most the uniform array of lights', () => {
    const out = new Float32Array(MAX_LIGHTS * 8);
    const many = Array.from({ length: MAX_LIGHTS + 5 }, () => fire);
    expect(packLights(many, { x: 0, y: 0, w: 30, h: 20 }, night, 32, 0, out)).toBe(MAX_LIGHTS);
  });
});
