import { writable } from 'svelte/store';

export const cameraTileSize = writable(8);

export const cameraZoomRange = writable<{ min: number; max: number }>({ min: 8, max: 40 });

export const cameraViewport = writable<{ x: number; y: number; w: number; h: number }>({
  x: 0,
  y: 0,
  w: 0,
  h: 0
});

export const CAMERA_STORAGE_KEY = 'fantasia4x-camera';

export function forgetSavedCamera(): void {
  globalThis.sessionStorage?.removeItem(CAMERA_STORAGE_KEY);
}
