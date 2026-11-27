import type { GameGrid } from '../game-grid.js';
import type { TileData } from '../tile-types.js';
import { fbm, ridged, smooth } from './tierNoise.js';

export const TIER_MASS = 1;
export const TIER_ROOF = 2;
export const TIER_NEAR = 4;
export const TIER_REACH = 8;
export const TIER_TEXEL = 4;
export const TIER_FIELDS = 4;
export const TIER_STEP = 24;
export const TOP_TIER = 4;
const NEAR_REACH = 2;
const NO_SEED = 1e4;
const INF = 1e20;
const CAP_FLOOR = 8;
const CAP_STEP = TIER_STEP * 1.1;
const CAP_SLOPE = 0.04;
const SEEN = 0.3;
const REACH_ROWS = 4;
const SHAPE = 6;

export type TileAt = { x: number; y: number };

export function tierFlags(terrain: TileData | undefined, resource: TileData | undefined): number {
  const roof = terrain?.underRock ? TIER_ROOF : 0;
  return (resource?.rock || roof ? TIER_MASS : 0) | roof;
}

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
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
  }
}

export function nearestSeed(seed: (i: number) => boolean, w: number, h: number): Float32Array {
  const dist = new Float32Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = seed(y * w + x) ? 0 : INF;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) dist[y * w + x] = d[x] >= INF / 2 ? NO_SEED : Math.sqrt(d[x]);
  }
  return dist;
}

export interface TierShape {
  crest: number;
  body: number;
  set: number;
  tiers: number[];
}

export function tierShape(x: number, y: number): TierShape {
  const crag = ridged(x / 150, y / 150, 141);
  return {
    crest: 0.5 + fbm(x / 300, y / 300, 21, 2),
    body: 0.2 + fbm(x / 190, y / 190, 143, 2) + 0.5 * crag * crag,
    set: 30 + fbm(x / 90, y / 90, 145, 2) * 44,
    tiers: [1, 2, 3].map((k) => (fbm(x / 75, y / 75, 200 + k * 13, 2) - 0.5) * 1.1)
  };
}

export function tierFields(shape: TierShape, d: number): number[] {
  const body = shape.body * shape.crest * smooth(50, 200, d);
  const fields = [
    smooth(shape.set, shape.set + 26, d),
    ...shape.tiers.map((n, i) => (body - 0.36 - (i + 1) * 0.2) * 4 + n)
  ];
  return fields.map((f, k) =>
    Math.max(0, Math.min(1, f, 0.5 + (d - CAP_FLOOR - CAP_STEP * (k + 1)) * CAP_SLOPE))
  );
}

export class TierTiles {
  w = 0;
  h = 0;
  tile = 32;
  flags = new Uint8Array(0);
  texels = new Uint16Array(0);
  fields = new Uint8Array(0);
  private shapes = new Float32Array(0);

  isMass(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return true;
    return (this.flags[y * this.w + x] & TIER_MASS) !== 0;
  }

  readAll(terrain: GameGrid, resource: GameGrid | null, tile: number): void {
    const bounds = terrain.getBounds();
    this.tile = tile;
    this.w = bounds ? bounds.max.x + 1 : 0;
    this.h = bounds ? bounds.max.y + 1 : 0;
    this.flags = new Uint8Array(this.w * this.h);
    this.texels = new Uint16Array(this.w * this.h * TIER_TEXEL);
    this.shapes = new Float32Array(this.w * this.h * SHAPE).fill(NaN);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) this.readTile(terrain, resource, x, y);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.markNear(x, y);
    this.shape();
  }

  read(terrain: GameGrid, resource: GameGrid | null, tiles: readonly TileAt[]): boolean {
    let moved = false;
    const roofs: TileAt[] = [];
    for (const { x, y } of tiles) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const before = this.flags[y * this.w + x];
      this.readTile(terrain, resource, x, y);
      const after = this.flags[y * this.w + x];
      if ((before ^ after) & TIER_MASS) moved = true;
      if ((before ^ after) & TIER_ROOF) roofs.push({ x, y });
    }
    for (const r of roofs)
      for (let dy = -NEAR_REACH; dy <= NEAR_REACH; dy++)
        for (let dx = -NEAR_REACH; dx <= NEAR_REACH; dx++) this.markNear(r.x + dx, r.y + dy);
    if (moved) this.shape();
    return moved;
  }

  private readTile(terrain: GameGrid, resource: GameGrid | null, x: number, y: number): void {
    const i = y * this.w + x;
    const rock = resource?.getTile(x, y);
    const flags = tierFlags(terrain.getTile(x, y), rock);
    this.flags[i] = (this.flags[i] & (TIER_NEAR | TIER_REACH)) | flags;
    const vein = flags & TIER_MASS ? rock?.painted?.vein : undefined;
    const t = i * TIER_TEXEL;
    this.texels[t] = this.flags[i];
    this.texels[t + 1] = vein ? vein.x + 1 : 0;
    this.texels[t + 2] = vein ? vein.y : 0;
    this.texels[t + 3] = vein ? vein.near : 0;
  }

  private setFlag(i: number, bit: number, on: boolean): void {
    this.flags[i] = on ? this.flags[i] | bit : this.flags[i] & ~bit;
    this.texels[i * TIER_TEXEL] = this.flags[i];
  }

  private markNear(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    let near = false;
    for (let dy = -NEAR_REACH; dy <= NEAR_REACH && !near; dy++)
      for (let dx = -NEAR_REACH; dx <= NEAR_REACH && !near; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        near = (this.flags[ty * this.w + tx] & TIER_ROOF) !== 0;
      }
    this.setFlag(y * this.w + x, TIER_NEAR, near);
  }

  private shapeAt(i: number): TierShape {
    const o = i * SHAPE;
    const s = this.shapes;
    if (Number.isNaN(s[o])) {
      const x = i % this.w;
      const y = (i - x) / this.w;
      const made = tierShape((x + 0.5) * this.tile, (y + 0.5) * this.tile);
      s.set([made.crest, made.body, made.set, ...made.tiers], o);
    }
    return { crest: s[o], body: s[o + 1], set: s[o + 2], tiers: [s[o + 3], s[o + 4], s[o + 5]] };
  }

  private shape(): void {
    const { w, h, tile } = this;
    const dist = nearestSeed((i) => (this.flags[i] & TIER_MASS) === 0, w, h);
    this.fields = new Uint8Array(w * h * TIER_FIELDS);
    const seen = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const d = dist[i] * tile - tile / 2;
      if (!(this.flags[i] & TIER_MASS) || d <= CAP_FLOOR + CAP_STEP - 0.5 / CAP_SLOPE) continue;
      const f = tierFields(this.shapeAt(i), d);
      for (let k = 0; k < TIER_FIELDS; k++)
        this.fields[i * TIER_FIELDS + k] = Math.round(f[k] * 255);
      seen[i] = f[0] > SEEN ? 1 : 0;
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let reach = false;
        for (let dy = -1; dy <= REACH_ROWS + 1 && !reach; dy++)
          for (let dx = -1; dx <= 1 && !reach; dx++) {
            const tx = x + dx;
            const ty = y + dy;
            reach = tx >= 0 && ty >= 0 && tx < w && ty < h && seen[ty * w + tx] === 1;
          }
        this.setFlag(y * w + x, TIER_REACH, reach);
      }
  }
}
