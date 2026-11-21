import { blank, paint } from './canvas';
import { clamp, dith, fbm, hash, noise } from './noise';
import { RAMPS, pick, type Rgb } from './palette';

export interface PageOptions {
  seed?: number;
  rag?: number;
  rule?: number;
  base?: number;
}

function ruleCorner(cx: number, cy: number, rule: number, x: number, y: number): Rgb | null {
  const m = Math.max(Math.abs(cx - rule), Math.abs(cy - rule));
  if (m === 3) return RAMPS.inkwash[1];
  if (m === 2) return RAMPS.gold[dith(x, y) > 0.5 ? 3 : 2];
  if (m === 1) return RAMPS.vermilion[2];
  if (m === 0) return RAMPS.gold[4];
  return null;
}

export function vellumPage(w: number, h: number, o: PageOptions = {}): HTMLCanvasElement {
  const seed = o.seed ?? 3;
  const rag = o.rag ?? 1.6;
  const rule = o.rule ?? 0;
  const base = o.base ?? 0.78;
  return paint(w, h, (x, y) => {
    const l = x;
    const r = w - 1 - x;
    const t = y;
    const b = h - 1 - y;
    const d = Math.min(l, r, t, b);
    const wob =
      (noise(x * 0.11, y * 0.11, seed) - 0.5) * rag * 2.2 +
      (hash(x >> 1, y >> 1, seed + 1) - 0.5) * rag * 0.5;
    const ed = d + wob;
    if (ed < 0.6) return null;
    let k =
      base +
      (fbm(x * 0.011, y * 0.011, seed + 2, 3) - 0.5) * 0.3 +
      (fbm(x * 0.07, y * 0.07, seed + 4, 2) - 0.5) * 0.1;
    k -= Math.max(0, 1 - ed / 12) * 0.26;
    if (ed < 1.7) k -= 0.3;
    if (hash(x, y, seed + 6) > 0.988) k -= 0.14;
    if (rule) {
      const cx = Math.min(l, r);
      const cy = Math.min(t, b);
      if (cx <= rule + 4 && cy <= rule + 4 && cx >= rule - 3 && cy >= rule - 3) {
        const c = ruleCorner(cx, cy, rule, x, y);
        if (c) return c;
      } else if (Math.abs(cx - rule) + Math.abs(cy - rule) > 0) {
        if (d === rule && hash(x, y, seed + 8) > 0.03) return RAMPS.inkwash[1];
        if (d === rule + 2 && hash(x >> 1, y >> 1, seed + 9) > 0.06) return RAMPS.vermilion[2];
      }
    }
    return pick(RAMPS.vellum, k, x, y, 0.9);
  });
}

export function candleMask(src: HTMLCanvasElement, rim = 22): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const c = blank(w, h);
  const g = c.getContext('2d');
  if (!g) return c;
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const cx = 0.5 * w;
  const cy = 0.5 * h;
  const rx = w * 0.62 + 30;
  const ry = h * 0.62 + 30;
  for (let y = 0, i = 3; y < h; y++)
    for (let x = 0; x < w; x++, i += 4) {
      const q = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const e = clamp(Math.min(x, y, w - 1 - x, h - 1 - y) / rim, 0, 1);
      if (e * clamp(1.5 - q * 0.6, 0, 1) < dith(x, y) * 0.92 + 0.04) d[i] = 0;
    }
  g.putImageData(img, 0, 0);
  return c;
}
