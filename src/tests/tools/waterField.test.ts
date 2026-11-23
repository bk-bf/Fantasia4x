import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../static/tilesets/painted/manifest.json';
import { decodePng } from '../../../tools/tileset/png.mjs';
import { art } from '../../../tools/tileset/bake.mjs';
import {
  OPEN_CELL,
  RAMP_STEPS,
  RAPIDS,
  RAPIDS_SHIFT,
  TONE_OFFSET,
  TONE_SCALE,
  WATER_SIZE
} from '../../../tools/tileset/water.mjs';

type Rgb = number[];
const A = art(WATER_SIZE) as {
  GROUND: { id: string; f: (x: number, y: number) => Rgb }[];
  P: Record<string, Rgb[]>;
  dith: (x: number, y: number) => number;
};
const field = decodePng(
  readFileSync(new URL(`../../../static/tilesets/painted/${manifest.water.image}`, import.meta.url))
);
const baked = (id: string) => A.GROUND.find((g) => g.id === id)!.f;

function drawn(x: number, y: number, kind: 'shallow_water' | 'water' | 'rapids'): Rgb {
  const i = (y * WATER_SIZE + x) * 4;
  const bits = field.rgba[i + 1];
  const tone = field.rgba[i] / TONE_SCALE - TONE_OFFSET;
  const step = (t: number) =>
    Math.max(
      0,
      Math.min(
        5,
        Math.floor(Math.max(0, Math.min(RAMP_STEPS, t)) + 0.5 + (A.dith(x, y) - 0.5) * 0.45)
      )
    );
  if (kind === 'rapids') {
    const rapids = (bits >> RAPIDS_SHIFT) & 3;
    if (rapids === RAPIDS.crest) return A.P.foam[2];
    if (rapids === RAPIDS.foam) return A.P.foam[1];
    if (rapids === RAPIDS.streak) return A.P.shallow[4];
    return A.P.deep[step(tone + 0.75)];
  }
  if (kind === 'water') return A.P.deep[step(tone)];
  return A.P.shallow[step(tone - (bits >= OPEN_CELL ? 1 : 0))];
}

describe('the baked water field', () => {
  it('is as large as the manifest says', () => {
    expect([field.w, field.h]).toEqual([manifest.water.size, manifest.water.size]);
  });

  it.each(['shallow_water', 'water', 'rapids'] as const)(
    'gives %s the colour the bake paints there, on all but a sliver of pixels',
    (kind) => {
      const f = baked(kind);
      let off = 0;
      const samples = 3000;
      for (let n = 0; n < samples; n++) {
        const x = (n * 7919) % WATER_SIZE;
        const y = (n * 104729) % WATER_SIZE;
        if (drawn(x, y, kind).join() !== f(x, y).join()) off++;
      }
      expect(off / samples).toBeLessThan(0.03);
    }
  );
});
