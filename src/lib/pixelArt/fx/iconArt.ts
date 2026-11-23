import type { Ramp, Rgb } from '../palette';
import { HONEY } from './glyphs';
import { Spr } from './spr';

export interface Lit {
  c: Rgb;
  e: number;
}
export type Pal = Record<string, Rgb | Lit>;

export const keys = (r: Ramp, chars: string): Pal =>
  Object.fromEntries([...chars].map((ch, i) => [ch, r[i]]));
export const lit = (c: Rgb, e: number): Lit => ({ c, e });
const isLit = (p: Rgb | Lit): p is Lit => 'c' in p;

export function art(rows: string[], pal: Pal, e: number): Spr {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const s = new Spr(w + 2, h + 2, (w >> 1) + 1, h + 1);
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      const p = pal[ch];
      if (p) s.set(x + 1, y + 1, isLit(p) ? p.c : p, isLit(p) ? p.e : e);
    })
  );
  return s.outline();
}

export function stamp(dst: Spr, src: Spr, ox: number, oy: number): Spr {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      const c = src.c[i];
      if (c) dst.set(x + ox, y + oy, c, src.e[i]);
    }
  return dst;
}

export function boon(s: Spr): Spr {
  const o = new Spr(s.w + 3, s.h + 2, s.ax, s.ay + 2);
  const x = s.w;
  const G = lit(HONEY[5], 255);
  const g = lit(HONEY[3], 255);
  stamp(o, s, 0, 2);
  for (const [dx, dy, c] of [
    [1, 0, G],
    [0, 1, G],
    [1, 1, G],
    [2, 1, g],
    [1, 2, g]
  ] as const)
    o.set(x - 1 + dx, dy + 1, c.c, c.e);
  return o.outline();
}

const BANE = [
  [0, 0],
  [2, 0],
  [1, 1],
  [0, 1],
  [2, 1],
  [1, 2]
] as const;

export function bane(s: Spr, col: Rgb, rim: Rgb): Spr {
  const o = new Spr(s.w + 3, s.h + 2, s.ax, s.ay + 2);
  stamp(o, s, 0, 2);
  for (const [dx, dy] of BANE) o.set(s.w - 1 + dx, dy, dy === 2 || dx === 1 ? col : rim, 220);
  return o.outline();
}
