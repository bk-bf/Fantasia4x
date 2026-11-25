import { clamp, fbm } from '../noise';
import type { Rgb } from '../palette';
import { FX_FONT } from './font';
import { advance, keep, typeset, type Pair } from './glyphs';
import { P, RAMP, Spr, hex, melt, rp } from './spr';

export type BubbleSkin = 'timber' | 'vellum';

export interface Bubble {
  alpha: number;
  plate: Pair;
  frame: Pair;
}

const AROUND = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1]
];

function wrap(text: string): string[] {
  const T = FX_FONT.thin;
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const t = cur ? `${cur} ${w}` : w;
    if (cur && advance(t, T, 2) > 150) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  lines.push(cur);
  return lines;
}

function paint(text: string, skin: BubbleSkin, tail: number | undefined): Bubble {
  const lr = wrap(text).map((l) => typeset(l, FX_FONT.thin, { gap: 2, tall: true }));
  const tw = Math.max(...lr.map((r) => r[0].length));
  const LH = 13;
  const w = tw + 12;
  const bh = lr.length * LH + 6;
  const tx = clamp(tail === undefined ? w >> 1 : tail < 0 ? w + tail : tail, 7, w - 8);
  const plate = new Spr(w, bh + 5, tx, bh + 4);
  const frame = new Spr(w, bh + 5, tx, bh + 4);
  const V = skin === 'vellum';
  const line: Rgb = V ? RAMP.inkwash[1] : P.ink;
  const ink: Rgb = V ? RAMP.inkwash[0] : hex('#f6e6be');
  const rim: Rgb = V ? RAMP.vellum[6] : RAMP.beam[5];
  const fill = (x: number, y: number, low: boolean) =>
    V
      ? rp(
          RAMP.vellum,
          0.82 + (fbm(x * 0.08, y * 0.08, 7, 2) - 0.5) * 0.3 - (low ? 0.22 : 0),
          x,
          y,
          0.8
        )
      : rp(
          RAMP.oakDark,
          0.56 + (fbm(x * 0.05, y * 0.4, 9, 2) - 0.5) * 0.5 - (low ? 0.2 : 0),
          x,
          y,
          0.8
        );
  const halo: Rgb = V ? RAMP.vellum[6] : RAMP.oakDark[1];
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < w; x++) {
      const l = x;
      const r = w - 1 - x;
      const t = y;
      const b = bh - 1 - y;
      const d = Math.min(l, r, t, b);
      const cx = Math.min(l, r);
      const cy = Math.min(t, b);
      if (cx + cy < 2) continue;
      if (d === 0 || cx + cy === 2) frame.set(x, y, line, 160);
      else if (d === 1 && (t === 1 || l === 1)) frame.set(x, y, rim, 160);
      else plate.set(x, y, fill(x, y, b === 1 || r === 1), 160);
    }
  for (let j = 0; j < 5; j++)
    for (let i = -(4 - j); i <= 4 - j; i++) {
      if (Math.abs(i) === 4 - j) frame.set(tx + i, bh - 1 + j, line, 160);
      else {
        plate.set(tx + i, bh - 1 + j, fill(tx + i, bh - 1 + j, i > 0), 160);
        frame.c[(bh - 1 + j) * w + tx + i] = null;
      }
    }
  const on = (rows: string[], x: number, y: number) =>
    y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] === '#';
  lr.forEach((rows, li) => {
    const ox = 6;
    const oy = 4 + li * LH;
    for (let y = -1; y <= rows.length; y++)
      for (let x = -1; x <= rows[0].length; x++) {
        if (on(rows, x, y)) frame.set(ox + x, oy + y, ink, 200);
        else if (AROUND.some(([a, b]) => on(rows, x + a, y + b)))
          frame.set(ox + x, oy + y, halo, 160);
      }
  });
  return {
    alpha: V ? 0.8 : 0.72,
    plate: [plate, melt(plate, 0.5)],
    frame: [frame, melt(frame, 0.5)]
  };
}

export const bubble = (text: string, skin: BubbleSkin, tail?: number): Bubble =>
  keep(`bub${skin}${text}${tail}`, () => paint(text, skin, tail));

export function bubbleWidth(text: string): number {
  const T = FX_FONT.thin;
  return Math.max(...wrap(text).map((l) => advance(l, T, 2))) + 12;
}

export const bubbleHeight = (text: string): number => wrap(text).length * 13 + 11;
