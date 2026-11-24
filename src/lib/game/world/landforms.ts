import { createNoise2D } from 'simplex-noise';
import { makeSeededRng } from '../core/util/rng';
import { chamferDistance } from './chamfer';

type Noise = (x: number, y: number) => number;

export const Cover = {
  Land: 0,
  Mountain: 1,
  Lake: 2,
  DeepLake: 3,
  River: 4
} as const;

export interface LandformTargets {
  mountain: number;
  water: number;
  lowland: ReadonlyArray<{ biome: string; share: number }>;
}

export interface Landforms {
  cover: Uint8Array;
  lowland: Uint8Array;
  rank: Float32Array;
}

const DEEP_FROM_SHORE = 6;
const RIVER_CATCHMENT = 0.006;
const LAKE_SHARE_OF_WATER = 0.8;
const MIN_LAKE_DEPTH = 0.004;
const START_CLEARING = 18;
const MIN_LAKE_SHARE = 1e-4;
const RANGE_STRETCH = 0.42;
const FIELD_STEP = 3;
const MIN_PEAK_SHARE = 6e-5;
const PASS_REACH = 2;

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function fbm(n: Noise, x: number, y: number, octaves: number, gain: number): number {
  let value = 0;
  let amp = 1;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    value += n(x * freq, y * freq) * amp;
    max += amp;
    amp *= gain;
    freq *= 2;
  }
  return value / max;
}

function ridged(n: Noise, x: number, y: number, octaves: number): number {
  let result = 0;
  let weight = 1;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    let s = 1 - Math.abs(n(x * freq, y * freq));
    s *= s * weight;
    const amp = 1 / freq;
    result += s * amp;
    max += amp;
    weight = Math.max(0, Math.min(1, s * 2));
    freq *= 2.1;
  }
  return result / max;
}

function quantile(values: Float32Array, include: (i: number) => boolean, q: number): number {
  let count = 0;
  for (let i = 0; i < values.length; i++) if (include(i)) count++;
  if (count === 0) return Infinity;
  const picked = new Float32Array(count);
  let k = 0;
  for (let i = 0; i < values.length; i++) if (include(i)) picked[k++] = values[i];
  picked.sort();
  const at = Math.max(0, Math.min(count - 1, Math.floor(q * count)));
  return picked[at];
}

class MinHeap {
  private keys: Float64Array;
  private ids: Int32Array;
  private size = 0;
  constructor(capacity: number) {
    this.keys = new Float64Array(capacity);
    this.ids = new Int32Array(capacity);
  }
  get length(): number {
    return this.size;
  }
  push(key: number, id: number): void {
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.keys[i] = this.keys[p];
      this.ids[i] = this.ids[p];
      i = p;
    }
    this.keys[i] = key;
    this.ids[i] = id;
  }
  pop(): number {
    const top = this.ids[0];
    const key = this.keys[--this.size];
    const id = this.ids[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.keys[i] = this.keys[c];
      this.ids[i] = this.ids[c];
      i = c;
    }
    this.keys[i] = key;
    this.ids[i] = id;
    return top;
  }
}

function patches(w: number, h: number, inside: (i: number) => boolean): Int32Array[] {
  const seen = new Uint8Array(w * h);
  const out: Int32Array[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !inside(s)) continue;
    seen[s] = 1;
    stack.push(s);
    const members: number[] = [];
    while (stack.length) {
      const i = stack.pop() as number;
      members.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0 && !seen[i - 1] && inside(i - 1)) ((seen[i - 1] = 1), stack.push(i - 1));
      if (x < w - 1 && !seen[i + 1] && inside(i + 1)) ((seen[i + 1] = 1), stack.push(i + 1));
      if (y > 0 && !seen[i - w] && inside(i - w)) ((seen[i - w] = 1), stack.push(i - w));
      if (y < h - 1 && !seen[i + w] && inside(i + w)) ((seen[i + w] = 1), stack.push(i + w));
    }
    out.push(Int32Array.from(members));
  }
  return out;
}

function smoothLakes(w: number, h: number, cover: Uint8Array): void {
  const was = cover.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (was[i] === Cover.Mountain) continue;
      let lakes = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (was[i + dy * w + dx] === Cover.Lake) lakes++;
      cover[i] = lakes >= 5 ? Cover.Lake : Cover.Land;
    }
  }
}

function carvePasses(w: number, h: number, cover: Uint8Array, start: number): void {
  const n = w * h;
  const open = (i: number) => cover[i] !== Cover.Mountain;
  const cost = new Int32Array(n).fill(-1);
  const via = new Int32Array(n).fill(-1);
  const deque = new Int32Array(2 * n);
  let head = n;
  let tail = n;
  cost[start] = 0;
  deque[tail++] = start;
  while (head < tail) {
    const i = deque[head++];
    const x = i % w;
    const y = (i / w) | 0;
    for (const j of [
      x > 0 ? i - 1 : -1,
      x < w - 1 ? i + 1 : -1,
      y > 0 ? i - w : -1,
      y < h - 1 ? i + w : -1
    ]) {
      if (j < 0) continue;
      const step = open(j) ? 0 : 1;
      if (cost[j] !== -1 && cost[j] <= cost[i] + step) continue;
      cost[j] = cost[i] + step;
      via[j] = i;
      if (step === 0) deque[--head] = j;
      else deque[tail++] = j;
    }
  }
  const joined = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (cost[i] === 0) joined[i] = 1;
  for (const p of patches(w, h, (i) => open(i) && !joined[i])) {
    let best = p[0];
    for (const i of p) if (cost[i] < cost[best]) best = i;
    for (let i = via[best]; i >= 0 && !joined[i]; i = via[i]) {
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -PASS_REACH; dy <= PASS_REACH; dy++)
        for (let dx = -PASS_REACH; dx <= PASS_REACH; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (dx * dx + dy * dy > PASS_REACH * PASS_REACH + 1) continue;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && cover[ny * w + nx] === Cover.Mountain)
            cover[ny * w + nx] = Cover.Land;
        }
    }
  }
}

function sealStrays(w: number, h: number, cover: Uint8Array, start: number): void {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    for (const j of [
      x > 0 ? i - 1 : -1,
      x < w - 1 ? i + 1 : -1,
      y > 0 ? i - w : -1,
      y < h - 1 ? i + w : -1
    ]) {
      if (j < 0 || seen[j] || cover[j] === Cover.Mountain) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  for (let i = 0; i < n; i++) if (!seen[i]) cover[i] = Cover.Mountain;
}

function drain(
  w: number,
  h: number,
  elevation: Float32Array
): { fill: Float32Array; parent: Int32Array; order: Int32Array } {
  const n = w * h;
  const fill = new Float32Array(n);
  const parent = new Int32Array(n).fill(-1);
  const order = new Int32Array(n);
  const seen = new Uint8Array(n);
  const heap = new MinHeap(n);
  const key = (i: number) => fill[i] + 1e-3 * elevation[i];
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = y * w + x;
      if (seen[i]) continue;
      seen[i] = 1;
      fill[i] = elevation[i];
      heap.push(key(i), i);
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const x of [0, w - 1]) {
      const i = y * w + x;
      seen[i] = 1;
      fill[i] = elevation[i];
      heap.push(key(i), i);
    }
  }
  let k = 0;
  while (heap.length) {
    const i = heap.pop();
    order[k++] = i;
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if ((!dx && !dy) || nx < 0 || nx >= w) continue;
        const j = ny * w + nx;
        if (seen[j]) continue;
        seen[j] = 1;
        fill[j] = Math.max(elevation[j], fill[i]);
        parent[j] = i;
        heap.push(key(j), j);
      }
    }
  }
  return { fill, parent, order };
}

export function generateLandforms(
  w: number,
  h: number,
  seed: number,
  targets: LandformTargets
): Landforms {
  const n = w * h;
  const dim = Math.max(w, h);
  const noise = (salt: number): Noise => createNoise2D(makeSeededRng((seed ^ salt) >>> 0 || 1));
  const warpA = noise(0x51ed27);
  const warpB = noise(0x2f9e13);
  const continent = noise(0x6a09e6);
  const crest = noise(0x3c6ef3);
  const belt = noise(0x1f83d9);
  const basin = noise(0x5be0cd);
  const rough = noise(0x7137449);
  const vegetation = noise(0x0e5f8a3);
  const relief = noise(0x4d2c6dfc);
  const trend = makeSeededRng((seed ^ 0x1b873593) >>> 0 || 1)() * Math.PI;
  const along = [Math.cos(trend), Math.sin(trend)];

  const gw = Math.ceil((w - 1) / FIELD_STEP) + 2;
  const gh = Math.ceil((h - 1) / FIELD_STEP) + 2;
  const fields = { ridge: new Float32Array(gw * gh), c: new Float32Array(gw * gh) };
  const dipField = new Float32Array(gw * gh);
  const vegField = new Float32Array(gw * gh);
  const shoreField = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const g = gy * gw + gx;
      const px = (gx * FIELD_STEP) / dim;
      const py = (gy * FIELD_STEP) / dim;
      const qx = px + fbm(warpA, px * 2.5, py * 2.5, 3, 0.5) * 0.07;
      const qy = py + fbm(warpB, px * 2.5, py * 2.5, 3, 0.5) * 0.07;
      const c = fbm(continent, qx * 2.2, qy * 2.2, 4, 0.5);
      const u = (qx * along[0] + qy * along[1]) * RANGE_STRETCH;
      const v = -qx * along[1] + qy * along[0];
      const ridge = Math.pow(ridged(crest, u * 3.6, v * 3.6, 5), 3.4);
      const zone = smoothstep(-0.2, 0.35, fbm(belt, qx * 1.7, qy * 1.7, 2, 0.5));
      fields.ridge[g] = Math.max(ridge * zone, smoothstep(0.3, 0.65, c) * 0.3);
      fields.c[g] = c;
      dipField[g] = smoothstep(0.1, 0.6, fbm(basin, qx * 3.2, qy * 3.2, 4, 0.5));
      vegField[g] = fbm(vegetation, qx * 5, qy * 5, 4, 0.55);
      shoreField[g] = fbm(relief, px * (dim / 40), py * (dim / 40), 3, 0.5);
    }
  }

  const mountainness = new Float32Array(n);
  const elevation = new Float32Array(n);
  const veg = new Float32Array(n);
  const cx = w / 2;
  const cy = h / 2;

  for (let y = 0; y < h; y++) {
    const gy = Math.floor(y / FIELD_STEP);
    const fy = y / FIELD_STEP - gy;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const gx = Math.floor(x / FIELD_STEP);
      const fx = x / FIELD_STEP - gx;
      const g = gy * gw + gx;
      const at = (f: Float32Array) =>
        (f[g] * (1 - fx) + f[g + 1] * fx) * (1 - fy) +
        (f[g + gw] * (1 - fx) + f[g + gw + 1] * fx) * fy;
      const crag = fbm(rough, x / 9, y / 9, 2, 0.5);
      const clear = smoothstep(START_CLEARING, START_CLEARING * 2.4, Math.hypot(x - cx, y - cy));
      const m = (at(fields.ridge) + crag * 0.06) * clear;
      mountainness[i] = m;
      elevation[i] =
        0.6 * m +
        0.25 * at(fields.c) -
        0.22 * at(dipField) * clear +
        0.035 * at(shoreField) +
        0.01 * crag +
        0.15 * (1 - clear);
      veg[i] = at(vegField);
    }
  }

  const cover = new Uint8Array(n);
  const mountainCut = quantile(mountainness, () => true, 1 - targets.mountain);
  for (let i = 0; i < n; i++) if (mountainness[i] >= mountainCut) cover[i] = Cover.Mountain;
  const minPeak = n * MIN_PEAK_SHARE;
  for (const p of patches(w, h, (i) => cover[i] === Cover.Mountain))
    if (p.length < minPeak) for (const i of p) cover[i] = Cover.Land;
  for (const p of patches(w, h, (i) => cover[i] !== Cover.Mountain))
    if (p.length < minPeak) for (const i of p) cover[i] = Cover.Mountain;
  carvePasses(w, h, cover, Math.floor(h / 2) * w + Math.floor(w / 2));

  const { fill, parent, order } = drain(w, h, elevation);
  const depth = new Float32Array(n);
  for (let i = 0; i < n; i++) depth[i] = fill[i] - elevation[i];
  const lakeTarget = targets.water * LAKE_SHARE_OF_WATER;
  const lakeCut = Math.max(
    MIN_LAKE_DEPTH,
    quantile(depth, () => true, 1 - lakeTarget)
  );
  for (let i = 0; i < n; i++)
    if (depth[i] > lakeCut && cover[i] !== Cover.Mountain) cover[i] = Cover.Lake;
  smoothLakes(w, h, cover);
  smoothLakes(w, h, cover);
  const minLake = n * MIN_LAKE_SHARE;
  for (const p of patches(w, h, (i) => cover[i] === Cover.Lake))
    if (p.length < minLake) for (const i of p) cover[i] = Cover.Land;
  for (const p of patches(w, h, (i) => cover[i] !== Cover.Lake))
    if (p.length < minLake) for (const i of p) cover[i] = Cover.Lake;

  const acc = new Float32Array(n).fill(1);
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k];
    const p = parent[i];
    if (p >= 0) acc[p] += acc[i];
  }
  const catchment = n * RIVER_CATCHMENT;
  const river = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (acc[i] < catchment || cover[i] === Cover.Lake) continue;
    const radius = Math.min(3.2, 0.5 + 0.8 * Math.log2(acc[i] / catchment));
    const x = i % w;
    const y = (i / w) | 0;
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > radius * radius + 0.25) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        river[ny * w + nx] = 1;
      }
    }
    const p = parent[i];
    if (p >= 0) {
      const px = p % w;
      if (px !== x && ((p / w) | 0) !== y) river[y * w + px] = 1;
    }
  }
  for (let i = 0; i < n; i++) if (river[i] && cover[i] !== Cover.Lake) cover[i] = Cover.River;
  sealStrays(w, h, cover, Math.floor(h / 2) * w + Math.floor(w / 2));

  const isWater = (i: number) =>
    cover[i] === Cover.Lake || cover[i] === Cover.River || cover[i] === Cover.DeepLake;
  const fromShore = chamferDistance(w, h, (i) => !isWater(i));
  for (let i = 0; i < n; i++)
    if (cover[i] === Cover.Lake && fromShore[i] >= DEEP_FROM_SHORE) cover[i] = Cover.DeepLake;

  const fromWater = chamferDistance(w, h, isWater);
  const wetReach = dim * 0.03;
  const rank = new Float32Array(n);
  let elevMin = Infinity;
  let elevMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (elevation[i] < elevMin) elevMin = elevation[i];
    if (elevation[i] > elevMax) elevMax = elevation[i];
  }
  const span = elevMax - elevMin || 1;
  for (let i = 0; i < n; i++) {
    const wet = Math.max(0, 1 - fromWater[i] / wetReach);
    rank[i] = 0.55 * veg[i] + 0.9 * ((elevation[i] - elevMin) / span) - 0.35 * wet;
  }

  const lowland = new Uint8Array(n);
  const isLowland = (i: number) => cover[i] === Cover.Land;
  const banded = (i: number) => cover[i] !== Cover.Mountain;
  const totalShare = targets.lowland.reduce((s, b) => s + b.share, 0) || 1;
  const cuts: number[] = [];
  let cum = 0;
  for (let b = 0; b < targets.lowland.length - 1; b++) {
    cum += targets.lowland[b].share / totalShare;
    cuts.push(quantile(rank, isLowland, cum));
  }
  for (let i = 0; i < n; i++) {
    if (!banded(i)) continue;
    let b = 0;
    while (b < cuts.length && rank[i] >= cuts[b]) b++;
    lowland[i] = b;
  }
  return { cover, lowland, rank };
}
