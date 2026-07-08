import { writable } from 'svelte/store';

/** Current zoom as tile size in CSS px, published by GameCanvas so outside overlays
 *  (e.g. the weather particle canvas) can react to zoom. */
export const cameraTileSize = writable(8);

/** Live zoom range endpoints in CSS px per tile. The zoom-out floor shrinks as the map grows, so
 *  overlays read this instead of hardcoding a tile range — "fully zoomed out" then looks the same
 *  on every map size. */
export const cameraZoomRange = writable<{ min: number; max: number }>({ min: 8, max: 40 });

/** Visible map rectangle in TILE coordinates, published by GameCanvas on every pan/zoom.
 *  Consumers (spatial creature SFX) read it on a throttled tick, not reactively. */
export const cameraViewport = writable<{ x: number; y: number; w: number; h: number }>({
  x: 0,
  y: 0,
  w: 0,
  h: 0
});
