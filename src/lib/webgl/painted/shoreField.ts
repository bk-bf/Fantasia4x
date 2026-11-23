export const LAND = 0;
export const SHALLOW = 1;
export const DEEP = 2;
export const DIST_STEPS = 32;

const FULL = 255;
const DIAGONAL = Math.SQRT2;
const RAMP_TILES = 3;
const SHALLOW_TOP = 0.42;
const DEEP_FLOOR = 0.58;
const BLUR_REACH = 2;

function distanceTo(isSeed: (i: number) => boolean, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h).fill(Infinity);
  for (let i = 0; i < w * h; i++) if (isSeed(i)) d[i] = 0;
  const relax = (i: number, x: number, y: number, cost: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const via = d[y * w + x] + cost;
    if (via < d[i]) d[i] = via;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      relax(i, x - 1, y, 1);
      relax(i, x - 1, y - 1, DIAGONAL);
      relax(i, x, y - 1, 1);
      relax(i, x + 1, y - 1, DIAGONAL);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      relax(i, x + 1, y, 1);
      relax(i, x + 1, y + 1, DIAGONAL);
      relax(i, x, y + 1, 1);
      relax(i, x - 1, y + 1, DIAGONAL);
    }
  return d;
}

function ramp(tiles: number): number {
  return Math.min(1, Math.max(0, (tiles - 1) / RAMP_TILES));
}

function blurOverWater(raw: Float32Array, water: Uint8Array, w: number, h: number): Float32Array {
  const pass = (src: Float32Array, weight: Float32Array, horizontal: boolean) => {
    const sum = new Float32Array(w * h);
    const count = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let k = -BLUR_REACH; k <= BLUR_REACH; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          s += src[j] * weight[j];
          n += weight[j];
        }
        sum[y * w + x] = n > 0 ? s / n : 0;
        count[y * w + x] = n;
      }
    return { sum, count };
  };
  const mask = Float32Array.from(water);
  const across = pass(raw, mask, true);
  const down = pass(across.sum, across.count, false);
  return down.sum;
}

export function shoreField(classes: Uint8Array, w: number, h: number): Uint8Array {
  const toLand = distanceTo((i) => classes[i] === LAND, w, h);
  const toShallow = distanceTo((i) => classes[i] !== DEEP, w, h);
  const water = new Uint8Array(w * h);
  const raw = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (classes[i] === LAND) continue;
    water[i] = 1;
    raw[i] =
      classes[i] === DEEP
        ? DEEP_FLOOR + (1 - DEEP_FLOOR) * ramp(toShallow[i])
        : SHALLOW_TOP * ramp(toLand[i]);
  }
  const depth = blurOverWater(raw, water, w, h);
  const out = new Uint8Array(w * h * 2);
  for (let i = 0; i < w * h; i++) {
    out[i * 2] = Math.min(FULL, Math.round(toLand[i] * DIST_STEPS));
    out[i * 2 + 1] = water[i] ? Math.round(Math.min(1, depth[i]) * FULL) : 0;
  }
  return out;
}
