// Shared sprite-sheet cache for GameCanvas (P-4 first step).
//
// The BMP tilesets are loaded once, magenta (#FF00FF) keyed out to transparency, and cached as
// off-screen canvases. Both the HUD sprite-icon action and the Canvas2D designation overlay draw
// from these same canvases, so the cache lives here rather than as component-local state. A single
// `onSheetLoaded` callback lets the component refresh whatever depends on a freshly-loaded sheet
// (HUD icons + the designation overlay).

export type SheetName = 'tiles' | 'items';
export type HudSpriteIconRef = { sheet: SheetName; id: number };

/** Sprite cell size in the source sheets (16 columns per row). */
export const SHEET_CELL_W = 12;
export const SHEET_CELL_H = 18;

const SHEET_URLS: Record<SheetName, string> = {
  tiles: '/tilesets/bitlands_tiles.bmp',
  items: '/tilesets/bitlands_items.bmp'
};

const cache: Record<SheetName, HTMLCanvasElement | null> = { tiles: null, items: null };
const loading: Record<SheetName, boolean> = { tiles: false, items: false };
let onLoadedCb: (() => void) | null = null;

/** Register a callback fired whenever a sheet finishes loading (component redraws HUD + overlay). */
export function onSheetLoaded(cb: () => void): void {
  onLoadedCb = cb;
}

/** The cached, magenta-keyed sheet canvas, or null until {@link loadSheet} has finished. */
export function getSheet(name: SheetName): HTMLCanvasElement | null {
  return cache[name];
}

/**
 * Load a sheet (magenta → transparent) and cache it, then fire the onSheetLoaded callback.
 * Idempotent: a no-op if the sheet is already cached or a load is already in flight.
 */
export function loadSheet(name: SheetName): void {
  if (cache[name] || loading[name]) return;
  loading[name] = true;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx) {
      loading[name] = false;
      return;
    }
    cx.drawImage(img, 0, 0);
    const id = cx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) d[i + 3] = 0;
    }
    cx.putImageData(id, 0, 0);
    cache[name] = c;
    loading[name] = false;
    onLoadedCb?.();
  };
  img.src = SHEET_URLS[name];
}
