export type Viewport = { x: number; y: number; w: number; h: number };

const ZOOM_OUT_FLOOR = 0.2;
const ZOOM_REF_LOW = 12;
const ZOOM_REF_HIGH = 28;
const OFFSCREEN_MAX = 0.12;
const OFFSCREEN_MARGIN = 0.6;

export function spatialAt(x: number, y: number, vp: Viewport): number {
  const x0 = vp.x;
  const y0 = vp.y;
  const x1 = vp.x + vp.w;
  const y1 = vp.y + vp.h;
  if (x >= x0 && x < x1 && y >= y0 && y < y1) return 1;
  const dx = x < x0 ? x0 - x : x >= x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y >= y1 ? y - y1 : 0;
  const mX = vp.w * OFFSCREEN_MARGIN;
  const mY = vp.h * OFFSCREEN_MARGIN;
  if (dx > mX || dy > mY) return 0;
  return OFFSCREEN_MAX * Math.max(0, Math.min(1 - dx / mX, 1 - dy / mY));
}

export function zoomGainFor(tile: number): number {
  const n = Math.max(0, Math.min(1, (tile - ZOOM_REF_LOW) / (ZOOM_REF_HIGH - ZOOM_REF_LOW)));
  return ZOOM_OUT_FLOOR + (1 - ZOOM_OUT_FLOOR) * n;
}
