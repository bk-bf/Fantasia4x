import type { WorldTile } from '../core/types';
import { chamferDistance } from './chamfer';

const WATER = new Set(['water', 'shallow_water', 'rapids']);

export const POND_AREA = 400;
const SHALLOWS = 8;
const SHALLOWS_WOBBLE = 2.4;
const DEEP_CORE = 3;
const TODAY_SHALLOWS = 6;
const BEACH = 3.6;
const BEACH_CLEAR_OF_STREAM = 4;
const MOUTH_REACH = 12;
const MOUTH_FLARE = 2.3;
const BANK_REACH = 1.5;
const DISTANCE_TIE = 1e-6;

export const isWet = (t: WorldTile): boolean => WATER.has(t.subType);
const isLowland = (t: WorldTile): boolean => !isWet(t) && t.terrainType !== 'mountain';

export function shoreHash(x: number, y: number, salt: number): number {
  let h =
    (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1274126177)) |
    0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function shoreNoise(x: number, y: number, salt: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let xf = x - xi;
  let yf = y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const a = shoreHash(xi, yi, salt) + (shoreHash(xi + 1, yi, salt) - shoreHash(xi, yi, salt)) * xf;
  const b =
    shoreHash(xi, yi + 1, salt) +
    (shoreHash(xi + 1, yi + 1, salt) - shoreHash(xi, yi + 1, salt)) * xf;
  return a + (b - a) * yf;
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const beachStretch = (x: number, y: number): number =>
  smooth(0.62, 0.74, shoreNoise(x / 12, y / 12, 505));

interface WaterBodies {
  id: Int32Array;
  sizes: number[];
}

export function stillWaters(world: WorldTile[][]): WaterBodies {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  const still = (i: number) => {
    const t = world[(i / w) | 0][i % w];
    return isWet(t) && !t.river;
  };
  const id = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (id[s] >= 0 || !still(s)) continue;
    const k = sizes.length;
    let size = 0;
    id[s] = k;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % w;
      const y = (i / w) | 0;
      size++;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1
      ]) {
        if (j < 0 || id[j] >= 0 || !still(j)) continue;
        id[j] = k;
        stack.push(j);
      }
    }
    sizes.push(size);
  }
  return { id, sizes };
}

export function shapeShores(
  world: WorldTile[][],
  setGround: (t: WorldTile, subType: string) => void
): void {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  if (w === 0) return;
  const reshape = (t: WorldTile, subType: string) => {
    setGround(t, subType);
    t.resources = {};
    delete t.growth;
  };
  const at = (i: number) => world[(i / w) | 0][i % w];
  const wetStream = (i: number) => isWet(at(i)) && !!at(i).river;
  const lakeOf = (b: WaterBodies) => (i: number) => b.id[i] >= 0 && b.sizes[b.id[i]] >= POND_AREA;

  const toLake = chamferDistance(w, h, lakeOf(stillWaters(world)));
  const toRiver = chamferDistance(w, h, wetStream);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = world[y][x];
      if (!isLowland(t) || toLake[i] > MOUTH_REACH) continue;
      const flare =
        MOUTH_FLARE * smooth(MOUTH_REACH, 1, toLake[i]) +
        (shoreNoise(x / 4, y / 4, 501) - 0.5) * 0.9;
      if (toRiver[i] > flare) continue;
      reshape(t, 'shallow_water');
      t.river = true;
    }

  const toShore = chamferDistance(w, h, (i) => !isWet(at(i)));
  const body = stillWaters(world);
  const widest = new Float64Array(body.sizes.length);
  for (let i = 0; i < w * h; i++)
    if (body.id[i] >= 0) widest[body.id[i]] = Math.max(widest[body.id[i]], toShore[i]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = world[y][x];
      if (t.subType !== 'water') continue;
      const reach = Math.min(
        SHALLOWS + SHALLOWS_WOBBLE * shoreNoise(x / 10, y / 10, 503),
        Math.max(TODAY_SHALLOWS, widest[body.id[i]] - DEEP_CORE)
      );
      if (toShore[i] < reach - DISTANCE_TIE) setGround(t, 'shallow_water');
    }

  const toLakeWater = chamferDistance(w, h, lakeOf(stillWaters(world)));
  const toStream = chamferDistance(w, h, wetStream);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = world[y][x];
      if (!isLowland(t)) continue;
      const stretch = beachStretch(x, y);
      if (stretch <= 0 || toStream[i] < BEACH_CLEAR_OF_STREAM) continue;
      const width =
        1 + (BEACH - 1) * stretch + (shoreNoise(x / 3.5, y / 3.5, 507) - 0.5) * 1.4 * stretch;
      if (toLakeWater[i] > width) continue;
      reshape(t, 'riverbank');
    }

  const toWater = chamferDistance(w, h, (i) => isWet(at(i)));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = world[y][x];
      if (isLowland(t) && t.subType !== 'riverbank' && toWater[y * w + x] < BANK_REACH)
        setGround(t, 'riverbank');
    }
}
