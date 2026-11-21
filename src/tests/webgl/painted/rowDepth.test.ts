import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALPHA_CUT, GridRenderer, type GridRenderOptions } from '$lib/webgl/grid-renderer';
import { GameGrid } from '$lib/webgl/game-grid';
import { ROW_DEPTH_RANGE, WebGLRendererCore } from '$lib/webgl/renderer-core';
import type { TileData } from '$lib/webgl/tile-types';
import type { FontAtlas } from '$lib/webgl/types';
import type { ShaderManager } from '$lib/webgl/shaders';
import type { CharacterRenderer } from '$lib/webgl/character-renderer';
import { buildTileset, parseManifest, spriteAt } from '$lib/webgl/painted/manifest';

const GLYPH_FLOATS = 24;
const ROW_FLOATS = 30;
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
    LEQUAL: 0x0203
  };
  const calls: unknown[][] = [];
  const gl = new Proxy(constants, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
        if (key === 'bufferData' && args[1] instanceof Float32Array) uploads.push(args[1]);
        return {};
      };
    }
  });
  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}

function gridRenderer(rowDepth: boolean, uploads?: Float32Array[]) {
  const { gl, calls } = recordingGl(uploads);
  const shaders = {
    getAttributeLocation: (_p: string, name: string) =>
      name === 'a_row' ? 9 : name === 'a_vein' ? 10 : name === 'a_veinNear' ? 11 : 1,
    useProgram: () => true
  } as unknown as ShaderManager;
  const r = new GridRenderer(gl, shaders, {} as CharacterRenderer, atlas, false, rowDepth);
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

  it('writes the map row in a cached chunk, so the rows either side of a chunk edge stay in order', () => {
    const uploads: Float32Array[] = [];
    const { r } = gridRenderer(true, uploads);
    const grid = new GameGrid();
    for (const y of [31, 32]) grid.setTile(5, y, { ...tiles[0], position: { x: 5, y } });
    r.renderGrid(grid, { ...options, cacheVersion: 1, chunkLayer: 'resource' });
    const rows = uploads.map((data) => data[GLYPH_FLOATS]).sort((a, b) => a - b);
    expect(rows).toEqual([31, 32]);
  });

  it('points the row and vein attributes past the glyph floats only when the depth test is on', () => {
    const on = gridRenderer(true).calls.filter((c) => c[0] === 'vertexAttribPointer');
    const off = gridRenderer(false).calls.filter((c) => c[0] === 'vertexAttribPointer');
    expect(on.find((c) => c[1] === 9)).toEqual([
      'vertexAttribPointer',
      9,
      1,
      0x1406,
      false,
      120,
      96
    ]);
    expect(on.find((c) => c[1] === 10)).toEqual([
      'vertexAttribPointer',
      10,
      4,
      0x1406,
      false,
      120,
      100
    ]);
    expect(on.find((c) => c[1] === 11)).toEqual([
      'vertexAttribPointer',
      11,
      1,
      0x1406,
      false,
      120,
      116
    ]);
    expect(off.every((c) => c[5] === 96 && ![9, 10, 11].includes(c[1] as number))).toBe(true);
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
    r.renderGrid(grid, options);
    const data = uploads[uploads.length - 1];
    const veins = Array.from({ length: data.length / ROW_FLOATS }, (_, v) =>
      Array.from(data.subarray(v * ROW_FLOATS + GLYPH_FLOATS + 1, (v + 1) * ROW_FLOATS)).join(',')
    );
    expect(new Set(veins)).toEqual(new Set(['7,9,1,1,5', '-1,-1,2,1,0']));
    expect(veins.filter((v) => v === '7,9,1,1,5')).toHaveLength(6);
  });
});

function layeredCore(rowDepth: boolean) {
  const { gl, calls } = recordingGl();
  const uniforms = new Map<string, unknown>();
  const draws: { layer: string; depth: boolean; shadows: boolean }[] = [];
  let depthOn = false;
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
  const tracked = new Proxy(gl, {
    get: (target, key) => {
      if (key === 'enable') return (cap: number) => cap === DEPTH_TEST && (depthOn = true);
      if (key === 'disable') return (cap: number) => cap === DEPTH_TEST && (depthOn = false);
      return (target as unknown as Record<string | symbol, unknown>)[key];
    }
  });
  const core = Object.create(WebGLRendererCore.prototype) as WebGLRendererCore;
  Object.assign(core, {
    ...grids,
    rowDepth,
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
    webglState: { getContext: () => tracked },
    shaderManager: {
      useProgram: () => true,
      setUniform: (_p: string, name: string, value: unknown) => uniforms.set(name, value)
    },
    gridRenderer: {
      chunksRebuiltLastRender: 0,
      renderGrid: (grid: GameGrid, opts: GridRenderOptions) => {
        const layer = names.get(grid)!;
        draws.push({
          layer: uniforms.get('u_bgOnly') === 1 ? `${layer} wash` : layer,
          depth: depthOn,
          shadows: opts.rowPasses === true
        });
        return { tilesRendered: 0 };
      }
    }
  });
  core['render']();
  return { draws, uniforms, calls, depthOn: () => depthOn };
}

describe('the layers the depth test orders', () => {
  it('leaves the ground and the snow wash out of it and draws every standing layer through it', () => {
    const { draws, uniforms, depthOn } = layeredCore(true);
    expect(draws).toEqual([
      { layer: 'gameGrid', depth: false, shadows: false },
      { layer: 'snowGrid wash', depth: false, shadows: false },
      { layer: 'resourceOverlayGrid', depth: true, shadows: true },
      { layer: 'snowGrid', depth: true, shadows: true },
      { layer: 'buildingOverlayGrid', depth: true, shadows: true },
      { layer: 'itemOverlayGrid', depth: true, shadows: true },
      { layer: 'overlayGrid', depth: true, shadows: true },
      { layer: 'resourceTallOverlayGrid', depth: true, shadows: true }
    ]);
    expect(uniforms.get('u_rowDepth')).toBe(1 / ROW_DEPTH_RANGE);
    expect(uniforms.get('u_alphaCut')).toBe(ALPHA_CUT);
    expect(uniforms.get('u_alphaCeil')).toBe(0);
    expect(depthOn()).toBe(false);
  });

  it('touches no depth state and sets no depth uniform with the painted flag off', () => {
    const { draws, uniforms, calls } = layeredCore(false);
    expect(draws.every((d) => !d.depth && !d.shadows)).toBe(true);
    expect(uniforms.has('u_rowDepth')).toBe(false);
    expect(uniforms.has('u_alphaCut')).toBe(false);
    expect(uniforms.has('u_alphaCeil')).toBe(false);
    expect(calls.some((c) => c[0] === 'depthFunc' || c[0] === 'depthMask')).toBe(false);
  });
});

const fragmentSource = readFileSync(
  join(__dirname, '../../../lib/webgl/shaders/fragment.glsl'),
  'utf8'
);
const glyphDiscard = fragmentSource.match(/u_glyphOnly > 0\.5\) \{\s*if \((.+)\) discard;/)![1];
const discards = new Function(
  'a',
  'cut',
  'ceil',
  `return ${glyphDiscard
    .replaceAll('sprite.a', 'a')
    .replaceAll('u_alphaCut', 'cut')
    .replaceAll('u_alphaCeil', 'ceil')};`
) as (a: number, cut: number, ceil: number) => boolean;

interface Pass {
  cut: number;
  ceil: number;
  writesDepth: boolean;
}

function passesOf(chunked: boolean, rowPasses: boolean): Pass[] {
  const passes: Pass[] = [];
  const uniforms = { u_alphaCut: ALPHA_CUT, u_alphaCeil: 0 } as Record<string, number>;
  let writesDepth = true;
  const { gl } = recordingGl();
  const recorded = new Proxy(gl, {
    get: (target, key) => {
      if (key === 'depthMask') return (on: boolean) => (writesDepth = on);
      if (key === 'drawArrays')
        return () =>
          passes.push({ cut: uniforms.u_alphaCut, ceil: uniforms.u_alphaCeil, writesDepth });
      return (target as unknown as Record<string | symbol, unknown>)[key];
    }
  });
  const shaders = {
    getAttributeLocation: () => 1,
    useProgram: () => true,
    setUniform: (_p: string, name: string, value: number) => (uniforms[name] = value)
  } as unknown as ShaderManager;
  const r = new GridRenderer(recorded, shaders, {} as CharacterRenderer, atlas, false, true);
  const grid = new GameGrid();
  grid.setTile(4, 6, tiles[2]);
  r.renderGrid(grid, {
    ...options,
    rowPasses,
    renderAllTiles: true,
    ...(chunked ? { cacheVersion: 1, chunkLayer: 'resource' as const } : {})
  });
  expect(uniforms).toEqual({ u_alphaCut: ALPHA_CUT, u_alphaCeil: 0 });
  expect(writesDepth).toBe(true);
  return passes;
}

function drawTexel(passes: Pass[], alpha: number, row: number, stored: { row: number }) {
  let blended = 0;
  for (const p of passes) {
    if (discards(alpha, p.cut, p.ceil) || row < stored.row) continue;
    blended++;
    if (p.writesDepth) stored.row = row;
  }
  return blended;
}

const BAKED_SHADOW = 112 / 255;

describe('a baked drop shadow under the depth test', () => {
  for (const chunked of [false, true]) {
    const layer = chunked ? 'a cached layer' : 'a layer rebuilt each frame';
    it(`blends an alpha 112 texel over the ground once and writes no depth, in ${layer}`, () => {
      const passes = passesOf(chunked, true);
      const ground = { row: -Infinity };
      expect(drawTexel(passes, BAKED_SHADOW, 3, ground)).toBe(1);
      expect(ground.row).toBe(-Infinity);
      expect(drawTexel(passes, 0, 3, ground)).toBe(0);
    });

    it(`darkens a pawn a row behind and never hides a pawn drawn after it, in ${layer}`, () => {
      const passes = passesOf(chunked, true);
      const pawnBehind = { row: 2 };
      expect(drawTexel(passes, BAKED_SHADOW, 3, pawnBehind)).toBe(1);
      const shadowFirst = { row: -Infinity };
      drawTexel(passes, BAKED_SHADOW, 3, shadowFirst);
      expect(drawTexel(passes, 1, 2, shadowFirst)).toBe(1);
    });

    it(`leaves a sprite in front of the shadow uncovered and keeps opaque texels writing depth, in ${layer}`, () => {
      const passes = passesOf(chunked, true);
      expect(drawTexel(passes, BAKED_SHADOW, 3, { row: 4 })).toBe(0);
      const ground = { row: -Infinity };
      expect(drawTexel(passes, 1, 3, ground)).toBe(1);
      expect(ground.row).toBe(3);
    });
  }

  it('draws once with no depth mask change when the layer is not under the depth test', () => {
    for (const chunked of [false, true]) {
      const passes = passesOf(chunked, false);
      expect(passes).toEqual([{ cut: ALPHA_CUT, ceil: 0, writesDepth: true }]);
    }
  });

  it('discards nothing with the flag off, where both cut uniforms stay 0', () => {
    for (const a of [0, BAKED_SHADOW, 1]) expect(discards(a, 0, 0)).toBe(false);
  });
});
