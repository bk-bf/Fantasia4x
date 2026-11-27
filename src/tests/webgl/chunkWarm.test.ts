import { describe, it, expect } from 'vitest';
import { GridRenderer, type GridRenderOptions } from '$lib/webgl/grid-renderer';
import { GameGrid } from '$lib/webgl/game-grid';
import type { FontAtlas } from '$lib/webgl/types';
import { renderGrid, tileShaders } from './tileShaders';
import { Webgl2Device } from '$lib/gpu/webgl2/device';

const MAP = 128;
const CHUNKS = (MAP / 32) * (MAP / 32);

const atlas = {
  characters: new Map([['A', { x: 16, y: 32, width: 16, height: 16 }]]),
  atlasWidth: 256,
  atlasHeight: 128
} as unknown as FontAtlas;

function setup() {
  let uploads = 0;
  const gl = new Proxy(
    { ARRAY_BUFFER: 0x8892, TRIANGLES: 4, FLOAT: 0x1406 },
    {
      get: (target, key) => {
        if (typeof key !== 'string') return undefined;
        if (key in target) return target[key as keyof typeof target];
        return (...args: unknown[]) => {
          if (key === 'getUniformBlockIndex') return 0xffffffff;
          if (key === 'bufferData' && args[1] instanceof Float32Array) uploads++;
          if (key === 'bufferSubData' && args[2] instanceof Float32Array) uploads++;
          return {};
        };
      }
    }
  ) as unknown as WebGL2RenderingContext;
  const gpu = new Webgl2Device(gl);
  const renderer = new GridRenderer(gpu, tileShaders(gpu, false), atlas, false, false);
  const grid = new GameGrid();
  for (let y = 0; y < MAP; y++)
    for (let x = 0; x < MAP; x++)
      grid.setTile(x, y, {
        char: 'A',
        foreground: { r: 1, g: 1, b: 1 },
        background: { r: 0, g: 0, b: 0 },
        position: { x, y }
      });
  return { renderer, grid, uploads: () => uploads };
}

const view = (size: number, cacheVersion = 0): GridRenderOptions => ({
  tileWidth: 16,
  tileHeight: 16,
  viewportX: 0,
  viewportY: 0,
  viewportWidth: size,
  viewportHeight: size,
  cacheVersion
});

function frames(r: GridRenderer, grid: GameGrid, n: number, options: GridRenderOptions) {
  for (let i = 0; i < n; i++) renderGrid(r, grid, options);
}

describe('chunks are built in the background and kept', () => {
  it('builds no more than one chunk outside the view per frame', () => {
    const { renderer, grid, uploads } = setup();
    renderGrid(renderer, grid, view(10));
    const first = uploads();
    renderGrid(renderer, grid, view(10));
    expect(uploads() - first).toBeLessThanOrEqual(1);
  });

  it('has the whole map built before the view zooms out to it', () => {
    const { renderer, grid, uploads } = setup();
    frames(renderer, grid, CHUNKS, view(10));
    const before = uploads();
    renderGrid(renderer, grid, view(MAP));
    expect(uploads() - before).toBe(0);
  });

  it('keeps chunks that stayed out of view for hundreds of frames', () => {
    const { renderer, grid, uploads } = setup();
    frames(renderer, grid, 600, view(10));
    const before = uploads();
    renderGrid(renderer, grid, view(MAP));
    expect(uploads() - before).toBe(0);
  });

  it('rebuilds the whole map in the background after the grid version changes', () => {
    const { renderer, grid, uploads } = setup();
    frames(renderer, grid, CHUNKS, view(10, 0));
    frames(renderer, grid, CHUNKS, view(10, 1));
    const before = uploads();
    renderGrid(renderer, grid, view(MAP, 1));
    expect(uploads() - before).toBe(0);
  });

  it('stops sweeping once every chunk is current', () => {
    const { renderer, grid, uploads } = setup();
    frames(renderer, grid, CHUNKS + 2, view(10));
    const settled = uploads();
    frames(renderer, grid, 50, view(10));
    expect(uploads()).toBe(settled);
  });
});
