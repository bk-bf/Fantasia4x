import { paint } from './canvas';
import { dith, fbm, hash, noise } from './noise';
import { RAMPS, pick, type Ramp, type Rgb } from './palette';

export interface VellumOptions {
  seed?: number;
  ramp?: Ramp;
  rag?: number;
  rule?: number;
  base?: number;
}

function ruleCorner(m: number, x: number, y: number): Rgb | null {
  if (m === 3) return RAMPS.inkwash[1];
  if (m === 2) return RAMPS.gold[dith(x, y) > 0.5 ? 3 : 2];
  if (m === 1) return RAMPS.vermilion[2];
  if (m === 0) return RAMPS.gold[4];
  return null;
}

export function vellum(w: number, h: number, o: VellumOptions = {}): HTMLCanvasElement {
  const seed = o.seed ?? 3;
  const ramp = o.ramp ?? RAMPS.vellum;
  const rag = o.rag ?? 1.6;
  const rule = o.rule ?? 0;
  const base = o.base ?? 0.78;
  return paint(w, h, (x, y) => {
    const cx = Math.min(x, w - 1 - x);
    const cy = Math.min(y, h - 1 - y);
    const d = Math.min(cx, cy);
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
      const q = Math.abs(cx - rule) + Math.abs(cy - rule);
      if (cx <= rule + 4 && cy <= rule + 4 && cx >= rule - 3 && cy >= rule - 3) {
        const c = ruleCorner(Math.max(Math.abs(cx - rule), Math.abs(cy - rule)), x, y);
        if (c) return c;
      } else if (q > 0) {
        if (d === rule && hash(x, y, seed + 8) > 0.03) return RAMPS.inkwash[1];
        if (d === rule + 2 && hash(x >> 1, y >> 1, seed + 9) > 0.06) return RAMPS.vermilion[2];
      }
    }
    return pick(ramp, k, x, y, 0.9);
  });
}
