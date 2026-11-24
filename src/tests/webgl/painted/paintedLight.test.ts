import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRY_ART } from '../../../../tools/tileset/sources.mjs';
import { readPaintedLightFlag } from '$lib/webgl/painted/flag';
import {
  LIGHT_SQUASH,
  MAP_WEATHER,
  MAX_LIGHTS,
  TIMES,
  gradeForHour,
  mapWeather,
  packLights,
  stepFalloff
} from '$lib/webgl/painted/lightGrade';
import {
  TICKS_PER_GAME_HOUR,
  getAmbientLight,
  getAmbientTint
} from '$lib/game/services/EnvironmentService';

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
    expect(readPaintedLightFlag('?light=new', '1')).toBe(true);
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

const atHour = (hour: number) => {
  const turn = Math.round(hour * TICKS_PER_GAME_HOUR);
  return gradeForHour(getAmbientLight(turn), getAmbientTint(turn));
};

describe('time of day grade', () => {
  it('holds the mockup grades for day, dusk and night', () => {
    for (const time of ['day', 'dusk', 'night'] as const) {
      expect(TIMES[time].ambient).toEqual(mockup.TIMES[time].amb);
      expect(TIMES[time].strength).toBe(mockup.TIMES[time].lk);
      expect(TIMES[time].vignette).toBe(mockup.TIMES[time].vig);
    }
    expect(TIMES.day.radius).toBe(0.7);
  });

  it('is the plain day grade at noon, with no colour cast', () => {
    const g = atHour(12);
    expect(g.weights).toEqual([1, 0, 0]);
    expect(g.ambient).toEqual([1, 1, 1]);
  });

  it('is the mockup night grade at midnight', () => {
    const g = atHour(0);
    expect(g.weights).toEqual([0, 0, 1]);
    g.ambient.forEach((v, i) => expect(v).toBeCloseTo(mockup.TIMES.night.amb[i], 6));
  });

  it('crosses into dusk by the warmth of the hour and into night by its darkness', () => {
    const evening = atHour(19);
    expect(evening.weights[1]).toBeGreaterThan(0.9);
    expect(evening.weights[2]).toBe(0);
    const late = atHour(22);
    expect(late.weights[2]).toBeGreaterThan(0.5);
    for (const g of [evening, late]) expect(g.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('takes the map weather from the overlay the game draws', () => {
    expect(mapWeather('rain', false)).toBe('rain');
    expect(mapWeather('rain', true)).toBe('storm');
    expect(mapWeather('foggy_rain', false)).toBe('fog');
    expect(mapWeather('snowdust', false)).toBe('snow');
    expect(mapWeather('leaves', false)).toBe('clear');
    const storm = gradeForHour(1, [1, 1, 1], MAP_WEATHER.storm);
    expect(storm.saturation).toBeCloseTo(Math.pow(0.72, 2.2), 9);
    expect(storm.brightness).toBeCloseTo(0.86, 9);
    expect(gradeForHour(1, [1, 1, 1]).saturation).toBe(1);
  });
});

describe('light list', () => {
  const fire = { x: 10, y: 10, color: [1, 0.55, 0.22] as Rgb, radius: 6, intensity: 1.1 };

  it('packs a light without a sprite at its tile centre, its reach in art pixels', () => {
    const out = new Float32Array(MAX_LIGHTS * 8);
    const n = packLights([fire], { x: 0, y: 0, w: 30, h: 20 }, 32, 0, out);
    expect(n).toBe(1);
    expect([...out.slice(0, 8)].map((v) => +v.toFixed(4))).toEqual([
      336, 336, 192, 134.4, 1, 0.55, 0.22, 1.1
    ]);
  });

  it('places a sprite light at its flame with the mockup reach and full strength', () => {
    const out = new Float32Array(MAX_LIGHTS * 8);
    const lamp = { ...fire, art: { x: 16, y: 13, rad: 170, night: true } };
    packLights([lamp], { x: 0, y: 0, w: 30, h: 20 }, 32, 0, out);
    expect([...out.slice(0, 8)].map((v) => +v.toFixed(4))).toEqual([
      336, 333, 170, 0, 1, 0.55, 0.22, 1
    ]);
  });

  it('leaves out lights that cannot reach the view', () => {
    const out = new Float32Array(MAX_LIGHTS * 8);
    const far = { ...fire, x: 100 };
    expect(packLights([far, fire], { x: 0, y: 0, w: 30, h: 20 }, 32, 0, out)).toBe(1);
  });

  it('keeps at most the uniform array of lights', () => {
    const out = new Float32Array(MAX_LIGHTS * 8);
    const many = Array.from({ length: MAX_LIGHTS + 5 }, () => fire);
    expect(packLights(many, { x: 0, y: 0, w: 30, h: 20 }, 32, 0, out)).toBe(MAX_LIGHTS);
  });
});
