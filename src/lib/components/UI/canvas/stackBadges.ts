import type { DroppedItem } from '$lib/game/core/types.js';
import { BASE_TILE_PX } from '$lib/webgl/tile-types.js';
import type { MapView } from './drawnSelection';

const MIN_TILE = 16;
const FONT_PX = 5;
const MOST = 999;
const INK = '#ffffff';

export interface StackBadge {
  label: string;
  x: number;
  y: number;
}

type Offset = { x: number; y: number } | undefined;

export function stackBadges(
  drops: readonly DroppedItem[],
  v: MapView,
  width: number,
  height: number,
  offsetOf: (x: number, y: number) => Offset = () => undefined
): StackBadge[] {
  if (v.tileWidth < MIN_TILE) return [];
  const totals = new Map<string, { x: number; y: number; total: number }>();
  for (const d of drops) {
    const key = `${d.x},${d.y}`;
    const at = totals.get(key);
    if (at) at.total += d.quantity ?? 1;
    else totals.set(key, { x: d.x, y: d.y, total: d.quantity ?? 1 });
  }
  const out: StackBadge[] = [];
  for (const { x, y, total } of totals.values()) {
    if (total < 2) continue;
    const off = offsetOf(x, y);
    const sx = (x - v.viewX + (off?.x ?? 0) / BASE_TILE_PX) * v.tileWidth;
    const sy = (y - v.viewY + (off?.y ?? 0) / BASE_TILE_PX) * v.tileHeight;
    if (sx < -v.tileWidth || sy < -v.tileHeight) continue;
    if (sx > width + v.tileWidth || sy > height + v.tileHeight) continue;
    out.push({
      label: total > MOST ? `${MOST}+` : String(total),
      x: sx + v.tileWidth - 1,
      y: sy + v.tileHeight - 1
    });
  }
  return out;
}

export function drawStackBadges(ctx: CanvasRenderingContext2D, badges: readonly StackBadge[]) {
  if (badges.length === 0) return;
  ctx.save();
  ctx.font = `bold ${FONT_PX}px monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = INK;
  for (const b of badges) ctx.fillText(b.label, b.x, b.y);
  ctx.restore();
}
