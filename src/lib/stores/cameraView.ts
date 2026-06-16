import { writable } from 'svelte/store';

/**
 * Current map zoom expressed as the tile size in CSS px (GameCanvas's `tileWidth`). Small = zoomed
 * out (whole map, ~8px tiles), large = zoomed in (~40px). Published by GameCanvas so overlays that
 * live outside it (e.g. the weather particle canvas) can react to zoom — the weather overlay packs in
 * more, faster particles as you zoom out for an "in the clouds" feel.
 */
export const cameraTileSize = writable(8);
