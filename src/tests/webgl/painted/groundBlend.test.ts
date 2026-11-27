import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorldTile } from '$lib/game/core/types';
import { Webgl2Device } from '$lib/gpu/webgl2/device';
import { ShaderManager } from '$lib/webgl/shaders';
import { canvasPass } from '../tileShaders';
import { blankTexture } from '$lib/webgl/passBindings';
import type { GpuTexture } from '$lib/gpu/device';
import { wgslInstance } from '$lib/gpu/uniforms';

vi.mock('$lib/webgl/painted/flag', () => ({ PAINTED_TILES: true, GROUND_BLEND: true }));
vi.mock('$lib/webgl/painted/flag.js', () => ({ PAINTED_TILES: true, GROUND_BLEND: true }));

const { buildTileset, parseManifest } = await import('$lib/webgl/painted/manifest');
const { setPaintedTileset, paintedGroundKind, paintedGroundIds } =
  await import('$lib/webgl/painted/tileset');
const { applyTileToGrid } = await import('$lib/webgl/fantasia-world');
const { GameGrid } = await import('$lib/webgl/game-grid');
const { GroundBlend, GROUND_FRAME, groundKindTable, lightRect } =
  await import('$lib/webgl/painted/groundBlend');
const { groundLayer } = await import('$lib/webgl/painted/groundLevels');
const { readGroundBlendFlag } =
  await vi.importActual<typeof import('$lib/webgl/painted/flag')>('$lib/webgl/painted/flag');

const raw = JSON.parse(readFileSync(join(__dirname, 'fixture', 'manifest.json'), 'utf8'));
const tileset = buildTileset(parseManifest(raw)).tileset;

function tile(over: Partial<WorldTile>): WorldTile {
  return { x: 2, y: 3, walkable: true, subType: 'grass', resources: {}, ...over } as WorldTile;
}

const painted = {
  tileset,
  texture: {} as GpuTexture,
  light: {} as GpuTexture,
  top: null,
  water: {} as GpuTexture,
  ground: null,
  texels: () => null,
  cell: () => null
};

beforeAll(() => setPaintedTileset(tileset));

function recordingGl(calls: [string, unknown[]][]): WebGL2RenderingContext {
  const answer = (name: string, args: unknown[]) =>
    name === 'getUniformLocation'
      ? args[1]
      : name === 'getAttribLocation'
        ? 0
        : name === 'getUniformBlockIndex'
          ? 0xffffffff
          : {};
  return new Proxy({} as WebGL2RenderingContext, {
    get: (_, name) =>
      typeof name !== 'string' || /^[A-Z0-9_]+$/.test(name)
        ? 0
        : (...args: unknown[]) => {
            calls.push([name, args]);
            return answer(name, args);
          }
  });
}

describe('the ground blend switch', () => {
  it('is on unless ?blend=0 or the stored switch turns it off', () => {
    expect(readGroundBlendFlag('', null)).toBe(true);
    expect(readGroundBlendFlag('?blend=1', '1')).toBe(true);
    expect(readGroundBlendFlag('?blend=0', null)).toBe(false);
    expect(readGroundBlendFlag('', '0')).toBe(false);
  });
});

describe('ground kinds reach the terrain grid', () => {
  it('gives painted ground its kind index, starting at 1', () => {
    const grid = new GameGrid();
    applyTileToGrid(grid, tile({}), []);
    const kind = grid.getTile(2, 3)!.ground;
    expect(kind).toBe(paintedGroundKind('grass'));
    expect(paintedGroundIds()[kind! - 1]).toBe('grass');
  });

  it('leaves unpainted and hidden tiles to their per-tile quads', () => {
    const grid = new GameGrid();
    applyTileToGrid(grid, tile({ x: 3, subType: 'cave' }), []);
    const hidden: boolean[][] = [];
    hidden[3] = [];
    hidden[3][4] = true;
    applyTileToGrid(grid, tile({ x: 4 }), hidden);
    expect(grid.getTile(3, 3)!.ground).toBeUndefined();
    expect(grid.getTile(4, 3)!.ground).toBeUndefined();
  });
});

describe('the blend pass tables', () => {
  it('points each kind at its patch in atlas pixels with its level', () => {
    const { patch, layer } = groundKindTable({
      tileset,
      texture: {} as GpuTexture,
      light: {} as GpuTexture,
      top: null,
      water: null,
      ground: null,
      texels: () => null,
      cell: () => null
    });
    const k = paintedGroundKind('grass');
    const cell = tileset.lookup.get('subterrain')!.get('grass')![0];
    expect(patch[k * 4]).toBe(Math.round(cell.cells[0].u1 * tileset.atlasW));
    expect(patch[k * 4 + 1]).toBe(Math.round(cell.cells[0].v1 * tileset.atlasH));
    expect(patch[k * 4 + 2]).toBe(cell.patch * tileset.tile);
    expect([...layer.slice(k * 4, k * 4 + 4)]).toEqual([5, 0, -1, -1]);
    expect([...patch.slice(0, 4), ...layer.slice(0, 4)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('tells shallow water, open water and rapids apart from land', () => {
    expect(['grass', 'riverbank', 'shallow_water', 'water', 'rapids'].map(groundLayer)).toEqual([
      { level: 5, water: 0 },
      { level: 3, water: 0 },
      { level: 1, water: 1 },
      { level: 0, water: 2 },
      { level: 0, water: 3 }
    ]);
  });

  it('covers the lit corners one past the bounds, clamped to the map', () => {
    expect(lightRect({ minX: 10.5, minY: 3, maxX: 12.2, maxY: 4 }, 500, 500)).toEqual({
      x: 9,
      y: 2,
      w: 6,
      h: 4
    });
    expect(lightRect({ minX: -4, minY: -4, maxX: 600, maxY: 2 }, 500, 500)).toEqual({
      x: 0,
      y: 0,
      w: 501,
      h: 4
    });
  });
});

function frameWrites(gpu: Webgl2Device) {
  const write = vi.spyOn(gpu.queue, 'writeBuffer');
  return {
    clear: () => write.mockClear(),
    sizes: () => write.mock.calls.map((c) => c[4] ?? (c[2] as Uint8Array).byteLength),
    member: (name: string, count = 1) => {
      const bytes = write.mock.calls.at(-1)![2] as Uint8Array;
      const at = GROUND_FRAME.offsets[name] / 4;
      const type = GROUND_FRAME.members.find((m) => m.name === name)!.type;
      const view = type === 'int' ? new Int32Array(bytes.buffer) : new Float32Array(bytes.buffer);
      return [...view.subarray(at, at + count)];
    }
  };
}

const textureUploads = (calls: [string, unknown[]][]) =>
  calls.filter(([name]) => /^tex(Sub)?Image2D$/.test(name));

describe('the water clock', () => {
  it('reaches the shader in the frame block, the only upload of a frame', () => {
    const calls: [string, unknown[]][] = [];
    const gpu = new Webgl2Device(recordingGl(calls));
    const blend = GroundBlend.create(gpu, new ShaderManager(gpu), painted)!;
    const writes = frameWrites(gpu);
    const grid = new GameGrid();
    for (let x = 0; x < 4; x++) applyTileToGrid(grid, tile({ x, y: 0 }), []);
    blend.setGrid(grid);
    const frame = (waterTime: number) => ({
      zoom: [1, 1] as [number, number],
      ambient: [1, 1, 1] as [number, number, number],
      flicker: 1,
      fieldLit: false,
      tone: [1, 1] as [number, number],
      waterTime,
      lightTime: 0,
      lightVersion: 1,
      litBounds: undefined,
      lightField: blankTexture(gpu)
    });
    blend.prepare(frame(0));
    expect(blend.encode(canvasPass(gpu))).toBe(true);
    calls.length = 0;
    writes.clear();
    blend.prepare(frame(1.25));
    expect(blend.encode(canvasPass(gpu))).toBe(true);
    expect(textureUploads(calls)).toEqual([]);
    expect(writes.sizes()).toEqual([GROUND_FRAME.size]);
    expect(writes.member('u_waterTime')).toEqual([1.25]);
  });
});

describe('the wave water switch', () => {
  it('draws the wave water from its sea uniforms and uploads only the frame block', () => {
    const calls: [string, unknown[]][] = [];
    const gpu = new Webgl2Device(recordingGl(calls));
    const blend = GroundBlend.create(gpu, new ShaderManager(gpu), painted)!;
    const writes = frameWrites(gpu);
    const grid = new GameGrid();
    for (let x = 0; x < 4; x++)
      applyTileToGrid(grid, tile({ x, y: 0, subType: x < 2 ? 'grass' : 'water' }), []);
    blend.setGrid(grid);
    const frame = (sea?: Float32Array) => ({
      zoom: [1, 1] as [number, number],
      ambient: [1, 1, 1] as [number, number, number],
      flicker: 1,
      fieldLit: false,
      tone: [1, 1] as [number, number],
      waterTime: 0,
      sea,
      lightTime: 0,
      lightVersion: 1,
      litBounds: undefined,
      lightField: blankTexture(gpu)
    });
    blend.setWaterStyle(true);
    blend.prepare(frame(new Float32Array(52)));
    calls.length = 0;
    writes.clear();
    const sea = new Float32Array(52).fill(0.5);
    blend.prepare(frame(sea));
    expect(textureUploads(calls)).toEqual([]);
    expect(writes.sizes()).toEqual([GROUND_FRAME.size]);
    expect(writes.member('u_waterStyle')).toEqual([1]);
    expect(writes.member('u_sea', 52)).toEqual([...sea]);
    blend.setWaterStyle(false);
    blend.prepare(frame(sea));
    expect(writes.member('u_waterStyle')).toEqual([0]);
  });
});

describe('the ground blend WGSL', () => {
  it('declares every block and texture at the slot the GLSL binds it to', () => {
    const gpu = new Webgl2Device(recordingGl([]));
    const made = vi.spyOn(gpu, 'createRenderPipeline');
    GroundBlend.create(gpu, new ShaderManager(gpu), painted);
    const descs = made.mock.calls.map(([desc]) => desc);
    expect(descs.length).toBeGreaterThan(0);
    for (const { glsl, wgsl } of descs) {
      const code = wgsl!.code;
      for (const [name, { slot }] of Object.entries(glsl.blocks ?? {}))
        expect(code).toContain(
          `@group(${slot[0]}) @binding(${slot[1]}) var<uniform> ${wgslInstance(name)}: ${name};`
        );
      for (const [name, { texture }] of Object.entries(glsl.textures ?? {}))
        expect(code).toContain(`@group(${texture[0]}) @binding(${texture[1]}) var ${name}: texture_2d<`);
      expect(code).toMatch(/@vertex\s+fn vs\(/);
      expect(code).toMatch(/@fragment\s+fn fs\(/);
    }
  });
});
