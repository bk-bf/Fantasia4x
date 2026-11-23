import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GridRenderer } from '$lib/webgl/grid-renderer';
import { GameGrid } from '$lib/webgl/game-grid';
import { WebGLRendererCore } from '$lib/webgl/renderer-core';
import type { TileData } from '$lib/webgl/tile-types';
import type { FontAtlas } from '$lib/webgl/types';
import type { ShaderManager } from '$lib/webgl/shaders';
import type { CharacterRenderer } from '$lib/webgl/character-renderer';
import {
  buildTileset,
  parseManifest,
  spriteAt,
  type PaintedSprite
} from '$lib/webgl/painted/manifest';
import { WindClock, gustAt, heading, swayTable } from '$lib/webgl/painted/wind';
import { LeafField, leafTarget, type LeafFrame } from '$lib/webgl/painted/leaves';

const GLYPH_FLOATS = 24;
const ROW_FLOATS = 31;
const SWAY = GLYPH_FLOATS + 6;

const atlas = {
  characters: new Map([['A', { x: 16, y: 32, width: 16, height: 16 }]]),
  atlasWidth: 256,
  atlasHeight: 128
} as unknown as FontAtlas;

const raw = JSON.parse(readFileSync(join(__dirname, 'fixture', 'manifest.json'), 'utf8'));
const { tileset } = buildTileset(parseManifest(raw), {
  sway: { [raw.map.resource.pine_tree[0]]: 1.7 },
  leafy: [raw.map.resource.pine_tree[0]]
});
const pine = spriteAt(tileset.lookup.get('resource')!.get('pine_tree')![0], 4, 6);
const rgb = (r: number, g: number, b: number) => ({ r, g, b });
const tile = (x: number, y: number, painted?: PaintedSprite, rotation?: 90): TileData => ({
  char: 'A',
  foreground: rgb(1, 1, 1),
  background: rgb(0, 0, 0),
  position: { x, y },
  ...(painted ? { painted } : {}),
  ...(rotation ? { rotation } : {})
});

function recordingGl(uploads: Float32Array[]) {
  const constants = {
    DEPTH_TEST: 0x0b71,
    ARRAY_BUFFER: 0x8892,
    TRIANGLES: 4,
    FLOAT: 0x1406,
    LEQUAL: 0x0203,
    LESS: 0x0201,
    ZERO: 0,
    SRC_COLOR: 0x0300,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1
  };
  return new Proxy(constants, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        if ((key === 'bufferData' || key === 'bufferSubData') && args[1] instanceof Float32Array)
          uploads.push(args[1]);
        return {};
      };
    }
  }) as unknown as WebGL2RenderingContext;
}

const shaders = {
  getAttributeLocation: () => 1,
  useProgram: () => true,
  setUniform: () => true
} as unknown as ShaderManager;

afterEach(() => vi.restoreAllMocks());

describe('wind in the vertex data', () => {
  it('writes each sprite its own sway after the vein, and none for a still or lying one', () => {
    const uploads: Float32Array[] = [];
    const r = new GridRenderer(
      recordingGl(uploads),
      shaders,
      {} as CharacterRenderer,
      atlas,
      false,
      true
    );
    const quads = [
      tile(1, 1, pine),
      tile(2, 1, { ...pine, sway: undefined }),
      tile(3, 1, pine, 90)
    ];
    const data = r['generateBatchVertexData'](quads, {
      tileWidth: 16,
      tileHeight: 16,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 10,
      viewportHeight: 10
    });
    const swayOf = (q: number) =>
      new Set(Array.from({ length: 6 }, (_, v) => data[(q * 6 + v) * ROW_FLOATS + SWAY]));
    expect(swayOf(0)).toEqual(new Set([Math.fround(1.7)]));
    expect(swayOf(1)).toEqual(new Set([0]));
    expect(swayOf(2)).toEqual(new Set([0]));
  });
});

function windyCore(uploads: Float32Array[], uniforms: Map<string, unknown>) {
  const gl = recordingGl(uploads);
  const grids = {
    gameGrid: new GameGrid(),
    resourceOverlayGrid: new GameGrid(),
    resourceTallOverlayGrid: new GameGrid()
  };
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      grids.gameGrid.setTile(x, y, tile(x, y));
      if ((x + y) % 3 === 0) grids.resourceTallOverlayGrid.setTile(x, y, tile(x, y, pine));
      if ((x + y) % 3 === 1) grids.resourceOverlayGrid.setTile(x, y, tile(x, y, pine));
    }
  const core = Object.create(WebGLRendererCore.prototype) as WebGLRendererCore;
  Object.assign(core, {
    ...grids,
    overlayGrid: null,
    itemOverlayGrid: null,
    buildingOverlayGrid: null,
    snowGrid: null,
    rowDepth: true,
    wind: new WindClock(),
    painted: {
      tileset: { ...tileset, tile: 32, atlasW: 64, atlasH: 64 },
      texture: {},
      light: {},
      top: null,
      texels: () => null
    },
    fontTexture: {},
    fontAtlas: atlas,
    viewport: { x: 0, y: 0, width: 192, height: 192 },
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
    gridVersion: 1,
    snowVersion: 0,
    stats: { drawCalls: 0, vertexCount: 0, resourceRebuilds: 0, terrainRebuilds: 0 },
    webglState: { getContext: () => gl },
    shaderManager: {
      useProgram: () => true,
      setUniform: (_p: string, name: string, value: unknown) => uniforms.set(name, value)
    },
    gridRenderer: new GridRenderer(gl, shaders, {} as CharacterRenderer, atlas, false, true)
  });
  return core;
}

describe('the wind blowing through the painted map', () => {
  it('moves only uniforms: no terrain or resource chunk is rebuilt or uploaded again while it gusts', () => {
    const uploads: Float32Array[] = [];
    const uniforms = new Map<string, unknown>();
    const core = windyCore(uploads, uniforms);
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const strengths = [0.1, 0.45, 1, 0.75, 0.05];
    core['stats'].resourceRebuilds = 0;
    core['render']();
    const firstUploads = uploads.length;
    expect(firstUploads).toBeGreaterThan(0);
    const winds: string[] = [];
    let rebuilt = 0;
    for (let frame = 0; frame < 40; frame++) {
      now += 100;
      core.setWind(
        strengths[frame % strengths.length],
        heading(frame % 2 ? 1 : -1, (frame % 3) - 1),
        'autumn'
      );
      core['stats'].resourceRebuilds = 0;
      core['render']();
      rebuilt += core['stats'].resourceRebuilds + core['stats'].terrainRebuilds;
      winds.push(JSON.stringify([uniforms.get('u_wind'), uniforms.get('u_windDir')]));
    }
    expect(rebuilt).toBe(0);
    expect(uploads.length).toBe(firstUploads);
    expect(new Set(winds).size).toBe(winds.length);
  });
});

describe('the wind clock', () => {
  it('eases into a new strength and heading instead of snapping to it', () => {
    const clock = new WindClock();
    clock.set(0.1, heading(1, 0));
    clock.tick(0);
    clock.set(1, heading(-1, 0));
    clock.tick(100);
    expect(clock.strength).toBeGreaterThan(0.1);
    expect(clock.strength).toBeLessThan(0.5);
    for (let t = 200; t < 20_000; t += 100) clock.tick(t);
    expect(clock.strength).toBeCloseTo(1, 2);
    expect(clock.dir.x).toBeCloseTo(-1, 2);
  });

  it('scales the mockup look by the weather, from barely a stir to a gale', () => {
    const at = (s: number) => {
      const c = new WindClock();
      c.set(s, heading(1, 0));
      return c.scale;
    };
    expect(at(0.1)).toBeLessThan(0.25);
    expect(at(0.45)).toBeCloseTo(1, 5);
    expect(at(1)).toBeGreaterThan(2);
  });

  it('carries the gusts across the map downwind', () => {
    const rand = seeded(11);
    const points = Array.from({ length: 4000 }, () => [rand() * 6000, rand() * 6000]);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [1, -1]
    ]) {
      const dir = heading(dx, dy);
      const miss = (step: number) =>
        points.reduce(
          (sum, [x, y]) =>
            sum +
            Math.abs(
              gustAt(x, y, { dir, scroll: 50 }) -
                gustAt(x + dir.x * step, y + dir.y * step, { dir, scroll: 54 })
            ),
          0
        );
      expect(miss(1), `${dx},${dy}`).toBeLessThan(miss(-1));
    }
  });

  it('gives the grass patches a gust shimmer the art does not', () => {
    const wind = swayTable({ sway: { 'tree/oak/0': 2.6 }, leafy: ['tree/oak/0'] }, [
      'tree/oak/0',
      'plant/grass_patch/2',
      'plant/stump/0'
    ]);
    expect(wind.sway['tree/oak/0']).toBe(2.6);
    expect(wind.sway['plant/grass_patch/2']).toBeGreaterThan(0);
    expect(wind.sway['plant/stump/0']).toBeUndefined();
    expect(swayTable(null, ['tree/oak/0']).sway).toEqual({});
  });
});

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function leafFrame(season: string): LeafFrame {
  return {
    canvas: [640, 480],
    viewOffset: [0, 0],
    zoom: [2, 2],
    basePerArt: 0.5,
    artTile: 32,
    view: { x: 0, y: 0, w: 40, h: 30 },
    season,
    treeAt: (x, y) => ((x * 7 + y * 3) % 5 === 0 ? pine : undefined),
    texels: { w: 64, h: 64, kinds: new Uint8Array(64 * 64).fill(1) },
    light: { fieldLit: false, ambient: [1, 1, 1], tone: [1, 1] }
  };
}

describe('falling leaves', () => {
  it('drops more leaves in autumn and in harder wind, and none in winter', () => {
    expect(leafTarget(100, 'autumn', 1)).toBeGreaterThan(leafTarget(100, 'summer', 1));
    expect(leafTarget(100, 'summer', 2)).toBeGreaterThan(leafTarget(100, 'summer', 0.5));
    expect(leafTarget(100, 'winter', 2)).toBe(0);
    expect(leafTarget(10_000, 'autumn', 2.2)).toBe(320);
  });

  it('drifts every falling leaf downwind', () => {
    for (const dx of [1, -1]) {
      const field = new LeafField(seeded(7));
      const wind = { dir: heading(dx, 0), scroll: 0, scale: 1.5 };
      for (let i = 0; i < 30; i++) field.step(0.05, wind, leafFrame('autumn'));
      const start = new Map(field.leaves.filter((p) => p.z > 0).map((p) => [p, p.x]));
      expect(start.size).toBeGreaterThan(10);
      for (let i = 0; i < 10; i++) field.step(0.05, wind, leafFrame('autumn'));
      const moved = [...start].filter(([p]) => field.leaves.includes(p)).map(([p, x]) => p.x - x);
      const mean = moved.reduce((a, b) => a + b, 0) / moved.length;
      expect(Math.sign(mean)).toBe(dx);
    }
  });

  it('lets a leaf land and lie for a moment before it goes', () => {
    const field = new LeafField(seeded(3));
    const wind = { dir: heading(1, 0), scroll: 0, scale: 1 };
    for (let i = 0; i < 200; i++) field.step(0.05, wind, leafFrame('summer'));
    expect(field.leaves.some((p) => p.z === 0 && p.rest > 0)).toBe(true);
    expect(field.leaves.every((p) => p.rest <= 3)).toBe(true);
  });
});
