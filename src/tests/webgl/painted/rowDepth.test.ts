import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Webgl2Device } from '$lib/gpu/webgl2/device';
import { ALPHA_CUT, GridRenderer, type GridRenderOptions } from '$lib/webgl/grid-renderer';
import { GameGrid } from '$lib/webgl/game-grid';
import { ROW_DEPTH_RANGE, WebGLRendererCore } from '$lib/webgl/renderer-core';
import type { TileData } from '$lib/webgl/tile-types';
import type { FontAtlas } from '$lib/webgl/types';
import { TILE_ATTRIBUTES, TILE_PIPELINE, tilePipelines } from '$lib/webgl/tilePipelines';
import { passOf, tileShaders } from '../tileShaders';
import { buildTileset, parseManifest, spriteAt } from '$lib/webgl/painted/manifest';
import { SHADOW_DEPTH } from '$lib/webgl/painted/shadowCast';
import { WindClock } from '$lib/webgl/painted/wind';
import { WebGLStateManager } from '$lib/webgl/webgl-state';

const GLYPH_FLOATS = 24;
const ROW_FLOATS = 32;
const DEPTH_TEST = 0x0b71;

const atlas = {
  characters: new Map([['A', { x: 16, y: 32, width: 16, height: 16 }]]),
  atlasWidth: 256,
  atlasHeight: 128
} as unknown as FontAtlas;

const options: GridRenderOptions = {
  tileWidth: 16,
  tileHeight: 16,
  viewportX: 0,
  viewportY: 0,
  viewportWidth: 40,
  viewportHeight: 40
};

const rgb = (r: number, g: number, b: number) => ({ r, g, b });
const raw = JSON.parse(readFileSync(join(__dirname, 'fixture', 'manifest.json'), 'utf8'));
const { tileset } = buildTileset(parseManifest(raw));
const pine = spriteAt(tileset.lookup.get('resource')!.get('pine_tree')![0], 4, 6);

function recordingGl(uploads: Float32Array[] = []) {
  const constants = {
    DEPTH_TEST,
    ARRAY_BUFFER: 0x8892,
    TRIANGLES: 4,
    FLOAT: 0x1406,
    LEQUAL: 0x0203,
    LESS: 0x0201,
    ZERO: 0,
    SRC_COLOR: 0x0300,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303
  };
  const calls: unknown[][] = [];
  const gl = new Proxy(constants, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
        if (key === 'getUniformBlockIndex') return 0xffffffff;
        if (key === 'bufferData' && args[1] instanceof Float32Array) uploads.push(args[1]);
        if (key === 'bufferSubData' && args[2] instanceof Float32Array) uploads.push(args[2]);
        return {};
      };
    }
  });
  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}

function gridRenderer(rowDepth: boolean, uploads?: Float32Array[]) {
  const { gl, calls } = recordingGl(uploads);
  const gpu = new Webgl2Device(gl);
  const r = new GridRenderer(gpu, tileShaders(gpu, rowDepth), atlas, false, rowDepth);
  return { r, calls };
}

const tiles: TileData[] = [
  { char: 'A', foreground: rgb(1, 1, 1), background: rgb(0, 0, 0), position: { x: 1, y: 2 } },
  {
    char: 'A',
    foreground: rgb(1, 1, 1),
    background: rgb(0, 0, 0),
    position: { x: 3, y: 5 },
    animationOffset: { x: 2, y: -4 },
    rotation: 90
  },
  {
    char: 'A',
    foreground: rgb(1, 1, 1),
    background: rgb(0, 0, 0),
    position: { x: 4, y: 6 },
    painted: pine
  }
];

describe('the row each quad carries for the depth test', () => {
  it('gives every vertex of a quad the row its cell stands on, after the glyph floats unchanged', () => {
    const glyph = gridRenderer(false).r['generateBatchVertexData'](tiles, options);
    const rows = gridRenderer(true).r['generateBatchVertexData'](tiles, options);
    expect(rows.length).toBe((glyph.length / GLYPH_FLOATS) * ROW_FLOATS);
    const expected = [2, 5 - 4 / 16, 6];
    for (let q = 0; q < tiles.length; q++) {
      for (let v = 0; v < 6; v++) {
        const vert = q * 6 + v;
        const at = vert * ROW_FLOATS;
        expect(rows.subarray(at, at + GLYPH_FLOATS)).toEqual(
          glyph.subarray(vert * GLYPH_FLOATS, (vert + 1) * GLYPH_FLOATS)
        );
        expect(rows[at + GLYPH_FLOATS]).toBe(expected[q]);
      }
    }
  });

  it('keys a sprite taller than its cell on its foot row, not on the rows it covers', () => {
    const rows = gridRenderer(true).r['generateBatchVertexData']([tiles[2]], options);
    const ys = new Set<number>();
    for (let v = 0; v < 6; v++) {
      ys.add(rows[v * ROW_FLOATS + 1]);
      expect(rows[v * ROW_FLOATS + GLYPH_FLOATS]).toBe(6);
    }
    expect(Math.min(...ys)).toBeLessThan(6 * 16);
    expect(Math.max(...ys)).toBe(7 * 16);
  });

  it('draws the overlays of a tile after it, on the row the tile stands on', () => {
    const uploads: Float32Array[] = [];
    const { r } = gridRenderer(true, uploads);
    const grid = new GameGrid();
    const prop = { ...tiles[2], animationOffset: { x: 3, y: -8 } };
    grid.setTile(4, 6, { ...prop, overlays: [{ ...prop }, { ...prop }] });
    grid.setTile(8, 6, tiles[2]);
    r.renderGrid(passOf(r), grid, { ...options, renderAllTiles: true });
    const data = uploads[uploads.length - 1];
    const rows = Array.from({ length: data.length / (6 * ROW_FLOATS) }, (_, quad) => [
      ...data.subarray(quad * 6 * ROW_FLOATS, quad * 6 * ROW_FLOATS + 2),
      data[quad * 6 * ROW_FLOATS + GLYPH_FLOATS]
    ]);
    expect(rows.map(([, , row]) => row)).toEqual([5.5, 5.5, 5.5, 6]);
    expect(new Set(rows.slice(0, 3).map(([x, y]) => `${x},${y}`)).size).toBe(1);
  });

  it('writes the map row in a cached chunk, so the rows either side of a chunk edge stay in order', () => {
    const uploads: Float32Array[] = [];
    const { r } = gridRenderer(true, uploads);
    const grid = new GameGrid();
    for (const y of [31, 32]) grid.setTile(5, y, { ...tiles[0], position: { x: 5, y } });
    r.renderGrid(passOf(r), grid, { ...options, cacheVersion: 1, chunkLayer: 'resource' });
    const rows = uploads.map((data) => data[GLYPH_FLOATS]).sort((a, b) => a - b);
    expect(rows).toEqual([31, 32]);
  });

  it('points the row and vein attributes past the glyph floats only when the depth test is on', () => {
    const pointers = (rowDepth: boolean) => {
      const { r, calls } = gridRenderer(rowDepth);
      const grid = new GameGrid();
      grid.setTile(1, 2, tiles[0]);
      r.renderGrid(passOf(r), grid, { ...options, renderAllTiles: true });
      return calls.filter((c) => c[0] === 'vertexAttribPointer');
    };
    const on = pointers(true);
    const off = pointers(false);
    const at = (name: string) => on.find((c) => c[1] === TILE_ATTRIBUTES[name]);
    expect(at('a_row')).toEqual([
      'vertexAttribPointer',
      TILE_ATTRIBUTES.a_row,
      1,
      0x1406,
      false,
      128,
      96
    ]);
    expect(at('a_vein')).toEqual([
      'vertexAttribPointer',
      TILE_ATTRIBUTES.a_vein,
      4,
      0x1406,
      false,
      128,
      100
    ]);
    expect(at('a_veinNear')).toEqual([
      'vertexAttribPointer',
      TILE_ATTRIBUTES.a_veinNear,
      1,
      0x1406,
      false,
      128,
      116
    ]);
    expect(at('a_sway')).toEqual([
      'vertexAttribPointer',
      TILE_ATTRIBUTES.a_sway,
      1,
      0x1406,
      false,
      128,
      120
    ]);
    expect(at('a_tree')).toEqual([
      'vertexAttribPointer',
      TILE_ATTRIBUTES.a_tree,
      1,
      0x1406,
      false,
      128,
      124
    ]);
    const rowLocations = ['a_row', 'a_vein', 'a_veinNear', 'a_sway', 'a_tree'].map(
      (n) => TILE_ATTRIBUTES[n]
    );
    expect(off.every((c) => c[5] === 96 && !rowLocations.includes(c[1] as number))).toBe(true);
  });

  it('writes the vein, its tile and its same-ore neighbours after the row, and -1 where there is none', () => {
    const uploads: Float32Array[] = [];
    const { r } = gridRenderer(true, uploads);
    const grid = new GameGrid();
    grid.setTile(1, 1, {
      ...tiles[0],
      position: { x: 1, y: 1 },
      painted: { ...pine, vein: { x: 7, y: 9, near: 5 } }
    });
    grid.setTile(2, 1, { ...tiles[0], position: { x: 2, y: 1 }, painted: pine });
    r.renderGrid(passOf(r), grid, options);
    const data = uploads[uploads.length - 1];
    const veins = Array.from({ length: data.length / ROW_FLOATS }, (_, v) =>
      Array.from(
        data.subarray(v * ROW_FLOATS + GLYPH_FLOATS + 1, v * ROW_FLOATS + GLYPH_FLOATS + 6)
      ).join(',')
    );
    expect(new Set(veins)).toEqual(new Set(['7,9,1,1,5', '-1,-1,2,1,0']));
    expect(veins.filter((v) => v === '7,9,1,1,5')).toHaveLength(6);
  });
});

function layeredCore(rowDepth: boolean) {
  const { gl, calls } = recordingGl();
  const uniforms = new Map<string, unknown>();
  const draws: { layer: string; pipeline: string; shadows: boolean }[] = [];
  const grids = {
    gameGrid: new GameGrid(),
    snowGrid: new GameGrid(),
    resourceOverlayGrid: new GameGrid(),
    buildingOverlayGrid: new GameGrid(),
    itemOverlayGrid: new GameGrid(),
    overlayGrid: new GameGrid(),
    resourceTallOverlayGrid: new GameGrid()
  };
  const names = new Map<GameGrid, string>(
    Object.entries(grids).map(([k, g]) => [g, k] as [GameGrid, string])
  );
  const core = Object.create(WebGLRendererCore.prototype) as WebGLRendererCore;
  Object.assign(core, {
    ...grids,
    rowDepth,
    wind: new WindClock(),
    painted: null,
    fontTexture: {},
    fontAtlas: atlas,
    viewport: { x: 0, y: 0, width: 160, height: 160 },
    tileWidth: 16,
    tileHeight: 16,
    viewTileX: 0,
    viewTileY: 0,
    projectionMatrix: new Float32Array(16),
    ambientLight: 1,
    ambientTint: [1, 1, 1],
    dynamicLight: false,
    lightSampler: null,
    lightVersion: 0,
    lightBounds: null,
    gridVersion: 0,
    snowVersion: 0,
    stats: { drawCalls: 0, vertexCount: 0, resourceRebuilds: 0 },
    webglState: {
      getDevice: () => new Webgl2Device(gl),
      canvasPass: WebGLStateManager.prototype.canvasPass
    },
    shaderManager: {
      pipeline: () => ({}),
      setUniform: (_p: string, name: string, value: unknown) => uniforms.set(name, value)
    },
    gridRenderer: {
      chunksRebuiltLastRender: 0,
      renderGrid: (_pass: unknown, grid: GameGrid, opts: GridRenderOptions) => {
        const layer = names.get(grid)!;
        draws.push({
          layer: uniforms.get('u_bgOnly') === 1 ? `${layer} wash` : layer,
          pipeline: opts.pipeline ?? 'terrain',
          shadows: opts.rowPasses === true
        });
        return { tilesRendered: 0 };
      }
    }
  });
  core['render']();
  return { draws, uniforms, calls };
}

describe('the layers the depth test orders', () => {
  it('leaves the ground and the snow wash out of it and draws every standing layer through it', () => {
    const { draws, uniforms } = layeredCore(true);
    expect(draws).toEqual([
      { layer: 'gameGrid', pipeline: 'terrain', shadows: false },
      { layer: 'snowGrid wash', pipeline: 'flat', shadows: false },
      { layer: 'resourceOverlayGrid', pipeline: 'overlay', shadows: true },
      { layer: 'snowGrid', pipeline: 'overlay', shadows: true },
      { layer: 'buildingOverlayGrid', pipeline: 'overlay', shadows: true },
      { layer: 'itemOverlayGrid', pipeline: 'overlay', shadows: true },
      { layer: 'overlayGrid', pipeline: 'overlay', shadows: true },
      { layer: 'resourceTallOverlayGrid', pipeline: 'overlay', shadows: true }
    ]);
    expect(uniforms.get('u_rowDepth')).toBe(1 / ROW_DEPTH_RANGE);
    expect(uniforms.get('u_alphaCut')).toBe(ALPHA_CUT);
  });

  it('tests depth only in the overlay and shadow pipelines, and only with the painted flag on', () => {
    const depth = (rowDepth: boolean) =>
      Object.fromEntries(
        tilePipelines({ vertex: '', fragment: '' }, 'rgba8unorm', rowDepth).map(([name, d]) => [
          name,
          d.depthStencil?.depthCompare ?? 'none'
        ])
      );
    expect(depth(true)).toEqual({
      [TILE_PIPELINE.terrain]: 'always',
      [TILE_PIPELINE.flat]: 'always',
      [TILE_PIPELINE.overlay]: 'less-equal',
      [TILE_PIPELINE.shadow]: 'less'
    });
    expect(Object.values(depth(false))).toEqual(['none', 'none', 'none', 'none']);
  });

  it('touches no depth state and sets no depth uniform with the painted flag off', () => {
    const { draws, uniforms, calls } = layeredCore(false);
    expect(draws.every((d) => !d.shadows)).toBe(true);
    expect(uniforms.has('u_rowDepth')).toBe(false);
    expect(uniforms.has('u_alphaCut')).toBe(false);
    expect(uniforms.has('u_shadowPass')).toBe(false);
    expect(calls.some((c) => c[0] === 'depthFunc' || c[0] === 'depthMask')).toBe(false);
  });
});

const LEQUAL = 0x0203;
const LESS = 0x0201;
const MULTIPLY = 'ZERO,SRC_COLOR';

interface Pass {
  shadow: boolean;
  depthFunc: number;
  blend: string;
}

function passesOf(chunked: boolean, rowPasses: boolean): Pass[] {
  const passes: Pass[] = [];
  const uniforms: Record<string, number> = { u_alphaCut: ALPHA_CUT };
  let depthFunc = LEQUAL;
  let blend = 'SRC_ALPHA,ONE_MINUS_SRC_ALPHA';
  const { gl } = recordingGl();
  const names = new Map(Object.entries(gl).map(([k, v]) => [v, k]));
  const recorded = new Proxy(gl, {
    get: (target, key) => {
      if (key === 'depthFunc') return (f: number) => (depthFunc = f);
      if (key === 'blendFuncSeparate')
        return (a: number, b: number) => (blend = `${names.get(a)},${names.get(b)}`);
      if (key === 'drawArrays')
        return () => passes.push({ shadow: uniforms.u_shadowPass === 1, depthFunc, blend });
      return (target as unknown as Record<string | symbol, unknown>)[key];
    }
  });
  const gpu = new Webgl2Device(recorded);
  const shaders = Object.assign(tileShaders(gpu, true), {
    setUniform: (_p: string, name: string, value: number) => (uniforms[name] = value)
  });
  const r = new GridRenderer(gpu, shaders, atlas, false, true);
  const grid = new GameGrid();
  grid.setTile(4, 6, tiles[2]);
  r.renderGrid(passOf(r), grid, {
    ...options,
    rowPasses,
    pipeline: 'overlay',
    renderAllTiles: true,
    ...(chunked ? { cacheVersion: 1, chunkLayer: 'resource' as const } : {})
  });
  expect(uniforms.u_shadowPass ?? 0).toBe(0);
  expect(depthFunc).toBe(LEQUAL);
  expect(blend).toBe('SRC_ALPHA,ONE_MINUS_SRC_ALPHA');
  return passes;
}

const ROW_SPRITE = 0.5 - 1e-4;

function drawPixel(passes: Pass[], shaded: boolean, stored: { depth: number; darkened: number }) {
  for (const p of passes) {
    if (!p.shadow || !shaded) continue;
    const wins = p.depthFunc === LESS ? SHADOW_DEPTH < stored.depth : SHADOW_DEPTH <= stored.depth;
    if (!wins) continue;
    stored.depth = SHADOW_DEPTH;
    stored.darkened++;
  }
  return stored;
}

describe('a drop shadow under the depth test', () => {
  for (const chunked of [false, true]) {
    const layer = chunked ? 'a cached layer' : 'a layer rebuilt each frame';

    it(`draws the sprites, then their shadows multiplied over what is still ground, in ${layer}`, () => {
      expect(passesOf(chunked, true)).toEqual([
        { shadow: false, depthFunc: LEQUAL, blend: 'SRC_ALPHA,ONE_MINUS_SRC_ALPHA' },
        { shadow: true, depthFunc: LESS, blend: MULTIPLY }
      ]);
    });

    it(`darkens a ground pixel once however many shadows cover it, in ${layer}`, () => {
      const passes = passesOf(chunked, true);
      const ground = { depth: 1, darkened: 0 };
      drawPixel(passes, true, ground);
      drawPixel(passes, true, ground);
      expect(ground.darkened).toBe(1);
    });

    it(`never darkens a sprite already drawn, and a sprite drawn later covers the shadow, in ${layer}`, () => {
      const passes = passesOf(chunked, true);
      const sprite = { depth: ROW_SPRITE, darkened: 0 };
      expect(drawPixel(passes, true, sprite).darkened).toBe(0);
      const ground = drawPixel(passes, true, { depth: 1, darkened: 0 });
      expect(ROW_SPRITE <= ground.depth).toBe(true);
    });
  }

  it('draws once and no shadow when the layer is not under the depth test', () => {
    for (const chunked of [false, true])
      expect(passesOf(chunked, false)).toEqual([
        { shadow: false, depthFunc: LEQUAL, blend: 'SRC_ALPHA,ONE_MINUS_SRC_ALPHA' }
      ]);
  });

  it('keeps the shadow depth behind every row a sprite can stand on and in front of the cleared depth', () => {
    expect(SHADOW_DEPTH).toBeGreaterThan(0.5);
    expect(SHADOW_DEPTH).toBeLessThan(1);
  });
});
