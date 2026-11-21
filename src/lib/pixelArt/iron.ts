import { paint } from './canvas';
import { fbm } from './noise';
import { INK, RAMPS, pick, type Ramp, type Rgb } from './palette';
import { ironPx } from './timber';

export function ironButton(
  w: number,
  h: number,
  o: { down?: boolean; rivets?: boolean } = {}
): HTMLCanvasElement {
  const down = !!o.down;
  return paint(w, h, (x, y) => {
    const l = x;
    const r = w - 1 - x;
    const t = y;
    const b = h - 1 - y;
    const d = Math.min(l, r, t, b);
    const cx = Math.min(l, r);
    const cy = Math.min(t, b);
    if (cx + cy === 0) return null;
    if (d === 0) return INK;
    if (d === 1) return ironPx(x, y, t === 1 || l === 1 ? (down ? 0 : 4) : down ? 3 : 1);
    if (o.rivets && cx === 4 && cy === 4) return RAMPS.iron[6];
    if (o.rivets && cx === 5 && cy === 5) return RAMPS.iron[0];
    const k =
      0.34 +
      (fbm(x * 0.16, y * 0.16, 3, 2) - 0.5) * 0.22 +
      (down ? -0.12 : 0) +
      (t === 2 && !down ? 0.08 : 0);
    return pick(RAMPS.iron, k, x, y, 0.7);
  });
}

export function inset(w: number, h: number, o: { ramp?: Ramp; hi?: Rgb } = {}): HTMLCanvasElement {
  const ramp = o.ramp ?? RAMPS.oakDark;
  const hi = o.hi ?? RAMPS.beam[5];
  return paint(w, h, (x, y) => {
    const t = y;
    const l = x;
    const d = Math.min(l, w - 1 - x, t, h - 1 - y);
    if (d === 0) return t === 0 || l === 0 ? INK : hi;
    const k =
      0.12 + (fbm(x * 0.05, y * 0.05, 21, 2) - 0.5) * 0.16 + (t === 1 || l === 1 ? -0.1 : 0);
    return pick(ramp, k, x, y, 0.8);
  });
}
