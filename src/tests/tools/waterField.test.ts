import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../static/tilesets/painted/manifest.json';
import { decodePng } from '../../../tools/tileset/png.mjs';
import { art } from '../../../tools/tileset/bake.mjs';
import {
  OPEN_CELL,
  RAMP_STEPS,
  TONE_OFFSET,
  TONE_SCALE,
  WATER_SIZE
} from '../../../tools/tileset/water.mjs';

type Rgb = number[];
type Noise = (
  x: number,
  y: number,
  fx: number,
  fy: number,
  s: number,
  ox?: number,
  oy?: number
) => number;
const A = art(WATER_SIZE) as {
  waterCol: (x: number, y: number, kind: number, ph: number) => Rgb;
  pn: Noise;
  P: Record<string, Rgb[]>;
  dith: (x: number, y: number) => number;
};
const field = decodePng(
  readFileSync(new URL(`../../../static/tilesets/painted/${manifest.water.image}`, import.meta.url))
);
const KIND = { shallow_water: 1, water: 2, rapids: 3 };
const PHASES = [0, 0.26, 1.3, 3.9, 4.94];

function drawn(x: number, y: number, kind: keyof typeof KIND, ph: number): Rgb {
  const i = (y * WATER_SIZE + x) * 4;
  const ripple = A.pn(x, y, 0.085, 0.27, 33, 40, -ph * 0.9);
  const tone =
    field.rgba[i] / TONE_SCALE -
    TONE_OFFSET +
    (ripple > 0.7 ? 1 : ripple < 0.25 ? -0.5 : 0) +
    (A.pn(x, y, 0.11, 1.1, 39, 0, ph * 0.7) > 0.84 ? 0.8 : 0);
  const step = (t: number) =>
    Math.max(
      0,
      Math.min(
        5,
        Math.floor(Math.max(0, Math.min(RAMP_STEPS, t)) + 0.5 + (A.dith(x, y) - 0.5) * 0.45)
      )
    );
  if (kind === 'rapids') {
    const foam =
      A.pn(x, y, 0.21, 0.055, 35, 9, -ph * 1.7) +
      (A.pn(x, y, 0.5, 0.45, 39, 0, -ph * 2) - 0.5) * 0.4;
    if (foam > 0.8) return A.P.foam[2];
    if (foam > 0.68) return A.P.foam[1];
    if (foam > 0.6) return A.P.shallow[4];
    return A.P.deep[step(tone + 0.75)];
  }
  if (kind === 'water') return A.P.deep[step(tone)];
  return A.P.shallow[step(tone - (field.rgba[i + 1] >= OPEN_CELL ? 1 : 0))];
}

describe('the baked water field', () => {
  it('is as large as the manifest says', () => {
    expect([field.w, field.h]).toEqual([manifest.water.size, manifest.water.size]);
  });

  it.each(
    (['shallow_water', 'water', 'rapids'] as const).flatMap((kind) =>
      PHASES.map((ph) => [kind, ph] as const)
    )
  )(
    'gives %s at phase %s the colour the mockup paints there, on all but a sliver of pixels',
    (kind, ph) => {
      let off = 0;
      const samples = 3000;
      for (let n = 0; n < samples; n++) {
        const x = (n * 7919) % WATER_SIZE;
        const y = (n * 104729) % WATER_SIZE;
        if (drawn(x, y, kind, ph).join() !== A.waterCol(x, y, KIND[kind], ph).join()) off++;
      }
      expect(off / samples).toBeLessThan(0.03);
    }
  );
});
