export const MARK_COLOR = '#ffd76a';
const MARK_SHADOW = '#0d0a10';
const BOX_FILL = 'rgb(255 230 128 / 0.06)';
const ARM_MAX = 7;
const ARM_MIN = 3;
const LINE = 2;

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function dragBox(ctx: CanvasRenderingContext2D, r: ScreenRect): void {
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = BOX_FILL;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = MARK_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(
    Math.round(r.x) + 0.5,
    Math.round(r.y) + 0.5,
    Math.round(r.w) - 1,
    Math.round(r.h) - 1
  );
  ctx.restore();
}

function bracketPath(ctx: CanvasRenderingContext2D, r: ScreenRect, arm: number, dx: number): void {
  const x0 = Math.round(r.x) + dx;
  const y0 = Math.round(r.y) + dx;
  const x1 = Math.round(r.x + r.w) + dx;
  const y1 = Math.round(r.y + r.h) + dx;
  const corners: [number, number, number, number][] = [
    [x0, y0, 1, 1],
    [x1, y0, -1, 1],
    [x0, y1, 1, -1],
    [x1, y1, -1, -1]
  ];
  for (const [cx, cy, sx, sy] of corners) {
    const hx = sx > 0 ? cx : cx - arm;
    const vy = sy > 0 ? cy : cy - arm;
    ctx.rect(hx, sy > 0 ? cy : cy - LINE, arm, LINE);
    ctx.rect(sx > 0 ? cx : cx - LINE, vy, LINE, arm);
  }
}

export function brackets(ctx: CanvasRenderingContext2D, rects: ScreenRect[]): void {
  if (rects.length === 0) return;
  ctx.save();
  for (const [color, dx] of [
    [MARK_SHADOW, 1],
    [MARK_COLOR, 0]
  ] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const r of rects) {
      const arm = Math.max(ARM_MIN, Math.min(ARM_MAX, Math.floor(Math.min(r.w, r.h) / 3)));
      bracketPath(ctx, r, arm, dx);
    }
    ctx.fill();
  }
  ctx.restore();
}
