import { paint, type Painter } from './canvas';
import { clamp, fbm, hash, noise } from './noise';
import { INK, RAMPS, pick, tone, type Ramp, type Rgb } from './palette';

export interface PlankOptions {
  dir?: 'h' | 'v';
  ramp?: Ramp;
  base?: number;
  seed?: number;
  lo?: number;
  hi?: number;
}

function boards(n: number, seed: number, lo: number, hi: number) {
  const id = new Int16Array(n);
  const pos = new Int16Array(n);
  const wid = new Int16Array(n);
  for (let a = 0, k = 0; a < n; k++) {
    const bw = lo + Math.floor(hash(k, seed, 4) * (hi - lo + 1));
    for (let i = 0; i < bw && a < n; i++, a++) {
      id[a] = k;
      pos[a] = i;
      wid[a] = bw;
    }
  }
  return { id, pos, wid };
}

function grain(c: number, k: number, a: number, seed: number): number {
  let t = (hash(k, seed, 1) - 0.5) * 0.16;
  t += (fbm(c * 0.028 + k * 13.7, a * 0.5 + k * 3.1, seed + 2, 3) - 0.5) * 0.44;
  if (noise(a * 1.7 + k * 5.3, c * 0.012, seed + 5) > 0.74) t -= 0.09;
  return t;
}

export function planks(w: number, h: number, o: PlankOptions = {}): (x: number, y: number) => Rgb {
  const vertical = o.dir !== 'h';
  const ramp = o.ramp ?? RAMPS.oakDark;
  const base = o.base ?? 0.42;
  const seed = o.seed ?? 1;
  const b = boards(vertical ? w : h, seed, o.lo ?? 20, o.hi ?? 30);
  return (x, y) => {
    const a = vertical ? x : y;
    const c = vertical ? y : x;
    const k = b.id[a];
    const pa = b.pos[a];
    if (pa === b.wid[a] - 1) return ramp[0];
    const t = base + grain(c, k, a, seed) + (pa === 0 ? 0.1 : 0);
    return pick(ramp, t, x, y, 0.8);
  };
}

export const ironPx = (x: number, y: number, k: number): Rgb =>
  RAMPS.iron[clamp(k + (hash(x, y, 9) > 0.82 ? 1 : 0) - (hash(x, y, 11) > 0.88 ? 1 : 0), 0, 6)];

export interface TimberOptions extends PlankOptions {
  beam?: number;
  strap?: number;
}

function strapPx(
  x: number,
  y: number,
  edge: { l: number; r: number; t: number; b: number },
  bw: number,
  strap: number
): Rgb {
  const cx = Math.min(edge.l, edge.r);
  const cy = Math.min(edge.t, edge.b);
  if (
    cx === strap - 1 ||
    cy === strap - 1 ||
    (cx === bw + 1 && cy >= bw + 1) ||
    (cy === bw + 1 && cx >= bw + 1)
  )
    return RAMPS.iron[0];
  if ((cx === 3 && cy === 3) || (cx === strap - 4 && cy === 3) || (cx === 3 && cy === strap - 4))
    return RAMPS.iron[6];
  if ((cx === 4 && cy === 4) || (cx === strap - 3 && cy === 4) || (cx === 4 && cy === strap - 3))
    return RAMPS.iron[0];
  return ironPx(x, y, edge.t === 1 || edge.l === 1 ? 4 : edge.b === 1 || edge.r === 1 ? 1 : 2);
}

function beamPx(
  x: number,
  y: number,
  e: { l: number; r: number; t: number; b: number; d: number },
  bw: number,
  seed: number
): Rgb {
  const horiz = e.d === e.t || e.d === e.b;
  const side = e.d === e.t ? 1 : e.d === e.b ? 2 : e.d === e.l ? 3 : 4;
  let k = 0.5 + grain(horiz ? x : y, side, (horiz ? y : x) * 1.6, seed) * 0.8;
  if (e.d === e.t) k += e.t === 1 ? 0.2 : e.t === bw ? -0.2 : 0;
  else if (e.d === e.b) k += e.b === bw ? 0.14 : e.b === 1 ? -0.22 : 0;
  else if (e.d === e.l) k += e.l === 1 ? 0.18 : e.l === bw ? -0.16 : 0;
  else k += e.r === bw ? 0.1 : e.r === 1 ? -0.22 : 0;
  if (Math.min(e.l, e.r) === Math.min(e.t, e.b)) k -= 0.2;
  const along = horiz ? x : y;
  if (e.d === 3 && along % 72 === 36) return RAMPS.iron[6];
  if (e.d === 4 && along % 72 === 37) return INK;
  return pick(RAMPS.beam, k, x, y, 0.8);
}

export function timber(w: number, h: number, o: TimberOptions = {}): HTMLCanvasElement {
  const bw = o.beam ?? 5;
  const strap = o.strap ?? 12;
  const seed = (o.seed ?? 1) + 40;
  const face = planks(w, h, o);
  const fn: Painter = (x, y) => {
    const e = { l: x, r: w - 1 - x, t: y, b: h - 1 - y, d: 0 };
    e.d = Math.min(e.l, e.r, e.t, e.b);
    if (e.d === 0) return INK;
    const cx = Math.min(e.l, e.r);
    const cy = Math.min(e.t, e.b);
    if (strap && cx < strap && cy < strap && (cx <= bw + 1 || cy <= bw + 1))
      return strapPx(x, y, e, bw, strap);
    if (e.d <= bw) return beamPx(x, y, e, bw, seed);
    if (e.d === bw + 1) return RAMPS.oakDark[0];
    const c = face(x, y);
    return e.t === bw + 2 || e.l === bw + 2 ? tone(c, 0.72) : c;
  };
  return paint(w, h, fn);
}
