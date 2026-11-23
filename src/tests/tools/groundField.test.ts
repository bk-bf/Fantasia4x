import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../static/tilesets/painted/manifest.json';
import { decodePng } from '../../../tools/tileset/png.mjs';
import { art } from '../../../tools/tileset/bake.mjs';
import {
  BLOCK_ROWS,
  FAR_STEP,
  FIELD_SIZE,
  GRASS_SEED,
  META_COLS,
  NO_PIECE,
  OFFSET_STEP,
  PIECES,
  RIM_BYTES,
  SHADE_BIAS,
  SHADE_BITS,
  SOIL_SEED,
  coverByte,
  densityByte,
  groundKinds
} from '../../../tools/tileset/ground.mjs';

type Rgb = number[];
type Ground = { id: string; f: (x: number, y: number) => Rgb; dec?: [string, number, Rgb[]?][] };
const A = art(FIELD_SIZE) as {
  covAt: (x: number, y: number) => number;
  soilShade: (x: number, y: number, s: number) => number;
  grassShade: (x: number, y: number, s: number) => number;
  GROUND: Ground[];
};
const committed = (name: string) =>
  decodePng(readFileSync(new URL(`../../../static/tilesets/painted/${name}`, import.meta.url)));
const field = committed(manifest.ground.field.image);
const far = committed(manifest.ground.far.image);
const atlas = committed('atlas.png');
const sprites: Record<string, { x: number; y: number }> = manifest.sprites;
const kindsOut: Record<string, { ramps: string; bare?: string; tufts?: { density: number } }> =
  manifest.ground.kinds;

const SAMPLES = 3000;
const samples = Array.from({ length: SAMPLES }, (_, n) => [
  (n * 7919) % FIELD_SIZE,
  (n * 104729) % FIELD_SIZE
]);
const wrap = (v: number) => ((v % FIELD_SIZE) + FIELD_SIZE) % FIELD_SIZE;
const texel = (x: number, y: number) => {
  const i = (wrap(y) * FIELD_SIZE + wrap(x)) * 4;
  return [...field.rgba.subarray(i, i + 4)];
};
const atlasAt = (x: number, y: number) => {
  const i = (y * atlas.w + x) * 4;
  return [...atlas.rgba.subarray(i, i + 3)];
};

function drawn(id: string, x: number, y: number): Rgb {
  const at = sprites[kindsOut[id].ramps];
  const meta = (col: number) => atlasAt(at.x + col, at.y + BLOCK_ROWS.meta);
  const amount = meta(META_COLS.amount)[0];
  const cover = texel(x, y)[1];
  const grass = cover < amount;
  const shift = meta(grass ? META_COLS.grass : META_COLS.soil);
  const packed = texel(x + shift[0] * OFFSET_STEP, y + shift[1] * OFFSET_STEP)[0];
  const shade = grass ? (packed >> SHADE_BITS) & 7 : packed & 7;
  const c = atlasAt(at.x + shade, at.y + (grass ? BLOCK_ROWS.grass : BLOCK_ROWS.soil));
  const dark = (k: number) => [c[0] * k, c[1] * k, Math.min(255, c[2] * (k + 0.1))];
  if (grass) return cover > amount - RIM_BYTES ? dark(0.7) : c;
  return texel(x, y - 3)[1] < amount ? dark(0.68) : c;
}

const close = (a: Rgb, b: Rgb) => a.every((v, i) => Math.abs(v - b[i]) <= 1);

describe('the baked ground field', () => {
  it('is as large as the manifest says', () => {
    expect([field.w, field.h]).toEqual([manifest.ground.field.size, manifest.ground.field.size]);
  });

  it('holds the soil and grass shades in red and the cover in green', () => {
    for (const [x, y] of samples) {
      const [r, g] = texel(x, y);
      expect(r & 7).toBe(A.soilShade(x, y, SOIL_SEED) + SHADE_BIAS);
      expect(r >> SHADE_BITS).toBe(A.grassShade(x, y, GRASS_SEED) + SHADE_BIAS);
      expect(g).toBe(coverByte(A.covAt(x, y)));
    }
  });

  it.each(['tree'])(
    'colours %s through its ramps as the mockup paints it, on all but a sliver of pixels',
    (id) => {
      const g = A.GROUND.find((k) => k.id === id)!;
      const off = samples.filter(([x, y]) => !close(drawn(id, x, y), g.f(x, y))).length;
      expect(off / SAMPLES).toBeLessThan(0.02);
    }
  );

  it('names a known piece on every piece pixel and leaves the rest bare', () => {
    for (const [x, y] of samples) {
      const [, , b, a] = texel(x, y);
      const type = b >> 4;
      expect(type <= PIECES.length).toBe(true);
      if (type === 0) expect(a).toBe(NO_PIECE);
    }
    expect(PIECES.some((p) => p.decal === 'tuft')).toBe(false);
  });
});

describe('the far ground field', () => {
  it('holds the rounded mean shades and cover of each 8 by 8 block of the field', () => {
    expect([far.w, far.h]).toEqual([FIELD_SIZE / FAR_STEP, FIELD_SIZE / FAR_STEP]);
    for (const [x, y] of samples.slice(0, 300)) {
      const [bx, by] = [Math.floor(x / FAR_STEP), Math.floor(y / FAR_STEP)];
      let soil = 0,
        grass = 0,
        cover = 0;
      for (let j = 0; j < FAR_STEP; j++)
        for (let i = 0; i < FAR_STEP; i++) {
          const [r, g] = texel(bx * FAR_STEP + i, by * FAR_STEP + j);
          soil += r & 7;
          grass += r >> SHADE_BITS;
          cover += g;
        }
      const n = FAR_STEP * FAR_STEP;
      const at = (by * far.w + bx) * 4;
      expect([...far.rgba.subarray(at, at + 4)]).toEqual([
        Math.round(soil / n) | (Math.round(grass / n) << SHADE_BITS),
        Math.round(cover / n),
        0,
        NO_PIECE
      ]);
    }
  });
});

describe('each ground kind in the manifest', () => {
  const kinds = groundKinds(A.GROUND as never);

  it('carries the density of every piece it scatters and of nothing else', () => {
    for (const k of kinds) {
      const at = sprites[kindsOut[k.id].ramps];
      PIECES.forEach((_, t) =>
        expect([k.id, t, atlasAt(at.x + t, at.y + BLOCK_ROWS.meta)[0]]).toEqual([
          k.id,
          t,
          densityByte(k.density[t])
        ])
      );
    }
  });

  it('draws tufts as sprites where its ground had them, and a bare patch where it has no layers', () => {
    for (const k of kinds) {
      expect([k.id, kindsOut[k.id].tufts?.density]).toEqual([k.id, k.tuft?.density]);
      expect([k.id, kindsOut[k.id].bare === undefined]).toEqual([k.id, k.layers !== null]);
    }
  });
});
