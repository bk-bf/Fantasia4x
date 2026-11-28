import { paint } from './canvas';
import { clamp, dith, hash } from './noise';
import { RAMPS, tone, type Rgb } from './palette';
import { boards, planks } from './timber';

export interface WallShadow {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SEED = 4;
const LO = 26;
const HI = 38;

function plankWall(w: number, h: number): (x: number, y: number) => Rgb {
  const ramp = RAMPS.beam;
  const wood = planks(w, h, { dir: 'h', ramp, base: 0.3, seed: SEED, lo: LO, hi: HI });
  const rows = boards(h, SEED, LO, HI);
  return (x, y) => {
    if (rows.pos[y] === rows.wid[y] - 1) return ramp[0];
    const k = rows.id[y];
    const period = 190 + Math.floor(hash(k, 3, 17) * 120);
    const at = (x + Math.floor(hash(k, 5, 23) * period)) % period;
    return at === 0 ? ramp[0] : at === 1 ? tone(wood(x, y), 1.18) : wood(x, y);
  };
}

function shadowAt(s: WallShadow | null, x: number, y: number): number {
  if (!s) return 1;
  const d = Math.hypot(Math.max(s.x - x, 0, x - s.x - s.w), Math.max(s.y - y, 0, y - s.y - s.h));
  if (d === 0) return 0.34;
  return d < 5 && dith(x, y) > d / 5 ? 0.5 : 1;
}

export function wallBackdrop(w: number, h: number, shadow: WallShadow | null): HTMLCanvasElement {
  const wood = plankWall(w, h);
  return paint(w, h, (x, y) => {
    const r = Math.hypot((x - w / 2) / (w * 0.62), (y - h * 0.46) / (h * 0.62));
    return tone(wood(x, y), clamp(1.2 - r * 0.7, 0.3, 1) * shadowAt(shadow, x, y));
  });
}
