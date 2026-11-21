import { paint } from './canvas';
import { clamp, dith, hash } from './noise';
import { INK, tone, type Ramp, type Rgb } from './palette';

export interface MeterOptions {
  empty?: Rgb;
  line?: Rgb;
  ticks?: boolean;
  tickCol?: Rgb;
}

const TICK_DEFAULT: Rgb = [58, 44, 30];
const EMPTY_DEFAULT: Rgb = [13, 10, 8];

export function meter(
  w: number,
  h: number,
  frac: number,
  ramp: Ramp,
  o: MeterOptions = {}
): HTMLCanvasElement {
  const n = ramp.length - 1;
  const fx = Math.round((w - 2) * clamp(frac, 0, 1));
  const empty = o.empty ?? EMPTY_DEFAULT;
  const line = o.line ?? INK;
  const quarter = (i: number) =>
    i === Math.round((w - 2) * 0.25) ||
    i === Math.round((w - 2) * 0.5) ||
    i === Math.round((w - 2) * 0.75);
  return paint(w, h, (x, y) => {
    const t = y;
    const b = h - 1 - y;
    if (Math.min(x, w - 1 - x, t, b) === 0) return line;
    const i = x - 1;
    const tick = o.ticks && quarter(i);
    if (i < fx && !(i >= fx - 3 && dith(x, y) > (fx - i) / 3.5)) {
      let k = n - 1;
      if (t === 1) k = n;
      else if (b === 1) k = n - 3;
      else if (b === 2) k = n - 2;
      if (tick && (t === 1 || b === 1)) k -= 2;
      if (hash(x >> 1, y, 5) > 0.9) k -= 1;
      return ramp[clamp(k, 0, n)];
    }
    if (tick && (t === 1 || b === 1)) return o.tickCol ?? TICK_DEFAULT;
    return hash(x, y, 6) > 0.9 ? tone(empty, 1.5) : empty;
  });
}
