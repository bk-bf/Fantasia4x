import { distanceTo } from './shoreField.js';
import { riverStream } from './riverStream.js';
import {
  Bilinear,
  bilinear,
  blurTiles,
  centresOf,
  clamp,
  dilate,
  listOf,
  smoothstep,
  type Centres,
  type RiverTiles
} from './riverGrid.js';

export const FLOW_RES = 2;
const MAX_RADIUS = 3.2;
const SPREAD_SIGMA = 1.5;
const FLOW_SIGMA = 1.2;
const MASK_SIGMA = 1.6;
const BANK_SPEED = 0.22;
const BEND_PULL = 2.4;
const PLUME_REACH = 4.5;
const DRAW_REACH = 2.6;
const PLUME_WINDOW = 16;
const DRAW_WINDOW = 10;
const MASK_FROM = 0.06;
const MASK_TO = 0.7;
const STILL = 1e-4;
const FULL = 255;
const HALF = 127.5;
const SPREAD = ['w', 'vx', 'vy', 'sp', 'ra', 'px', 'py'] as const;

export interface RiverInput {
  w: number;
  h: number;
  water: Uint8Array;
  tiles: RiverTiles;
  unitsPerTile: number;
}

export interface RiverField {
  flow: Uint8Array;
  stream: Float32Array;
  active: Uint8Array;
}

interface Course {
  x: number;
  y: number;
  sp: number;
  ra: number;
  cx: number;
  cy: number;
}

interface Plume {
  x: number;
  y: number;
  dx: number;
  dy: number;
  sp: number;
  half: number;
  reach: number;
  window: number;
  mouth: boolean;
}

const radiusOf = (discharge: number) => Math.min(MAX_RADIUS, 0.5 + 0.8 * Math.log2(discharge));

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[values.length >> 1] || 1;
}

function downBy(c: Centres, i: number, steps: number): number {
  let j = i;
  for (let k = 0; k < steps && c.down[j] >= 0; k++) j = c.down[j];
  return j;
}

function courseSources(c: Centres, toLand: Float32Array) {
  const { w, h } = c;
  const typical = median(Array.from(c.list, (i) => c.slope[i]));
  const src = Object.fromEntries(SPREAD.map((k) => [k, new Float32Array(w * h)])) as Record<
    (typeof SPREAD)[number],
    Float32Array
  >;
  const speedOf = new Float32Array(w * h);
  for (const i of c.list) {
    const x = i % w;
    const y = (i / w) | 0;
    const j = downBy(c, i, 2);
    const len = Math.hypot((j % w) - x, ((j / w) | 0) - y) || 1;
    const half = Math.max(0.5, toLand[i] - 0.5);
    const natural = Math.floor(Math.sqrt(radiusOf(c.discharge[i]) ** 2 + 0.25)) + 0.5;
    const narrow = clamp(natural / half, 0.75, 2.4);
    const steep = clamp(c.slope[i] / (1.3 * typical), 0.7, 3.5) ** 0.75;
    const base = clamp(0.38 + 0.03 * Math.log2(c.discharge[i]), 0.36, 0.46);
    speedOf[i] = clamp(base * narrow * steep, 0.2, 1);
    src.w[i] = 1;
    src.vx[i] = ((j % w) - x) / len;
    src.vy[i] = (((j / w) | 0) - y) / len;
    src.sp[i] = speedOf[i];
    src.ra[i] = half;
    src.px[i] = x + 0.5;
    src.py[i] = y + 0.5;
  }
  return { src, speedOf };
}

function neighbourhood(
  tiles: Int32Array,
  w: number,
  h: number,
  river: Uint8Array,
  toLand: Float32Array
) {
  const near = new Uint8Array(w * h);
  const roomy = new Float32Array(w * h);
  for (const i of tiles) {
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (river[ny * w + nx]) near[i] = 1;
        roomy[i] = Math.max(roomy[i], toLand[ny * w + nx] - 0.5);
      }
  }
  return { near, roomy };
}

export function riverField(input: RiverInput): RiverField | null {
  const { w, h, water, unitsPerTile } = input;
  const n = w * h;
  const river = Uint8Array.from(input.tiles.river, (r, i) => (r && water[i] ? 1 : 0));
  const c = centresOf(w, h, water, input.tiles);
  if (c.list.length === 0) return null;
  const toLand = distanceTo((i) => !water[i], w, h);
  const lake = (i: number) => water[i] === 1 && river[i] === 0;
  const { src, speedOf } = courseSources(c, toLand);
  const spreadTiles = listOf(dilate(c.is, w, h, Math.ceil(SPREAD_SIGMA * 3)));
  const spread = Object.fromEntries(
    SPREAD.map((k) => [k, blurTiles(src[k], w, h, 1, spreadTiles, SPREAD_SIGMA)])
  ) as typeof src;
  const tap = (a: Float32Array, px: number, py: number) => bilinear(a, w, h, px - 0.5, py - 0.5);
  const near4 = new Bilinear(w, h);
  const courseAt = (px: number, py: number): Course | null => {
    const at = near4.at(px - 0.5, py - 0.5);
    const wt = at.of(spread.w);
    if (wt < STILL) return null;
    const vx = at.of(spread.vx) / wt;
    const vy = at.of(spread.vy) / wt;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    return {
      x: vx / len,
      y: vy / len,
      sp: at.of(spread.sp) / wt,
      ra: at.of(spread.ra) / wt,
      cx: at.of(spread.px) / wt,
      cy: at.of(spread.py) / wt
    };
  };

  const fed = new Uint8Array(n);
  for (const i of c.list) if (c.down[i] >= 0 && c.is[c.down[i]]) fed[c.down[i]] = 1;
  const plumes: Plume[] = [];
  const plumeAt = (i: number, mouth: boolean) => {
    const x = (i % w) + 0.5;
    const y = ((i / w) | 0) + 0.5;
    const at = courseAt(x, y);
    if (!at) return;
    const reach = mouth ? PLUME_REACH : DRAW_REACH;
    const window = mouth ? PLUME_WINDOW : DRAW_WINDOW;
    plumes.push({
      x,
      y,
      dx: at.x,
      dy: at.y,
      sp: speedOf[i],
      half: src.ra[i],
      reach,
      window,
      mouth
    });
  };
  for (const i of c.list) {
    if (lake(c.down[i])) plumeAt(i, true);
    if (!fed[i] && touchesLake(i, w, h, lake)) plumeAt(i, false);
  }

  const { near, roomy } = neighbourhood(spreadTiles, w, h, river, toLand);
  const fw = w * FLOW_RES;
  const fh = h * FLOW_RES;
  const vx = new Float32Array(fw * fh);
  const vy = new Float32Array(fw * fh);
  const mask = new Float32Array(fw * fh);
  const course = new Uint8Array(fw * fh);
  for (const tile of spreadTiles) {
    if (!river[tile] && (lake(tile) || !near[tile])) continue;
    forTexels(tile, w, (t, px, py) => {
      const at = courseAt(px, py);
      if (!at) return;
      const bank = Math.max(0, tap(toLand, px, py) - 0.5);
      const reach = clamp(0.8 * Math.min(at.ra, roomy[tile]), 0.35, 0.9);
      const profile = BANK_SPEED + (1 - BANK_SPEED) * smoothstep(0, reach, bank);
      const ahead = courseAt(px + at.x, py + at.y) ?? at;
      const turning = at.x * ahead.y - at.y * ahead.x;
      const side = at.x * (py - at.cy) - at.y * (px - at.cx);
      const sp = at.sp * profile * clamp(1 - BEND_PULL * turning * side, 0.3, 1.35);
      vx[t] = at.x * sp;
      vy[t] = at.y * sp;
      mask[t] = 1;
      course[t] = 1;
    });
  }

  const reached = new Uint8Array(n);
  for (const tile of spreadTiles) reached[tile] = 1;
  const weight = new Float32Array(fw * fh);
  for (const o of plumes)
    forWindow(o, w, h, reached, (tile) =>
      forTexels(tile, w, (t, px, py) => {
        if (course[t]) return;
        const pull = o.mouth ? plumePull(o, px, py) : drawPull(o, px, py);
        vx[t] += pull[0];
        vy[t] += pull[1];
        weight[t] += pull[2];
      })
    );
  for (let t = 0; t < fw * fh; t++)
    if (weight[t] > 0 && !course[t]) mask[t] = smoothstep(MASK_FROM, MASK_TO, weight[t]);

  const flowTiles = listOf(dilate(reached, w, h, Math.ceil((MASK_SIGMA * 3) / FLOW_RES)));
  const bx = blurTiles(vx, w, h, FLOW_RES, flowTiles, FLOW_SIGMA);
  const by = blurTiles(vy, w, h, FLOW_RES, flowTiles, FLOW_SIGMA);
  const bm = blurTiles(mask, w, h, FLOW_RES, flowTiles, MASK_SIGMA);
  const flow = encodeFlow(bx, by, bm, flowTiles, w);
  const masked = new Uint8Array(n);
  for (const tile of flowTiles)
    forTexels(tile, w, (t) => {
      if (bm[t] >= STILL) masked[tile] = 1;
    });
  const speedAt = (px: number, py: number) =>
    Math.hypot(
      bilinear(bx, fw, fh, px * FLOW_RES - 0.5, py * FLOW_RES - 0.5),
      bilinear(by, fw, fh, px * FLOW_RES - 0.5, py * FLOW_RES - 0.5)
    );
  const stream = riverStream(c, speedAt, dilate(masked, w, h, 1), unitsPerTile);
  const active = new Uint8Array(n);
  for (const tile of flowTiles) active[tile] = 1;
  return { flow, stream, active };
}

function touchesLake(i: number, w: number, h: number, lake: (j: number) => boolean): boolean {
  const x = i % w;
  const y = (i / w) | 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && lake(ny * w + nx)) return true;
    }
  return false;
}

function forTexels(tile: number, w: number, fn: (t: number, px: number, py: number) => void): void {
  const fw = w * FLOW_RES;
  const x0 = (tile % w) * FLOW_RES;
  const y0 = ((tile / w) | 0) * FLOW_RES;
  for (let y = y0; y < y0 + FLOW_RES; y++)
    for (let x = x0; x < x0 + FLOW_RES; x++)
      fn(y * fw + x, (x + 0.5) / FLOW_RES, (y + 0.5) / FLOW_RES);
}

function forWindow(
  o: Plume,
  w: number,
  h: number,
  reached: Uint8Array,
  fn: (tile: number) => void
): void {
  const x0 = Math.max(0, Math.floor(o.x - o.window));
  const y0 = Math.max(0, Math.floor(o.y - o.window));
  const x1 = Math.min(w - 1, Math.ceil(o.x + o.window));
  const y1 = Math.min(h - 1, Math.ceil(o.y + o.window));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      reached[y * w + x] = 1;
      fn(y * w + x);
    }
}

function plumePull(o: Plume, px: number, py: number): [number, number, number] {
  const rx = px - o.x;
  const ry = py - o.y;
  const r = Math.hypot(rx, ry);
  const along = rx * o.dx + ry * o.dy;
  const across = o.dx * ry - o.dy * rx;
  const s =
    Math.exp(-r / o.reach) *
    smoothstep(-1.5, 0.5, along) *
    Math.exp(-((across / (o.half + 0.6 + 0.55 * Math.max(0, along))) ** 2));
  const fx = o.dx + (0.55 * rx) / Math.max(r, 1);
  const fy = o.dy + (0.55 * ry) / Math.max(r, 1);
  const len = Math.hypot(fx, fy) || 1;
  return [(fx / len) * o.sp * s, (fy / len) * o.sp * s, s];
}

function drawPull(o: Plume, px: number, py: number): [number, number, number] {
  const rx = o.x - px;
  const ry = o.y - py;
  const r = Math.hypot(rx, ry);
  const s = Math.exp(-r / o.reach);
  const close = Math.exp(-r);
  const fx = rx / Math.max(r, 0.5) + o.dx * close;
  const fy = ry / Math.max(r, 0.5) + o.dy * close;
  const len = Math.hypot(fx, fy) || 1;
  return [(fx / len) * o.sp * s, (fy / len) * o.sp * s, s];
}

function encodeFlow(
  vx: Float32Array,
  vy: Float32Array,
  mask: Float32Array,
  tiles: Int32Array,
  w: number
): Uint8Array {
  const out = new Uint8Array(vx.length * 4);
  const still = Math.round(HALF);
  for (let t = 0; t < vx.length; t++) {
    out[t * 4] = still;
    out[t * 4 + 1] = still;
  }
  for (const tile of tiles)
    forTexels(tile, w, (t) => {
      const sp = Math.sqrt(vx[t] * vx[t] + vy[t] * vy[t]);
      const ux = sp > STILL ? vx[t] / sp : 0;
      const uy = sp > STILL ? vy[t] / sp : 0;
      out[t * 4] = Math.round(HALF + HALF * ux);
      out[t * 4 + 1] = Math.round(HALF + HALF * uy);
      out[t * 4 + 2] = Math.round(clamp(sp, 0, 1) * FULL);
      out[t * 4 + 3] = Math.round(clamp(mask[t], 0, 1) * FULL);
    });
  return out;
}
