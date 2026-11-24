import type { GameGrid } from '../game-grid.js';
import type { TileData } from '../tile-types.js';

export const PEAK_MASS = 1;
export const PEAK_ROOF = 2;
export const PEAK_NEAR = 4;
export const PEAK_TEXEL = 4;
const NEAR_REACH = 2;
const FAR_STRIDE = 4;
const NO_SEED = 1e4;
const INF = 1e20;

export type TileAt = { x: number; y: number };

export function peakFlags(terrain: TileData | undefined, resource: TileData | undefined): number {
  const roof = terrain?.underRock ? PEAK_ROOF : 0;
  return (resource?.rock || roof ? PEAK_MASS : 0) | roof;
}

function edt1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
  arg: Int32Array
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = 0;
    do {
      const p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
    } while (s <= z[k] && --k >= 0);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
    arg[q] = p;
  }
}

export function nearestSeed(
  seed: (i: number) => boolean,
  w: number,
  h: number
): { dist: Float32Array; nearX: Int32Array; nearY: Int32Array } {
  const dist = new Float32Array(w * h);
  const nearX = new Int32Array(w * h);
  const nearY = new Int32Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const arg = new Int32Array(n);
  const g = new Float64Array(w * h);
  const gy = new Int32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = seed(y * w + x) ? 0 : INF;
    edt1d(f, h, d, v, z, arg);
    for (let y = 0; y < h; y++) {
      g[y * w + x] = d[y];
      gy[y * w + x] = arg[y];
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z, arg);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      dist[i] = d[x] >= INF / 2 ? NO_SEED : Math.sqrt(d[x]);
      nearX[i] = arg[x];
      nearY[i] = gy[y * w + arg[x]];
    }
  }
  return { dist, nearX, nearY };
}

export class PeakTiles {
  w = 0;
  h = 0;
  flags = new Uint8Array(0);
  texels = new Uint16Array(0);
  private far = new Float32Array(0);
  private farStale = true;

  isMass(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return true;
    return (this.flags[y * this.w + x] & PEAK_MASS) !== 0;
  }

  readAll(terrain: GameGrid, resource: GameGrid | null): void {
    const bounds = terrain.getBounds();
    this.w = bounds ? bounds.max.x + 1 : 0;
    this.h = bounds ? bounds.max.y + 1 : 0;
    this.flags = new Uint8Array(this.w * this.h);
    this.texels = new Uint16Array(this.w * this.h * PEAK_TEXEL);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) this.readTile(terrain, resource, x, y);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.markNear(x, y);
    this.farStale = true;
  }

  read(terrain: GameGrid, resource: GameGrid | null, tiles: readonly TileAt[]): TileAt[] {
    const moved: TileAt[] = [];
    const roofs: TileAt[] = [];
    for (const { x, y } of tiles) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const before = this.flags[y * this.w + x];
      this.readTile(terrain, resource, x, y);
      const after = this.flags[y * this.w + x];
      if ((before ^ after) & PEAK_MASS) moved.push({ x, y });
      if ((before ^ after) & PEAK_ROOF) roofs.push({ x, y });
    }
    for (const r of roofs)
      for (let dy = -NEAR_REACH; dy <= NEAR_REACH; dy++)
        for (let dx = -NEAR_REACH; dx <= NEAR_REACH; dx++) this.markNear(r.x + dx, r.y + dy);
    if (moved.length > 0) this.farStale = true;
    return moved;
  }

  private readTile(terrain: GameGrid, resource: GameGrid | null, x: number, y: number): void {
    const i = y * this.w + x;
    const rock = resource?.getTile(x, y);
    const flags = peakFlags(terrain.getTile(x, y), rock);
    this.flags[i] = (this.flags[i] & PEAK_NEAR) | flags;
    const vein = flags & PEAK_MASS ? rock?.painted?.vein : undefined;
    const t = i * PEAK_TEXEL;
    this.texels[t] = this.flags[i];
    this.texels[t + 1] = vein ? vein.x + 1 : 0;
    this.texels[t + 2] = vein ? vein.y : 0;
    this.texels[t + 3] = vein ? vein.near : 0;
  }

  private markNear(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    let near = false;
    for (let dy = -NEAR_REACH; dy <= NEAR_REACH && !near; dy++)
      for (let dx = -NEAR_REACH; dx <= NEAR_REACH && !near; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        near = (this.flags[ty * this.w + tx] & PEAK_ROOF) !== 0;
      }
    const i = y * this.w + x;
    this.flags[i] = near ? this.flags[i] | PEAK_NEAR : this.flags[i] & ~PEAK_NEAR;
    this.texels[i * PEAK_TEXEL] = this.flags[i];
  }

  farField(): Float32Array {
    if (!this.farStale) return this.far;
    const { dist, nearX, nearY } = nearestSeed(
      (i) => (this.flags[i] & PEAK_MASS) === 0,
      this.w,
      this.h
    );
    this.far = new Float32Array(this.w * this.h * FAR_STRIDE);
    for (let i = 0; i < this.w * this.h; i++) {
      this.far[i * FAR_STRIDE] = dist[i];
      this.far[i * FAR_STRIDE + 1] = nearX[i];
      this.far[i * FAR_STRIDE + 2] = nearY[i];
    }
    this.farStale = false;
    return this.far;
  }

  farWindow(x0: number, y0: number, w: number, h: number, tile: number): Float32Array {
    const far = this.farField();
    const out = new Float32Array(w * h * FAR_STRIDE);
    if (this.w === 0 || this.h === 0) return out;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const tx = Math.min(this.w - 1, Math.max(0, x0 + x));
        const ty = Math.min(this.h - 1, Math.max(0, y0 + y));
        const s = (ty * this.w + tx) * FAR_STRIDE;
        const o = (y * w + x) * FAR_STRIDE;
        const off = Math.hypot(x0 + x - tx, y0 + y - ty);
        out[o] = (far[s] + off) * tile - tile / 2;
        out[o + 1] = far[s + 1] * tile + tile / 2;
        out[o + 2] = far[s + 2] * tile + tile / 2;
      }
    return out;
  }
}
