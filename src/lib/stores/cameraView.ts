import { writable } from 'svelte/store';

/**
 * Current map zoom expressed as the tile size in CSS px (GameCanvas's `tileWidth`). Small = zoomed
 * out (whole map, ~8px tiles), large = zoomed in (~40px). Published by GameCanvas so overlays that
 * live outside it (e.g. the weather particle canvas) can react to zoom — the weather overlay packs in
 * more, finer particles as you zoom out for an "in the clouds" feel.
 */
export const cameraTileSize = writable(8);

/**
 * The live zoom RANGE in CSS px per tile: `min` is the zoom-out floor (GameCanvas's `fitTileSize` —
 * the tile size at which the whole map fills the canvas) and `max` is the zoom-in ceiling
 * (`MAX_TILE_W`). The floor SHRINKS as the map grows (a 750² map fits at ~1px tiles, a 250² map at
 * ~3px), so the absolute zoom span differs per map size. Overlays that scale with zoom (the weather
 * canvas) read this instead of hardcoding a tile range, so the same gesture — "fully zoomed out" —
 * maps to the same visual density/size on every map size. `cameraTileSize` is where you ARE in this
 * range; this store is the range's endpoints.
 */
export const cameraZoomRange = writable<{ min: number; max: number }>({ min: 8, max: 40 });

/**
 * The current visible map rectangle in TILE coordinates: `x,y` = top-left tile (GameCanvas's
 * viewX/viewY) and `w,h` = how many tiles fit across the viewport at the current zoom. Published by
 * GameCanvas on every pan/zoom. Used by the spatial creature-SFX layer (AudioController) to decide
 * which creatures are on-screen (loudest) vs just off it (faint). Read on a throttled tick, not
 * subscribed reactively, so per-frame republishing is cheap.
 */
export const cameraViewport = writable<{ x: number; y: number; w: number; h: number }>({
  x: 0,
  y: 0,
  w: 0,
  h: 0
});
