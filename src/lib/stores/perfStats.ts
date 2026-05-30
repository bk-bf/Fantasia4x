import { writable } from 'svelte/store';

/**
 * Render frames-per-second, pushed from the GameCanvas requestAnimationFrame
 * loop (sampled from the WebGL renderer's own FPS counter). Decoupled from the
 * simulation tick rate (TPS), which the topbar measures separately from the
 * turn counter.
 */
export const renderFps = writable(0);
