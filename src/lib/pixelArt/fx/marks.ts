import { clamp, dith, hash } from '../noise';
import type { Ramp, Rgb } from '../palette';
import { keep, shade } from './glyphs';
import { P, STAR, Spr, copy, melt } from './spr';

export const coin = (): Spr[] =>
  keep('coin', () =>
    [9, 7, 3, 7].map((w, i) => {
      const s = new Spr(11, 11, 5, 10);
      s.ball(5.5, 5.5, w / 2, 4.5, 0, P.gold, { d: 0.25, bias: 0.14, e: 130 });
      if (w > 5) {
        s.rect(4 + (i === 3 ? 1 : 0), 4, w > 7 ? 3 : 2, 3, P.gold[1], 130);
        s.set(4 + (i === 3 ? 1 : 0), 4, P.gold[0], 130);
      } else s.rect(5, 2, 1, 7, P.gold[4], 130);
      return s.outline();
    })
  );

const VOID: Rgb = [20, 15, 12];
const SLOT: Rgb = [44, 33, 24];

export function bar(w: number, frac: number, ramp: Ramp, pegs: boolean): Spr {
  return keep(`bar${w}${Math.round(frac * 100)}${ramp[2]}${pegs ? 1 : 0}`, () => {
    const h = 5;
    const s = new Spr(w, h, w >> 1, h - 1);
    const n = ramp.length - 1;
    const iw = w - 2;
    const fx = Math.round(iw * clamp(frac, 0, 1));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const t = y;
        const b = h - 1 - y;
        const i = x - 1;
        if (x === 0 || x === w - 1 || t === 0 || b === 0) {
          if (!((x === 0 || x === w - 1) && (t === 0 || b === 0))) s.set(x, y, P.ink);
          continue;
        }
        const fill =
          ramp[t === 1 ? n : b === 1 ? n - 3 : n - 1 - (hash(x >> 1, y, 5) > 0.86 ? 1 : 0)];
        if (pegs) s.set(x, y, i % 3 === 2 ? VOID : i < fx ? fill : SLOT, 170);
        else
          s.set(
            x,
            y,
            i < fx && !(i >= fx - 2 && dith(x, y) > (fx - i) / 2.5)
              ? fill
              : hash(x, y, 6) > 0.9
                ? SLOT
                : VOID,
            170
          );
      }
    return s;
  });
}

export function ring(rx: number, ry: number, ramp: Ramp): Spr {
  return keep(`ring${rx}${ramp[2]}`, () => {
    const w = rx * 2 + 5;
    const h = ry * 2 + 5;
    const s = new Spr(w, h, w >> 1, h >> 1);
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * 6.283;
      s.set(
        w / 2 - 0.5 + Math.cos(a) * rx,
        h / 2 - 0.5 + Math.sin(a) * ry,
        ramp[Math.sin(a) < 0 ? 3 : 4],
        190
      );
    }
    return s.outline();
  });
}

export type StatusKind = 'burn' | 'frost' | 'shock';

export function tinted(spr: Spr, kind: StatusKind, amt: number): Spr {
  const memo = spr.tints ?? (spr.tints = new Map());
  const key = kind + amt;
  const hit = memo.get(key);
  if (hit) return hit;
  const ramp = kind === 'burn' ? P.fire : kind === 'frost' ? P.mana : STAR;
  const n = ramp.length - 1;
  const s = copy(spr);
  for (let i = 0; i < s.c.length; i++) {
    const c = s.c[i];
    if (!c) continue;
    const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
    s.c[i] = ramp[clamp(Math.round(l * n * 1.25 + (kind === 'frost' ? 1.4 : 1)), 0, n)];
    s.e[i] = kind === 'frost' ? 200 : 255;
  }
  const out = amt ? melt(s, amt) : s;
  memo.set(key, out);
  return out;
}

export const lick = (): Spr[] =>
  keep('lick', () =>
    [0, 1, 2, 3].map((f) => {
      const h = f === 3 ? 4 : 8 - f;
      const s = new Spr(7, 9, 3, 8);
      for (let y = 0; y < h; y++) {
        const k = (y + 1) / h;
        const half = Math.max(0, Math.round(Math.pow(k, 0.8) * 2.2 - (y === h - 1 ? 0.4 : 0)));
        const cx = 3 + (y < h * 0.45 ? (f & 1 ? 1 : -1) * (y < h * 0.25 ? 1 : 0) : 0);
        for (let x = -half; x <= half; x++)
          s.set(
            cx + x,
            8 - h + 1 + y,
            P.fire[Math.abs(x) === half ? 1 : k > 0.55 && Math.abs(x) < half - 0.5 ? 4 : 3],
            255
          );
      }
      return s.outline(P.ember[1]);
    })
  );

export const glint = (): Spr[] =>
  keep('glint', () =>
    [
      ['..#..', '.###.', '#####', '.###.', '..#..'],
      ['.#.', '###', '.#.']
    ].map((r) => shade(r, P.mana, { e: 230 }))
  );

export const arc = (): Spr[] =>
  keep('arc', () =>
    [0, 1, 2, 3].map((v) => {
      const s = new Spr(13, 13, 6, 6);
      const a = v * 1.57 + 0.5;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      let pj = 0;
      for (let i = -5; i <= 5; i++) {
        const j = i === 5 ? 0 : Math.round((hash(i, v, 81) - 0.5) * 4);
        for (const q of [pj, j])
          s.set(6 + c * i - sn * q, 6 + sn * i + c * q, STAR[i & 1 ? 5 : 4], 255);
        pj = j;
      }
      return s.outline(P.gold[0]);
    })
  );
