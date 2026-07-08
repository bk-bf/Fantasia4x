import { writable } from 'svelte/store';

/** Render FPS, pushed from the GameCanvas rAF loop. Decoupled from sim TPS. */
export const renderFps = writable(0);
