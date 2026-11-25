import type { Ramp, Rgb } from '../palette';
import { tint } from './glyphs';
import { Spr, hex } from './spr';

export interface Lit {
  c: Rgb;
  e: number;
}
export type Pal = Record<string, Rgb | Lit>;

export const keys = (r: Ramp, chars: string): Pal =>
  Object.fromEntries([...chars].map((ch, i) => [ch, r[i]]));
export const lit = (c: Rgb, e: number): Lit => ({ c, e });
const isLit = (p: Rgb | Lit): p is Lit => 'c' in p;
export const ramp = (h: string, chars = '012345'): Pal => keys(tint(h), chars);
export const glow = (h: string, e = 255): Lit => lit(hex(h), e);

export const overlay = (base: string[], marks: string[]): string[] =>
  base.map((row, y) =>
    [...row].map((c, x) => (marks[y]?.[x] && marks[y][x] !== '.' ? marks[y][x] : c)).join('')
  );

export function art(rows: string[], pal: Pal, e: number, loose = ''): Spr {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const s = new Spr(w + 2, h + 2, (w >> 1) + 1, h + 1);
  const paint = (late: boolean) =>
    rows.forEach((r, y) =>
      [...r].forEach((ch, x) => {
        const p = pal[ch];
        if (p && loose.includes(ch) === late)
          s.set(x + 1, y + 1, isLit(p) ? p.c : p, isLit(p) ? p.e : e);
      })
    );
  paint(false);
  s.outline();
  paint(true);
  return s;
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
