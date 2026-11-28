import { describe, it, expect, vi } from 'vitest';
import { stubBrowser } from './browserStubs';

vi.mock('$app/environment', () => ({
  browser: true,
  dev: false,
  building: false,
  version: 'test'
}));

stubBrowser(new Map<string, unknown>([['debug-log', []]]));

describe('the camera a game opens with', () => {
  it('keeps the remembered zoom for a loaded save and forgets it for a new game', async () => {
    const { gameState } = await import('$lib/stores/gameState');
    const { CAMERA_STORAGE_KEY } = await import('$lib/stores/cameraView');
    const zoomedIn = JSON.stringify({ viewX: 300, viewY: 300, tileWidth: 64 });
    sessionStorage.setItem(CAMERA_STORAGE_KEY, zoomedIn);

    gameState.startGame('load', 'played-save');
    expect(sessionStorage.getItem(CAMERA_STORAGE_KEY)).toBe(zoomedIn);

    gameState.startGame('new');
    expect(sessionStorage.getItem(CAMERA_STORAGE_KEY)).toBeNull();
  }, 120_000);
});
