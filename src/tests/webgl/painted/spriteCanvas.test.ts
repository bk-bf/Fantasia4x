import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = JSON.parse(readFileSync(join(__dirname, 'fixture', 'manifest.json'), 'utf8'));

class FakeImage {
  naturalWidth = raw.atlas.w;
  naturalHeight = raw.atlas.h;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('paintedSpriteCanvas', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a canvas the icon shrinker can read back without a gpu round trip', async () => {
    const contexts: unknown[] = [];
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => raw }));
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: (type: string, options?: CanvasRenderingContext2DSettings) => {
          contexts.push({ type, options });
          return { drawImage: () => {} };
        }
      })
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { paintedSpriteCanvas } = await import('$lib/webgl/painted/loader');

    const canvas = await paintedSpriteCanvas('creature', 'deer');

    expect(canvas).not.toBeNull();
    expect(contexts).toEqual([{ type: '2d', options: { willReadFrequently: true } }]);
  });
});
