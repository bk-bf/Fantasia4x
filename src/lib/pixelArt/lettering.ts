import { blank, paint } from './canvas';
import { clamp, dith } from './noise';
import { INK, RAMPS, type Rgb } from './palette';

export interface TextMask {
  w: number;
  h: number;
  base: number;
  at: (x: number, y: number) => boolean;
}

const SHADOW: Rgb = [8, 5, 4, 170];
const masks = new Map<string, TextMask>();

export function textMask(text: string, family: string, px: number, track = 0): TextMask {
  const key = [text, family, px, track].join('|');
  const hit = masks.get(key);
  if (hit) return hit;
  const c = blank(px * text.length + 16, px * 2);
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return { w: 1, h: 1, base: 0, at: () => false };
  const baseline = Math.round(px * 1.3);
  g.font = `${px}px "${family}"`;
  g.fillStyle = '#fff';
  let cursor = 4;
  for (const ch of text) {
    g.fillText(ch, cursor, baseline);
    cursor += Math.round(g.measureText(ch).width) + track;
  }
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const on = (x: number, y: number) => d[(y * c.width + x) * 4 + 3] > 120;
  let x0 = c.width;
  let y0 = c.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (on(x, y)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const w = Math.max(1, x1 - x0 + 1);
  const h = Math.max(1, y1 - y0 + 1);
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) bits[y * w + x] = on(x + x0, y + y0) ? 1 : 0;
  const mask = maskOf(bits, w, h, baseline - y0);
  masks.set(key, mask);
  return mask;
}

function maskOf(bits: Uint8Array, w: number, h: number, base: number): TextMask {
  return { w, h, base, at: (x, y) => x >= 0 && y >= 0 && x < w && y < h && bits[y * w + x] === 1 };
}

export function stamp(
  g: CanvasRenderingContext2D,
  m: TextMask,
  x: number,
  y: number,
  col: Rgb
): void {
  const art = paint(m.w + 1, m.h + 1, (X, Y) =>
    m.at(X, Y) ? col : m.at(X - 1, Y - 1) ? SHADOW : null
  );
  g.drawImage(art, Math.round(x), Math.round(y));
}

export function goldLetters(m: TextMask, b: number): HTMLCanvasElement {
  const ramp = RAMPS.brass;
  const n = ramp.length - 1;
  const pad = b + 1;
  const drop = b * 2;
  const near = (X: number, Y: number, r: number) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (m.at(X + i, Y + j)) return true;
    return false;
  };
  return paint(m.w + pad * 2 + drop, m.h + pad * 2 + drop, (x, y) => {
    const X = x - pad;
    const Y = y - pad;
    if (m.at(X, Y)) {
      if (!m.at(X, Y - b) || !m.at(X - b, Y - b)) return ramp[n];
      if (!m.at(X, Y + b) || !m.at(X + b, Y + b)) return ramp[2];
      if (!m.at(X - b, Y)) return ramp[n - 1];
      if (!m.at(X + b, Y)) return ramp[3];
      return ramp[clamp(n - 1 - Math.floor((Y / m.h) * 2.2 + (dith(x, y) - 0.5) * 0.5), 3, n - 1)];
    }
    if (near(X, Y, b)) return INK;
    return near(X - drop, Y - drop, b) ? [6, 4, 3, 150] : null;
  });
}
