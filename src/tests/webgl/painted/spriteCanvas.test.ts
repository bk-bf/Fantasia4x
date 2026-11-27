import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeImageData, coordinateAtlas, paintedFetch } from './pngFile';

const raw = JSON.parse(readFileSync(join(__dirname, 'fixture', 'manifest.json'), 'utf8'));

const atlas = coordinateAtlas(raw.atlas.w, raw.atlas.h);

describe('paintedSpriteCanvas', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for a canvas the icon shrinker can read back without a gpu round trip', async () => {
    const contexts: unknown[] = [];
    vi.stubGlobal('ImageData', FakeImageData);
    vi.stubGlobal('fetch', paintedFetch(raw, atlas));
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: (type: string, options?: CanvasRenderingContext2DSettings) => {
          contexts.push({ type, options });
          return { putImageData: () => {} };
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
