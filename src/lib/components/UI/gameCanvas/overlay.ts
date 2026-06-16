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

/** #rrggbb → {r,g,b} in 0..1; null on a missing/bad hex. */
function hexToRgb(hex?: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

/**
 * Render dropped items with their own item-sheet sprite (resolved from the def's `charSpans`),
 * tinted by the def colour. Stored stockpile items use the item colour; freshly-dropped items not
 * yet hauled are tinted gold as a "needs hauling" cue. Items whose def has no `charSpans` fall back
 * to the legacy '$' (stored) / '*' (loose) marker glyphs.
 */
export function overlayDroppedItems(grid: GameGrid, drops: DroppedItem[]): void {
  // ASCII '*' glyph index in the sprite sheet (glyph 42 in standard CP437)
  const STAR_GLYPH = glyph(SHEET.MAP, 42);
  // '$' glyph (glyph 36 in CP437) for stored stockpile items
  const DOLLAR_GLYPH = glyph(SHEET.MAP, 36);
  const GOLD = { r: 1.0, g: 0.85, b: 0.1 };
  const GREEN = { r: 0.2, g: 0.9, b: 0.3 };
  for (const drop of drops) {
    const existing = grid.getTile(drop.x, drop.y);
    const def = itemService.getItemById(drop.resourceId);
    const sprite = def?.charSpans
      ? (resolveCharSpans(def.charSpans as CharSpan[])[0] ?? null)
      : null;
    // With a real sprite: item colour when stored, gold while it still needs hauling.
    // Without one: legacy marker glyphs ('$' green stored / '*' gold loose).
    const char = sprite ?? (drop.stored ? DOLLAR_GLYPH : STAR_GLYPH);
    const foreground = sprite
      ? drop.stored
        ? (hexToRgb(def?.color) ?? GREEN)
        : GOLD
      : drop.stored
        ? GREEN
        : GOLD;
    grid.setTile(drop.x, drop.y, {
      char,
      foreground,
      background: existing?.background ?? { r: 0, g: 0, b: 0 },
      position: { x: drop.x, y: drop.y }
    });
  }
}

/**
 * A signature of only the building fields that `buildGameGrid` actually draws (id/pos/type/status/
 * deconstruct/paused) — used to skip terrain rebuilds when a lit campfire mutates `fuel`/`lit` each
 * tick (invisible on the map) but nothing visible changed.
 */
export function buildingsVisualSig(bs: PlacedBuilding[]): string {
  let sig = '';
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    sig += `${b.id}:${b.x},${b.y}:${b.type}:${b.status}:${b.deconstructQueued ? 1 : 0}:${b.paused ? 1 : 0}|`;
  }
  return sig;
}
