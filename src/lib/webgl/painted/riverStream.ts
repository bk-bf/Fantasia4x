import { clamp, type Centres } from './riverGrid.js';

export const STRAND_PACE = 0.45;
const STRAND_REACH = 6;
const STRAND_SLOWEST = 0.25;
const SMOOTH_STEPS = 3;
const BUCKET = 4;
const MAX_RINGS = 10;
const SEG = 8;

type SpeedAt = (px: number, py: number) => number;

function upstreamOf(c: Centres, next: (i: number) => number): Int32Array {
  const up = new Int32Array(c.w * c.h).fill(-1);
  for (const i of c.list) {
    const j = next(i);
    if (j >= 0 && (up[j] < 0 || c.discharge[i] > c.discharge[up[j]])) up[j] = i;
  }
  return up;
}

function smoothed(c: Centres, up: Int32Array, next: (i: number) => number) {
  const { w } = c;
  const sx = new Float32Array(c.w * c.h);
  const sy = new Float32Array(c.w * c.h);
  const walk = (i: number, step: (j: number) => number) => {
    const out: number[] = [];
    for (let j = step(i); j >= 0 && out.length < SMOOTH_STEPS; j = step(j)) out.push(j);
    return out;
  };
  for (const i of c.list) {
    const ups = walk(i, (j) => up[j]);
    const downs = walk(i, next);
    const keep = Math.min(ups.length, downs.length);
    const picked = [i, ...ups.slice(0, keep), ...downs.slice(0, keep)];
    sx[i] = picked.reduce((s, j) => s + (j % w) + 0.5, 0) / picked.length;
    sy[i] = picked.reduce((s, j) => s + ((j / w) | 0) + 0.5, 0) / picked.length;
  }
  return { sx, sy };
}

export function riverStream(c: Centres, speedAt: SpeedAt, need: Uint8Array, unitsPerTile: number) {
  const { w, h } = c;
  const next = (i: number) => (c.is[c.down[i]] ? c.down[i] : -1);
  const up = upstreamOf(c, next);
  const { sx, sy } = smoothed(c, up, next);
  const travel = (ax: number, ay: number, bx: number, by: number) =>
    (Math.hypot(bx - ax, by - ay) * STRAND_PACE) /
    clamp(speedAt((ax + bx) / 2, (ay + by) / 2), STRAND_SLOWEST, 1);

  const along = new Float64Array(w * h);
  const done = new Uint8Array(w * h);
  const path: number[] = [];
  for (const i of c.list) {
    for (let a = i; a >= 0 && !done[a] && path.length <= c.list.length; a = next(a)) path.push(a);
    while (path.length) {
      const b = path.pop() as number;
      const d = next(b);
      along[b] = d < 0 ? 0 : along[d] - travel(sx[b], sy[b], sx[d], sy[d]);
      done[b] = 1;
    }
  }

  const segs: number[] = [];
  const add = (ax: number, ay: number, bx: number, by: number, a0: number, a1: number) => {
    const len = Math.hypot(bx - ax, by - ay) || 1;
    segs.push(ax, ay, bx - ax, by - ay, 1 / (len * len), a0, a1 - a0, len);
  };
  const reach = (i: number, ux: number, uy: number, sign: number) => {
    let x = sx[i];
    let y = sy[i];
    let a = along[i];
    for (let k = 0; k < STRAND_REACH; k++) {
      const nx = x + ux * sign;
      const ny = y + uy * sign;
      const na = a + sign * travel(x, y, nx, ny);
      if (sign > 0) add(x, y, nx, ny, a, na);
      else add(nx, ny, x, y, na, a);
      x = nx;
      y = ny;
      a = na;
    }
  };
  for (const i of c.list) {
    const j = next(i);
    if (j >= 0) add(sx[i], sy[i], sx[j], sy[j], along[i], along[j]);
    const from = up[i];
    const to = j >= 0 ? j : c.down[i];
    const [tx, ty] = j >= 0 ? [sx[j], sy[j]] : [(to % w) + 0.5, ((to / w) | 0) + 0.5];
    const hx = tx - sx[i];
    const hy = ty - sy[i];
    const hl = Math.hypot(hx, hy) || 1;
    if (from < 0) reach(i, hx / hl, hy / hl, -1);
    if (j < 0) {
      const lx = from >= 0 ? sx[i] - sx[from] : hx;
      const ly = from >= 0 ? sy[i] - sy[from] : hy;
      const ll = Math.hypot(lx, ly) || 1;
      reach(i, lx / ll, ly / ll, 1);
    }
  }
  return streamTexels(Float64Array.from(segs), w, h, need, unitsPerTile);
}

function bucketed(seg: Float64Array, w: number, h: number) {
  const bw = Math.ceil(w / BUCKET);
  const bh = Math.ceil(h / BUCKET);
  const count = new Int32Array(bw * bh + 1);
  const span = (j: number) => {
    const x0 = Math.min(seg[j], seg[j] + seg[j + 2]);
    const y0 = Math.min(seg[j + 1], seg[j + 1] + seg[j + 3]);
    const x1 = Math.max(seg[j], seg[j] + seg[j + 2]);
    const y1 = Math.max(seg[j + 1], seg[j + 1] + seg[j + 3]);
    return [
      clamp(Math.floor(x0 / BUCKET), 0, bw - 1),
      clamp(Math.floor(y0 / BUCKET), 0, bh - 1),
      clamp(Math.floor(x1 / BUCKET), 0, bw - 1),
      clamp(Math.floor(y1 / BUCKET), 0, bh - 1)
    ];
  };
  const visit = (fn: (b: number, j: number) => void) => {
    for (let j = 0; j < seg.length; j += SEG) {
      const [x0, y0, x1, y1] = span(j);
      for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) fn(by * bw + bx, j);
    }
  };
  visit((b) => count[b + 1]++);
  for (let b = 0; b < bw * bh; b++) count[b + 1] += count[b];
  const items = new Int32Array(count[bw * bh]);
  const fill = count.slice(0, bw * bh);
  visit((b, j) => (items[fill[b]++] = j));
  return { bw, bh, start: count, items };
}

function streamTexels(seg: Float64Array, w: number, h: number, need: Uint8Array, units: number) {
  const out = new Float32Array(w * h * 4);
  if (seg.length === 0) return out;
  const { bw, bh, start, items } = bucketed(seg, w, h);
  for (let t = 0; t < w * h; t++) {
    if (!need[t]) continue;
    const px = (t % w) + 0.5;
    const py = ((t / w) | 0) + 0.5;
    const cx = Math.floor(px / BUCKET);
    const cy = Math.floor(py / BUCKET);
    let near = Infinity;
    let k = -1;
    let at = 0;
    for (let ring = 0; ring <= MAX_RINGS; ring++) {
      for (let by = cy - ring; by <= cy + ring; by++)
        for (let bx = cx - ring; bx <= cx + ring; bx++) {
          if (Math.max(Math.abs(bx - cx), Math.abs(by - cy)) !== ring) continue;
          if (bx < 0 || by < 0 || bx >= bw || by >= bh) continue;
          const b = by * bw + bx;
          for (let s = start[b]; s < start[b + 1]; s++) {
            const j = items[s];
            const rx = px - seg[j];
            const ry = py - seg[j + 1];
            const f = clamp((rx * seg[j + 2] + ry * seg[j + 3]) * seg[j + 4], 0, 1);
            const dx = rx - seg[j + 2] * f;
            const dy = ry - seg[j + 3] * f;
            const d = dx * dx + dy * dy;
            if (d < near) {
              near = d;
              k = j;
              at = f;
            }
          }
        }
      if (k >= 0 && near <= (ring * BUCKET) ** 2) break;
    }
    if (k < 0) continue;
    const len = seg[k + 7];
    const ux = seg[k + 2] / len;
    const uy = seg[k + 3] / len;
    const stretch = seg[k + 6] / len;
    out[t * 4] = (seg[k + 5] + seg[k + 6] * at) * units;
    out[t * 4 + 1] = (-uy * (px - seg[k]) + ux * (py - seg[k + 1])) * units;
    out[t * 4 + 2] = ux * stretch;
    out[t * 4 + 3] = uy * stretch;
  }
  return out;
}
