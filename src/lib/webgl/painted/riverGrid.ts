export interface RiverTiles {
  river: Uint8Array;
  down: Int8Array;
  discharge: Float32Array;
  slope: Float32Array;
}

export function riverTiles(n: number): RiverTiles {
  return {
    river: new Uint8Array(n),
    down: new Int8Array(n).fill(-1),
    discharge: new Float32Array(n),
    slope: new Float32Array(n)
  };
}

export interface Centres {
  w: number;
  h: number;
  is: Uint8Array;
  down: Int32Array;
  list: Int32Array;
  discharge: Float32Array;
  slope: Float32Array;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function downTile(i: number, code: number, w: number, h: number): number {
  const x = (i % w) + (code % 3) - 1;
  const y = ((i / w) | 0) + Math.floor(code / 3) - 1;
  if (code === 4 || x < 0 || y < 0 || x >= w || y >= h) return -1;
  return y * w + x;
}

export function centresOf(w: number, h: number, water: Uint8Array, tiles: RiverTiles): Centres {
  const n = w * h;
  const c: Centres = {
    w,
    h,
    is: new Uint8Array(n),
    down: new Int32Array(n).fill(-1),
    list: new Int32Array(0),
    discharge: new Float32Array(n),
    slope: new Float32Array(n)
  };
  const list: number[] = [];
  for (let i = 0; i < n; i++) {
    if (tiles.down[i] < 0 || !tiles.river[i] || !water[i]) continue;
    const p = downTile(i, tiles.down[i], w, h);
    if (p < 0) continue;
    c.is[i] = 1;
    c.down[i] = p;
    c.discharge[i] = Math.max(1, tiles.discharge[i]);
    c.slope[i] = tiles.slope[i];
    list.push(i);
  }
  c.list = Int32Array.from(list);
  return c;
}

export function dilate(seed: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const across = new Uint8Array(w * h);
  const run = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) run[x + 1] = run[x] + (seed[y * w + x] ? 1 : 0);
    for (let x = 0; x < w; x++)
      across[y * w + x] = run[Math.min(w, x + r + 1)] - run[Math.max(0, x - r)] > 0 ? 1 : 0;
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) run[y + 1] = run[y] + across[y * w + x];
    for (let y = 0; y < h; y++)
      out[y * w + x] = run[Math.min(h, y + r + 1)] - run[Math.max(0, y - r)] > 0 ? 1 : 0;
  }
  return out;
}

export function listOf(mask: Uint8Array): Int32Array {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) count++;
  const out = new Int32Array(count);
  let k = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) out[k++] = i;
  return out;
}

export function blurTiles(
  src: Float32Array,
  tw: number,
  th: number,
  res: number,
  tiles: Int32Array,
  sigma: number
): Float32Array {
  const fw = tw * res;
  const fh = th * res;
  const r = Math.ceil(sigma * 3);
  const kernel = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let k = -r; k <= r; k++) sum += kernel[k + r] = Math.exp((-k * k) / (2 * sigma * sigma));
  for (let k = 0; k < kernel.length; k++) kernel[k] /= sum;
  const across = new Float32Array(fw * fh);
  const out = new Float32Array(fw * fh);
  for (let n = 0; n < tiles.length; n++) {
    const x0 = (tiles[n] % tw) * res;
    const y0 = ((tiles[n] / tw) | 0) * res;
    for (let y = y0; y < y0 + res; y++) {
      const row = y * fw;
      for (let x = x0; x < x0 + res; x++) {
        const lo = x - r < 0 ? 0 : x - r;
        const hi = x + r >= fw ? fw - 1 : x + r;
        let s = 0;
        for (let xx = lo; xx <= hi; xx++) s += src[row + xx] * kernel[xx - x + r];
        across[row + x] = s;
      }
    }
  }
  for (let n = 0; n < tiles.length; n++) {
    const x0 = (tiles[n] % tw) * res;
    const y0 = ((tiles[n] / tw) | 0) * res;
    for (let y = y0; y < y0 + res; y++) {
      const lo = y - r < 0 ? 0 : y - r;
      const hi = y + r >= fh ? fh - 1 : y + r;
      for (let x = x0; x < x0 + res; x++) {
        let s = 0;
        for (let yy = lo; yy <= hi; yy++) s += across[yy * fw + x] * kernel[yy - y + r];
        out[y * fw + x] = s;
      }
    }
  }
  return out;
}

export class Bilinear {
  private i = 0;
  private k00 = 0;
  private k10 = 0;
  private k01 = 0;
  private k11 = 0;

  constructor(
    private readonly w: number,
    private readonly h: number
  ) {}

  at(fx: number, fy: number): this {
    const x = clamp(fx, 0, this.w - 1);
    const y = clamp(fy, 0, this.h - 1);
    const x0 = Math.max(0, Math.min(this.w - 2, Math.floor(x)));
    const y0 = Math.max(0, Math.min(this.h - 2, Math.floor(y)));
    const tx = x - x0;
    const ty = y - y0;
    this.i = y0 * this.w + x0;
    this.k00 = (1 - tx) * (1 - ty);
    this.k10 = tx * (1 - ty);
    this.k01 = (1 - tx) * ty;
    this.k11 = tx * ty;
    return this;
  }

  of(a: Float32Array): number {
    const { i, w } = this;
    return a[i] * this.k00 + a[i + 1] * this.k10 + a[i + w] * this.k01 + a[i + w + 1] * this.k11;
  }
}

export function bilinear(arr: Float32Array, w: number, h: number, fx: number, fy: number): number {
  const x = clamp(fx, 0, w - 1);
  const y = clamp(fy, 0, h - 1);
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(x)));
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(y)));
  const tx = x - x0;
  const ty = y - y0;
  const i = y0 * w + x0;
  return lerp(lerp(arr[i], arr[i + 1], tx), lerp(arr[i + w], arr[i + w + 1], tx), ty);
}
