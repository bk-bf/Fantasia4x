// Pure overlay/render helpers for GameCanvas (P-4). These are the side-effect-free pieces of the
// Canvas2D/WebGL overlay path — safe to extract as free functions. The stateful per-frame painters
// (updatePawnOverlay, updateWorldEffectOverlays, drawDesignations) still live in GameCanvas: they
// read ~20 reactive vars + the render-pos interpolation Maps + the renderer each frame, so they
// need a stateful-renderer redesign rather than a mechanical move.
import type { GameGrid } from '$lib/webgl/game-grid.js';
import type { DroppedItem, PlacedBuilding } from '$lib/game/core/types.js';
import { glyph, SHEET } from '$lib/webgl/tilesets.js';

/** Render dropped items as a gold '*' glyph; stored stockpile items as a green '$'. */
export function overlayDroppedItems(grid: GameGrid, drops: DroppedItem[]): void {
  // ASCII '*' glyph index in the sprite sheet (glyph 42 in standard CP437)
  const STAR_GLYPH = glyph(SHEET.MAP, 42);
  // '$' glyph (glyph 36 in CP437) for stored stockpile items
  const DOLLAR_GLYPH = glyph(SHEET.MAP, 36);
  for (const drop of drops) {
    const existing = grid.getTile(drop.x, drop.y);
    if (drop.stored) {
      // Stored in stockpile — render as green '$'
      grid.setTile(drop.x, drop.y, {
        char: DOLLAR_GLYPH,
        foreground: { r: 0.2, g: 0.9, b: 0.3 }, // green
        background: existing?.background ?? { r: 0, g: 0, b: 0 },
        position: { x: drop.x, y: drop.y }
      });
    } else {
      // Freshly dropped, awaiting hauling — render as gold '*'
      grid.setTile(drop.x, drop.y, {
        char: STAR_GLYPH,
        foreground: { r: 1.0, g: 0.85, b: 0.1 }, // gold
        background: existing?.background ?? { r: 0, g: 0, b: 0 },
        position: { x: drop.x, y: drop.y }
      });
    }
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
