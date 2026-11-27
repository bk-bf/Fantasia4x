import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GridRenderer, type GridRenderOptions } from '$lib/webgl/grid-renderer';
import type { TileData } from '$lib/webgl/tile-types';
import type { FontAtlas } from '$lib/webgl/types';
import type { TileShading } from '$lib/webgl/tileShading';
import { buildTileset, parseManifest, spriteAt } from '$lib/webgl/painted/manifest';
import { Webgl2Device } from '$lib/gpu/webgl2/device';

const FLOATS_PER_VERTEX = 24;
const UV = 2;
const OUTLINE = 14;
const UV_BOUNDS = 17;

const GLYPH_PATH_SHA256 = '23764edd62345f3a2b4332233fbf9294b7aca3046b73afcf7cd03c1089b52c7a';

const noopGl = new Proxy(
  {},
  { get: (_t, key) => (typeof key === 'string' && /^[A-Z_0-9]+$/.test(key) ? 0 : () => ({})) }
) as unknown as WebGL2RenderingContext;

const shaders = {} as unknown as TileShading;

const atlas = {
  characters: new Map([
    ['A', { x: 16, y: 32, width: 16, height: 16 }],
    ['B', { x: 48, y: 0, width: 16, height: 16 }]
  ]),
  atlasWidth: 256,
  atlasHeight: 128
} as unknown as FontAtlas;

const options: GridRenderOptions = {
  tileWidth: 16,
  tileHeight: 16,
  viewportX: 0,
  viewportY: 0,
  viewportWidth: 10,
  viewportHeight: 10
};

const lit: GridRenderOptions = {
  ...options,
  lightSampler: (x, y, t) => [x * 0.1, y * 0.2, t],
  lightTime: 0.5,
  litBounds: { minX: 0, minY: 0, maxX: 3, maxY: 3 }
};

const rgb = (r: number, g: number, b: number) => ({ r, g, b });

const glyphTiles: TileData[] = [
  {
    char: 'A',
    foreground: rgb(0.9, 0.5, 0.1),
    background: rgb(0.1, 0.2, 0.3),
    position: { x: 0, y: 0 }
  },
  {
    char: 'B',
    foreground: rgb(0.2, 0.4, 0.6),
    background: rgb(0, 0, 0),
    backgroundAlpha: 0.4,
    detail: rgb(1, 1, 0.5),
    outline: rgb(0.05, 0.05, 0.05),
    position: { x: 2, y: 1 },
    animationOffset: { x: 3, y: -5 },
    rotation: 90,
    scale: 1.5
  },
  { char: ' ', foreground: rgb(1, 1, 1), background: rgb(0.5, 0.5, 0.5), position: { x: 4, y: 4 } },
  {
    char: 'A',
    foreground: rgb(1, 0, 0),
    background: rgb(0, 1, 0),
    position: { x: 1, y: 7 },
    rotation: 180,
    scale: 0.5
  },
  {
    char: 'B',
    foreground: rgb(0, 0, 1),
    background: rgb(1, 0, 1),
    position: { x: 6, y: 2 },
    rotation: 270
  },
  {
    char: 'Z',
    foreground: rgb(0.3, 0.3, 0.3),
    background: rgb(0.7, 0.7, 0.7),
    position: { x: 3, y: 3 }
  }
];

function vertexData(tiles: TileData[], opts: GridRenderOptions): Float32Array {
  const renderer = new GridRenderer(new Webgl2Device(noopGl), shaders, atlas);
  return renderer['generateBatchVertexData'](tiles, opts);
}

function digest(...buffers: Float32Array[]): string {
  const hash = createHash('sha256');
  for (const b of buffers) hash.update(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
  return hash.digest('hex');
}

const raw = JSON.parse(readFileSync(join(__dirname, 'fixture', 'manifest.json'), 'utf8'));
const { tileset } = buildTileset(parseManifest(raw));

describe('the vertex buffer the tile shader reads', () => {
  it('holds exactly the bytes the glyph path wrote before colour sprites, for a tile with none', () => {
    expect(digest(vertexData(glyphTiles, options), vertexData(glyphTiles, lit))).toBe(
      GLYPH_PATH_SHA256
    );
  });

  it('carries a colour sprite to the shader as its atlas cell, shifted out of the glyph range', () => {
    const variant = tileset.lookup.get('resource')!.get('oak_tree')![0];
    const sprite = spriteAt(variant, 2, 3);
    const tile: TileData = {
      char: 'A',
      foreground: rgb(1, 1, 1),
      background: rgb(0, 0, 0),
      outline: rgb(0.5, 0.5, 0.5),
      position: { x: 2, y: 3 },
      painted: sprite
    };
    const data = vertexData([tile], options);
    const u = new Set<number>();
    const v = new Set<number>();
    for (let vert = 0; vert < 6; vert++) {
      const at = vert * FLOATS_PER_VERTEX;
      u.add(data[at + UV]);
      v.add(data[at + UV + 1]);
      expect(Array.from(data.subarray(at + UV_BOUNDS, at + UV_BOUNDS + 4))).toEqual(
        [sprite.u1 + 2, sprite.v1, sprite.u2 + 2, sprite.v2].map(Math.fround)
      );
      expect(Array.from(data.subarray(at + OUTLINE, at + OUTLINE + 3))).toEqual([0, 0, 0]);
    }
    expect([...u].sort()).toEqual([sprite.u1, sprite.u2].map(Math.fround).sort());
    expect([...v].sort()).toEqual([sprite.v1, sprite.v2].map(Math.fround).sort());
  });

  it('leaves the glyph tiles beside a colour sprite byte for byte as they were', () => {
    const variant = tileset.lookup.get('resource')!.get('oak_tree')![0];
    const painted: TileData = {
      ...glyphTiles[0],
      position: { x: 8, y: 8 },
      painted: spriteAt(variant, 8, 8)
    };
    const mixed = vertexData([...glyphTiles, painted], options);
    const alone = vertexData(glyphTiles, options);
    expect(mixed.subarray(0, alone.length)).toEqual(alone);
  });
});
