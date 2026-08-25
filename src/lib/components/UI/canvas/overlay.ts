import type { GameGrid } from '$lib/webgl/game-grid.js';
import type { DroppedItem, PlacedBuilding } from '$lib/game/core/types.js';
import { glyph, SHEET } from '$lib/webgl/tilesets.js';
import { resolveCharSpans, type CharSpan } from '$lib/game/core/defs/terrains.js';
import { itemService } from '$lib/game/services/ItemService.js';
import { buildingService } from '$lib/game/services/BuildingService.js';
import { isFloorBuilding, isRoofBuilding } from '$lib/webgl/fantasia-world.js';

function hexToRgb(hex?: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

const _dropVisCache = new Map<
  string,
  { sprite: string | null; storedColor: { r: number; g: number; b: number } | null }
>();
function dropVisFor(resourceId: string): {
  sprite: string | null;
  storedColor: { r: number; g: number; b: number } | null;
} {
  let v = _dropVisCache.get(resourceId);
  if (!v) {
    const def = itemService.getItemById(resourceId);
    const sprite = def?.charSpans
      ? (resolveCharSpans(def.charSpans as CharSpan[])[0] ?? null)
      : null;
    v = { sprite, storedColor: hexToRgb(def?.color) };
    _dropVisCache.set(resourceId, v);
  }
  return v;
}

export function overlayDroppedItems(
  grid: GameGrid,
  drops: DroppedItem[],
  isHidden?: (x: number, y: number) => boolean
): void {
  const STAR_GLYPH = glyph(SHEET.MAP, 42);
  const DOLLAR_GLYPH = glyph(SHEET.MAP, 36);
  const GOLD = { r: 1.0, g: 0.85, b: 0.1 };
  const GREEN = { r: 0.2, g: 0.9, b: 0.3 };
  const FORBIDDEN = { r: 0.42, g: 0.36, b: 0.28 };
  for (const drop of drops) {
    if (isHidden?.(drop.x, drop.y)) continue;
    const { sprite, storedColor } = dropVisFor(drop.resourceId);
    const char = sprite ?? (drop.stored ? DOLLAR_GLYPH : STAR_GLYPH);
    const foreground = drop.stored
      ? sprite
        ? (storedColor ?? GREEN)
        : GREEN
      : drop.forbidden
        ? FORBIDDEN
        : GOLD;
    const existing = grid.getTile(drop.x, drop.y);
    grid.setTile(drop.x, drop.y, {
      char,
      foreground,
      background: existing?.background ?? { r: 0, g: 0, b: 0 },
      position: { x: drop.x, y: drop.y }
    });
  }
}

const DECONSTRUCT_GLYPH = glyph(SHEET.MAP, 88);
const DECONSTRUCT_FG = { r: 1.0, g: 0.25, b: 0.05 };

const _buildingVisCache = new Map<
  string,
  { sprite: string; color: { r: number; g: number; b: number } }
>();
function buildingVisFor(typeId: string): {
  sprite: string;
  color: { r: number; g: number; b: number };
} {
  let v = _buildingVisCache.get(typeId);
  if (!v) {
    const def = buildingService.getBuildingById(typeId);
    const sprite = def?.charSpans ? (resolveCharSpans(def.charSpans as CharSpan[])[0] ?? '#') : '#';
    const color = hexToRgb(def?.color) ?? { r: 0.87, g: 0.62, b: 0.12 };
    v = { sprite, color };
    _buildingVisCache.set(typeId, v);
  }
  return v;
}

export function overlayBuildings(
  grid: GameGrid,
  buildings: PlacedBuilding[],
  isHidden?: (x: number, y: number) => boolean
): void {
  for (const b of buildings) {
    if (b.status !== 'complete') continue;
    if (isFloorBuilding(b) || isRoofBuilding(b)) continue;
    if (isHidden?.(b.x, b.y)) continue;
    const { sprite, color } = buildingVisFor(b.type);
    grid.setTile(b.x, b.y, {
      char: b.deconstructQueued ? DECONSTRUCT_GLYPH : sprite,
      foreground: b.deconstructQueued ? DECONSTRUCT_FG : color,
      background: { r: 0, g: 0, b: 0 },
      position: { x: b.x, y: b.y }
    });
  }
}
