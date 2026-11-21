import { paint } from './canvas';
import { clamp, dith, fbm, noise } from './noise';
import { INK, RAMPS, pick, tone, type Ramp } from './palette';

const TAIL = 12;

export function pennant(
  w: number,
  h: number,
  ramp: Ramp,
  seed: number,
  lit: boolean
): HTMLCanvasElement {
  const n = ramp.length - 1;
  const mid = (h - 1) / 2;
  const fold = (x: number, y: number) => {
    const swell =
      Math.sin(x * 0.42 + Math.sin(y * 0.2 + seed) * 0.9 + noise(x * 0.05, y * 0.05, seed) * 1.5) >
      0.5;
    const crease = Math.sin(x * 0.42 + 2.2 + y * 0.05) > 0.72;
    return ramp[clamp(n - 2 + (swell ? 1 : 0) - (crease ? 1 : 0), 0, n)];
  };
  const notch = (x: number, y: number, m: number) =>
    w - 1 - x < TAIL + m &&
    Math.abs(y - mid) < (TAIL + m - (w - 1 - x)) * (h / 2 / TAIL) * 0.55 + m;
  return paint(w, h, (x, y) => {
    const t = y;
    const b = h - 1 - y;
    if (notch(x, y, 0)) return null;
    if (t === 0 || b === 0 || x === 0 || notch(x, y, 1)) return RAMPS.inkwash[0];
    if (t === 2 || b === 2) return RAMPS.gold[dith(x, y) > 0.45 ? 3 : 2];
    if (lit && (t === 3 || b === 3 || t === 4 || b === 4)) return RAMPS.gold[4];
    return tone(fold(x, y), x < 4 ? 0.6 : t === 1 ? 1.2 : b === 1 ? 0.7 : 1);
  });
}

const POLE_IRON = [0, 5, 5, 4, 4, 3, 2, 1, 1, 0];
const POLE_WOOD = [0, 0.86, 0.8, 0.7, 0.6, 0.5, 0.4, 0.28, 0.16, 0];

export const POLE_WIDTH = POLE_IRON.length;

export function pole(h: number): HTMLCanvasElement {
  return paint(POLE_WIDTH, h, (x, y) => {
    if (y === 0 || y === h - 1 || x === 0 || x === POLE_WIDTH - 1) return INK;
    if (y < 4) return RAMPS.iron[POLE_IRON[x]];
    return pick(RAMPS.beam, POLE_WOOD[x] + (fbm(x * 0.9, y * 0.06, 5, 2) - 0.5) * 0.24, x, y, 0.8);
  });
}

export function lampGlow(w: number, h: number): HTMLCanvasElement {
  return paint(w, h, (x, y) => {
    const a = clamp(1 - Math.hypot((x - w / 2) / (w * 0.56), (y - h / 2) / (h * 0.9)), 0, 1);
    const l = Math.floor(a * 4.2 + dith(x, y) - 0.5);
    return l > 0 ? [34 * l, 19 * l, 6 * l] : null;
  });
}
