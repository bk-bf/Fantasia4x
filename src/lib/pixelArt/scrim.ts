import { paint } from './canvas';
import { dith } from './noise';

const SHADE = [9, 7, 11, 118] as const;
const FADE = 44;

export function scrim(w: number, h: number, right: boolean): HTMLCanvasElement {
  return paint(w, h, (x, y) => {
    const inner = right ? x : w - 1 - x;
    return Math.min(1, inner / FADE) > dith(x, y) * 0.96 + 0.02 ? SHADE : null;
  });
}
