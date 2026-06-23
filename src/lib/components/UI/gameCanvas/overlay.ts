// Pure overlay/render helpers for GameCanvas (P-4). These are the side-effect-free pieces of the
// Canvas2D/WebGL overlay path — safe to extract as free functions. The stateful per-frame painters
// (updatePawnOverlay, updateWorldEffectOverlays, drawDesignations) still live in GameCanvas: they
// read ~20 reactive vars + the render-pos interpolation Maps + the renderer each frame, so they
// need a stateful-renderer redesign rather than a mechanical move.
import type { GameGrid } from '$lib/webgl/game-grid.js';
import type { DroppedItem } from '$lib/game/core/types.js';
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
    const existing = grid.getTile(drop.x, drop.y);
    const def = itemService.getItemById(drop.resourceId);
    const sprite = def?.charSpans
      ? (resolveCharSpans(def.charSpans as CharSpan[])[0] ?? null)
      : null;
    // With a real sprite: item colour when stored, gold while it still needs hauling (muted when
    // forbidden). Without one: legacy marker glyphs ('$' green stored / '*' gold loose).
    const char = sprite ?? (drop.stored ? DOLLAR_GLYPH : STAR_GLYPH);
    const foreground = drop.stored
      ? sprite
        ? (hexToRgb(def?.color) ?? GREEN)
        : GREEN
      : drop.forbidden
        ? FORBIDDEN
        : GOLD;
    grid.setTile(drop.x, drop.y, {
      char,
      foreground,
      background: existing?.background ?? { r: 0, g: 0, b: 0 },
      position: { x: drop.x, y: drop.y }
    });
  }
}

// buildingsVisualSig moved to core/buildingSig (shared with the sim worker — see that module).
