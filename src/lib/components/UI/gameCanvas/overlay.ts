// Pure overlay/render helpers for GameCanvas (P-4). These are the side-effect-free pieces of the
// Canvas2D/WebGL overlay path — safe to extract as free functions. The stateful per-frame painters
// (updatePawnOverlay, updateWorldEffectOverlays, drawDesignations) still live in GameCanvas: they
// read ~20 reactive vars + the render-pos interpolation Maps + the renderer each frame, so they
// need a stateful-renderer redesign rather than a mechanical move.
import type { GameGrid } from '$lib/webgl/game-grid.js';
import type { DroppedItem, PlacedBuilding } from '$lib/game/core/types.js';
import { glyph, SHEET } from '$lib/webgl/tilesets.js';
import { resolveCharSpans, type CharSpan } from '$lib/game/core/Terrains.js';
import { itemService } from '$lib/game/services/ItemService.js';
import { buildingService } from '$lib/game/services/BuildingService.js';
import { isFloorBuilding, isRoofBuilding } from '$lib/webgl/fantasia-world.js';

/** #rrggbb → {r,g,b} in 0..1; null on a missing/bad hex. */
function hexToRgb(hex?: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

// Per-resource static visuals (sprite glyph + stored tint), resolved once. The item DB never mutates
// at runtime, so `resolveCharSpans`/`hexToRgb`/`getItemById` — previously called for EVERY drop EVERY
// frame in the loop below — are memoised here, killing that per-frame allocation churn (the GC the perf
// spec warns about). Keyed by resourceId.
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

/**
 * Render dropped items with their own item-sheet sprite (resolved from the def's `charSpans`),
 * tinted by the def colour. Stored stockpile items use the item colour; freshly-dropped items not
 * yet hauled are tinted gold as a "needs hauling" cue. Items whose def has no `charSpans` fall back
 * to the legacy '$' (stored) / '*' (loose) marker glyphs.
 */
export function overlayDroppedItems(
  grid: GameGrid,
  drops: DroppedItem[],
  isHidden?: (x: number, y: number) => boolean
): void {
  // ASCII '*' glyph index in the sprite sheet (glyph 42 in standard CP437)
  const STAR_GLYPH = glyph(SHEET.MAP, 42);
  // '$' glyph (glyph 36 in CP437) for stored stockpile items
  const DOLLAR_GLYPH = glyph(SHEET.MAP, 36);
  const GOLD = { r: 1.0, g: 0.85, b: 0.1 };
  const GREEN = { r: 0.2, g: 0.9, b: 0.3 };
  // Forbidden loose stacks (e.g. an unclaimed wild carcass) — a muted grey-brown so they read as
  // "left alone / not being hauled" rather than the gold "needs hauling" cue.
  const FORBIDDEN = { r: 0.42, g: 0.36, b: 0.28 };
  for (const drop of drops) {
    // Skip items on fog-hidden tiles — they'd float over the mountain silhouette.
    if (isHidden?.(drop.x, drop.y)) continue;
    const { sprite, storedColor } = dropVisFor(drop.resourceId);
    // With a real sprite: item colour when stored, gold while it still needs hauling (muted when
    // forbidden). Without one: legacy marker glyphs ('$' green stored / '*' gold loose).
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

// Demolition-queued glyph (matches fantasia-world's baked path) for deconstruct-marked buildings.
const DECONSTRUCT_GLYPH = glyph(SHEET.MAP, 88);
const DECONSTRUCT_FG = { r: 1.0, g: 0.25, b: 0.05 };

// Per-building-type static visuals (sprite glyph + tint), resolved once — same memo trick as
// dropVisFor so overlayBuildings never re-resolves charSpans/colour per building per frame.
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

/**
 * Render completed buildings as a glyph-only overlay (sprite from the def's `charSpans`, tinted by its
 * colour) so the floor/ground baked in the terrain grid shows through the sprite's transparent pixels —
 * two stacked sprites, the same way items composite over terrain. FLOORS and ROOFS are skipped: floors
 * are the ground surface and roofs only shade the terrain cell, so both stay baked in the terrain grid.
 * Deconstruct-queued buildings render the orange demolition marker instead.
 */
export function overlayBuildings(
  grid: GameGrid,
  buildings: PlacedBuilding[],
  isHidden?: (x: number, y: number) => boolean
): void {
  for (const b of buildings) {
    if (b.status !== 'complete') continue;
    if (isFloorBuilding(b) || isRoofBuilding(b)) continue; // baked into the terrain grid
    if (isHidden?.(b.x, b.y)) continue; // a building on a fog-hidden tile must not float over the silhouette
    const { sprite, color } = buildingVisFor(b.type);
    grid.setTile(b.x, b.y, {
      char: b.deconstructQueued ? DECONSTRUCT_GLYPH : sprite,
      foreground: b.deconstructQueued ? DECONSTRUCT_FG : color,
      background: { r: 0, g: 0, b: 0 },
      position: { x: b.x, y: b.y }
    });
  }
}

// buildingsVisualSig moved to core/buildingSig (shared with the sim worker — see that module).
