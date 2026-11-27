import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeImageData, coordinateAtlas, paintedFetch } from './pngFile';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true, GROUND_BLEND: false }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true, GROUND_BLEND: false }));

const raw = JSON.parse(readFileSync(join(__dirname, 'fixture', 'manifest.json'), 'utf8'));
raw.map.pawn = { Verdant: ['pawn_red'], '*': ['pawn_red', 'pawn_blue'] };

const atlas = coordinateAtlas(raw.atlas.w, raw.atlas.h);

const pool = [{ id: 'morix', archetype: 'Verdant' }];
const pawns = [
  { id: 'pawn-1', cultureId: 'morix' },
  ...Array.from({ length: 8 }, (_, i) => ({ id: `stray-${i}`, cultureId: 'gone' }))
];

describe('one look for a pawn on the map and in the hud', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws each pawn on the map with the sprite the hud crops for it', async () => {
    const crops: number[][] = [];
    vi.stubGlobal('ImageData', FakeImageData);
    vi.stubGlobal('fetch', paintedFetch(raw, atlas));
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          putImageData: ({ data, width, height }: FakeImageData) =>
            crops.push([
              data[0] | ((data[2] & 15) << 8),
              data[1] | ((data[2] >> 4) << 8),
              width,
              height
            ])
        })
      })
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { buildTileset, parseManifest } = await import('$lib/webgl/painted/manifest');
    const { setPaintedTileset, paintedPawn } = await import('$lib/webgl/painted/tileset');
    const { paintedPawnLook, paintedLookCanvas } = await import('$lib/webgl/painted/loader');
    const { tileset } = buildTileset(parseManifest(raw));
    setPaintedTileset(tileset);

    const looks = new Set<string>();
    for (const pawn of pawns) {
      const look = await paintedPawnLook(pawn, pool);
      expect(look).toBeDefined();
      looks.add(look!);
      expect(paintedPawn(pawn, pool)).toEqual(tileset.sprites.get(look!)!.entity);
      await paintedLookCanvas(look!);
      const s = raw.sprites[look!];
      expect(crops.at(-1)).toEqual([s.x, s.y, s.w, s.h]);
    }
    expect(await paintedPawnLook(pawns[0], pool)).toBe('pawn_red');
    expect(looks).toEqual(new Set(['pawn_red', 'pawn_blue']));
    setPaintedTileset(null);
  });
});
