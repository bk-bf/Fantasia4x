import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GridRenderer } from '$lib/webgl/grid-renderer';
import { Webgl2Device } from '$lib/gpu/webgl2/device';
import { GameGrid } from '$lib/webgl/game-grid';
import { POSED_TILE_PROGRAM, ShaderManager, TILE_PROGRAM, withDefine } from '$lib/webgl/shaders';
import type { TileData } from '$lib/webgl/tile-types';
import type { FontAtlas } from '$lib/webgl/types';
import type { CharacterRenderer } from '$lib/webgl/character-renderer';
import { buildTileset, parseManifest, spriteAt } from '$lib/webgl/painted/manifest';

const ROOT = join(__dirname, '..', '..', '..');
const LINK_STATUS = 0x8b82;
const ACTIVE_UNIFORMS = 0x8b86;
const ACTIVE_ATTRIBUTES = 0x8b89;
const UNIFORMS = ['u_zoom', 'u_shadowPass', 'u_paintAtlas'];

interface FakeProgram {
  id: number;
  bound: Map<string, number>;
}

function fakeGl() {
  const calls: unknown[][] = [];
  let programs = 0;
  const gl = new Proxy(
    { LINK_STATUS, ACTIVE_UNIFORMS, ACTIVE_ATTRIBUTES, VALIDATE_STATUS: 0x8b83 },
    {
      get: (target, key) => {
        if (typeof key !== 'string') return undefined;
        if (key in target) return target[key as keyof typeof target];
        return (...args: unknown[]) => {
          calls.push([key, ...args]);
          if (key === 'createProgram') return { id: ++programs, bound: new Map() } as FakeProgram;
          if (key === 'bindAttribLocation')
            (args[0] as FakeProgram).bound.set(args[2] as string, args[1] as number);
          if (key === 'getShaderParameter') return true;
          if (key === 'getProgramParameter')
            return args[1] === ACTIVE_UNIFORMS
              ? UNIFORMS.length
              : args[1] === ACTIVE_ATTRIBUTES
                ? 1
                : true;
          if (key === 'getActiveUniform') return { name: UNIFORMS[args[1] as number] };
          if (key === 'getUniformLocation')
            return { program: (args[0] as FakeProgram).id, name: args[1] };
          if (key === 'getActiveAttrib') return { name: 'a_position' };
          if (key === 'getAttribLocation')
            return (args[0] as FakeProgram).bound.get('a_position') ?? 7;
          return {};
        };
      }
    }
  );
  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}

function pairedManager() {
  const { gl, calls } = fakeGl();
  const shaders = new ShaderManager(new Webgl2Device(gl));
  shaders.createProgram(TILE_PROGRAM, 'v', 'f');
  shaders.createProgram(POSED_TILE_PROGRAM, 'v', 'f', shaders.getProgram(TILE_PROGRAM)!.attributes);
  shaders.pairPrograms(TILE_PROGRAM, POSED_TILE_PROGRAM);
  const writes = () =>
    calls
      .filter(([k]) => typeof k === 'string' && k.startsWith('uniform'))
      .map(([k, at, v]) => [
        k,
        (at as { program: number }).program,
        (at as { name: string }).name,
        v
      ]);
  return { shaders, calls, writes };
}

describe('the posed program shares every uniform of the tile program', () => {
  it('replays the uniforms set on the tile program when the posed program is next bound', () => {
    const { shaders, calls, writes } = pairedManager();
    shaders.useProgram(TILE_PROGRAM);
    shaders.setUniform(TILE_PROGRAM, 'u_zoom', [2, 3]);
    shaders.setUniform(TILE_PROGRAM, 'u_paintAtlas', 1);
    calls.length = 0;
    shaders.useProgram(POSED_TILE_PROGRAM);
    expect(writes()).toEqual([
      ['uniform2fv', 2, 'u_zoom', Float32Array.from([2, 3])],
      ['uniform1i', 2, 'u_paintAtlas', 1]
    ]);
    calls.length = 0;
    shaders.useProgram(POSED_TILE_PROGRAM);
    expect(writes()).toEqual([]);
  });

  it('writes to whichever of the two is bound and hands the value to the other', () => {
    const { shaders, calls, writes } = pairedManager();
    shaders.useProgram(POSED_TILE_PROGRAM);
    calls.length = 0;
    shaders.setUniform(TILE_PROGRAM, 'u_shadowPass', 1);
    shaders.setUniform(TILE_PROGRAM, 'u_shadowPass', 0);
    expect(writes()).toEqual([
      ['uniform1f', 2, 'u_shadowPass', 1],
      ['uniform1f', 2, 'u_shadowPass', 0]
    ]);
    calls.length = 0;
    shaders.useProgram(TILE_PROGRAM);
    expect(writes()).toEqual([['uniform1f', 1, 'u_shadowPass', 0]]);
  });

  it('keeps an array handed over even when the caller reuses it', () => {
    const { shaders, calls, writes } = pairedManager();
    shaders.useProgram(TILE_PROGRAM);
    const zoom = new Float32Array([1, 1]);
    shaders.setUniform(TILE_PROGRAM, 'u_zoom', zoom);
    zoom[0] = 9;
    calls.length = 0;
    shaders.useProgram(POSED_TILE_PROGRAM);
    expect(writes()).toEqual([['uniform2fv', 2, 'u_zoom', Float32Array.from([1, 1])]]);
  });

  it('binds the attributes of the posed program where the tile program has them', () => {
    const { shaders } = pairedManager();
    expect(shaders.getProgram(POSED_TILE_PROGRAM)!.attributes).toEqual(
      shaders.getProgram(TILE_PROGRAM)!.attributes
    );
  });
});

describe('the posed rows of the fragment shader', () => {
  const fragment = readFileSync(join(ROOT, 'src/lib/webgl/shaders/fragment.glsl'), 'utf8');

  it('turns on with a define right after the version line', () => {
    expect(withDefine(fragment, 'POSED').startsWith('#version 300 es\n#define POSED\n')).toBe(true);
  });

  it('sit behind that define, so the tile program warps a quad by its sway alone', () => {
    const plain = fragment.replace(
      /#ifdef POSED[\s\S]*?#else\n|#ifdef POSED[\s\S]*?#endif\n|#endif\n/g,
      ''
    );
    expect(plain).not.toContain('posed(');
    expect(plain).not.toContain('v_pose.x');
    expect(plain).toContain('highp vec2 warped(highp vec2 uv) {\n    return swayed(uv);\n}');
  });
});

describe('the program a batch is drawn with', () => {
  const raw = JSON.parse(
    readFileSync(join(__dirname, 'painted', 'fixture', 'manifest.json'), 'utf8')
  );
  const { tileset } = buildTileset(parseManifest(raw));
  const pine = spriteAt(tileset.lookup.get('resource')!.get('pine_tree')![0], 4, 6);
  const atlas = {
    characters: new Map(),
    atlasWidth: 256,
    atlasHeight: 128
  } as unknown as FontAtlas;
  const figure: TileData = {
    char: 'A',
    foreground: { r: 1, g: 1, b: 1 },
    background: { r: 0, g: 0, b: 0 },
    position: { x: 4, y: 6 },
    painted: pine
  };

  function programsFor(tiles: TileData[]): string[] {
    const used: string[] = [];
    const shaders = {
      getAttributeLocation: () => 1,
      useProgram: (name: string) => used.push(name) > 0
    } as unknown as ShaderManager;
    const r = new GridRenderer(new Webgl2Device(fakeGl().gl), shaders, {} as CharacterRenderer, atlas, false, true);
    r.setPaintTexel(1 / 256, 1 / 128);
    const grid = new GameGrid();
    for (const t of tiles) grid.setTile(t.position.x, t.position.y, t);
    r.renderGrid(grid, {
      tileWidth: 16,
      tileHeight: 16,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 40,
      viewportHeight: 40,
      renderAllTiles: true
    });
    return used;
  }

  it('is the tile program when no quad in it is posed', () => {
    expect(programsFor([figure, { ...figure, position: { x: 8, y: 6 }, flip: true }])).toEqual([
      TILE_PROGRAM
    ]);
  });

  it('is the posed program when any quad in it leans, squashes or tilts', () => {
    for (const pose of [{ lean: 1 }, { squash: -1 }, { pitch: 1 }])
      expect(programsFor([figure, { ...figure, position: { x: 8, y: 6 }, ...pose }])).toEqual([
        POSED_TILE_PROGRAM
      ]);
  });
});
