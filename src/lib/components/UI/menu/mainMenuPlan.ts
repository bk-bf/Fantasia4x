import { textMask, type TextMask } from '$lib/pixelArt/lettering';
import { clamp } from '$lib/pixelArt/noise';
import { SKY_BOWL_W } from '$lib/pixelArt/skyBowl';

export const TITLE_FONT = 'Fantasia Title';
export const BANNER_FONT = 'Fantasia Banner';
export const PIXEL_FONT = 'Fantasia Pixel';
export const FLAG_W = 196;
export const FLAG_H = 30;
export const SWAY_PAD = 4;
export const LIT_EXTRA = 8;

const TITLE_GRID = 24;
const FLAG_STEP = 35;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TitleArt {
  mask: TextMask;
  bevel: number;
}

export interface MenuPlan {
  scale: number;
  title: TitleArt;
  board: Rect;
  pole: Rect;
  flags: Rect[];
  bowlX: number;
}

export function pickTitle(maxW: number, maxH: number): TitleArt {
  let art: TitleArt = { mask: textMask('Fantasia', TITLE_FONT, TITLE_GRID), bevel: 1 };
  for (let i = 14; i >= 1; i--) {
    const px = TITLE_GRID * i;
    const mask = textMask('Fantasia', TITLE_FONT, px, Math.max(1, Math.round(px / 20)));
    art = { mask, bevel: Math.max(1, Math.round(px / 40)) };
    if (mask.w <= maxW && mask.h <= maxH) break;
  }
  return art;
}

function fit(
  scale: number,
  viewW: number,
  viewH: number,
  count: number,
  last: boolean
): MenuPlan | null {
  const lw = Math.floor(viewW / scale);
  const lh = Math.floor(viewH / scale);
  const title = pickTitle(clamp(lw - 76, 120, 300), 60);
  const bw = Math.max(title.mask.w + 44, FLAG_W);
  const bh = title.mask.h + 40;
  const bx = 14;
  const by = bx + bw > (lw >> 1) - SKY_BOWL_W / 2 - 5 ? 62 : 18;
  const top = by + bh + 8;
  const bottom = top + count * FLAG_STEP + 6;
  const tooBig = bottom > lh || bx + 19 + FLAG_W + LIT_EXTRA > lw;
  if (tooBig && !last) return null;
  return {
    scale,
    title,
    board: { x: bx, y: by, w: bw, h: bh },
    pole: { x: bx + 10, y: by - 9, w: 0, h: lh - by + 13 },
    flags: Array.from({ length: count }, (_, i) => ({
      x: bx + 19,
      y: top + i * FLAG_STEP,
      w: FLAG_W,
      h: FLAG_H
    })),
    bowlX: (lw - SKY_BOWL_W) >> 1
  };
}

export function planMenu(viewW: number, viewH: number, count: number): MenuPlan {
  const first = viewW >= 2600 && viewH >= 1300 ? 3 : 2;
  for (let s = first; s > 1; s--) {
    const plan = fit(s, viewW, viewH, count, false);
    if (plan) return plan;
  }
  return fit(1, viewW, viewH, count, true) as MenuPlan;
}
