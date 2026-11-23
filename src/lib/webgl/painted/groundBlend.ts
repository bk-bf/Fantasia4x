import vertexSource from '../shaders/groundBlend.vert.glsl?raw';
import fragmentSource from '../shaders/groundBlend.frag.glsl?raw';
import type { GameGrid } from '../game-grid.js';
import type { ShaderManager } from '../shaders.js';
import { BASE_TILE_PX } from '../tile-types.js';
import type { LoadedGroundField, LoadedPaintedTileset } from './loader.js';
import { groundLayer } from './groundLevels.js';
import { paintedGroundIds } from './tileset.js';
import { LIGHT_FIELD_UNIT } from './lightPass.js';

const PROGRAM = 'groundBlend';
const MAX_KINDS = 64;
const TEXEL_UPDATE_LIMIT = 64;
const ATLAS_UNIT = 1;
const KIND_UNIT = 4;
const LIGHT_UNIT = 5;
const TIDE_UNIT = 9;
const WATER_UNIT = 10;
const GROUND_UNIT = 11;
const FAR_UNIT = 12;
const NO_BLOCK = -1;
const SHORE_LEVEL = 1.6;
const DEEP_WATER = 2;
const FULL = 255;
const WATER_FRAMES = 16;
const WATER_FPS = 8;

type LightSampler = (wx: number, wy: number, time: number) => [number, number, number];
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Rect = { x: number; y: number; w: number; h: number };

export interface GroundBlendFrame {
  projection: Float32Array;
  viewOffset: [number, number];
  zoom: [number, number];
  ambient: [number, number, number];
  flicker: number;
  fieldLit: boolean;
  tone: [number, number];
  waterTime: number;
  lightSampler?: LightSampler;
  lightTime: number;
  lightVersion: number;
  litBounds: Bounds | null | undefined;
}

export function waterTime(nowMs: number): number {
  return (nowMs / 1000) % (WATER_FRAMES / WATER_FPS);
}

export function groundKindTable(painted: LoadedPaintedTileset): {
  patch: Float32Array;
  layer: Float32Array;
  tide: Uint8Array;
} {
  const patch = new Float32Array(MAX_KINDS * 4);
  const layer = new Float32Array(MAX_KINDS * 4);
  const tide = new Uint8Array(MAX_KINDS * 2);
  tide[1] = FULL;
  const { tileset } = painted;
  const ground = tileset.lookup.get('subterrain');
  paintedGroundIds().forEach((id, i) => {
    const k = i + 1;
    const variant = ground?.get(id)?.[0];
    if (!variant || k >= MAX_KINDS) return;
    const first = variant.cells[0];
    const art = tileset.ground?.kinds.get(id);
    patch.set(
      art
        ? art.bare
          ? [art.bare.x, art.bare.y, art.bare.side, 0]
          : [0, 0, 0, 0]
        : [
            Math.round(first.u1 * tileset.atlasW),
            Math.round(first.v1 * tileset.atlasH),
            variant.patch * tileset.tile,
            0
          ],
      k * 4
    );
    const { level, water } = groundLayer(id);
    layer.set([level, water, art?.ramps.x ?? NO_BLOCK, art?.ramps.y ?? NO_BLOCK], k * 4);
    tide.set([water >= DEEP_WATER ? FULL : 0, level > SHORE_LEVEL ? FULL : 0], k * 2);
  });
  return { patch, layer, tide };
}

export function lightRect(bounds: Bounds, w: number, h: number): Rect {
  const x0 = Math.max(0, Math.floor(bounds.minX) - 1);
  const y0 = Math.max(0, Math.floor(bounds.minY) - 1);
  const x1 = Math.min(w, Math.ceil(bounds.maxX) + 1);
  const y1 = Math.min(h, Math.ceil(bounds.maxY) + 1);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0 + 1), h: Math.max(0, y1 - y0 + 1) };
}

export class GroundBlend {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly atlas: WebGLTexture;
  private readonly kindTex: WebGLTexture;
  private readonly tideTex: WebGLTexture;
  private readonly water: WebGLTexture;
  private readonly field: LoadedGroundField | null;
  private readonly artPerBase: number;
  private readonly tideOf: Uint8Array;
  private readonly lightTex: WebGLTexture;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly at: Record<string, WebGLUniformLocation | null>;
  private kinds = new Uint8Array(0);
  private tides = new Uint8Array(0);
  private w = 0;
  private h = 0;
  private grid: GameGrid | null = null;
  private stale = true;
  private dirty: { x: number; y: number }[] = [];
  private lightBuilt: { version: number; sampler: LightSampler | undefined } | null = null;
  private litRect: Rect | null = null;

  static create(
    gl: WebGL2RenderingContext,
    shaders: ShaderManager,
    painted: LoadedPaintedTileset
  ): GroundBlend | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, fragmentSource);
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[ground blend] off:', made.error);
      return null;
    }
    if (!painted.water) {
      console.warn('[ground blend] off: the water field did not load');
      return null;
    }
    return new GroundBlend(gl, program, painted, painted.water);
  }

  private constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    painted: LoadedPaintedTileset,
    water: WebGLTexture
  ) {
    this.gl = gl;
    this.program = program;
    this.atlas = painted.texture;
    this.water = water;
    this.field = painted.ground;
    this.artPerBase = painted.tileset.tile / BASE_TILE_PX;
    this.kindTex = this.makeTexture(KIND_UNIT, gl.NEAREST);
    this.tideTex = this.makeTexture(TIDE_UNIT, gl.LINEAR);
    this.lightTex = this.makeTexture(LIGHT_UNIT, gl.LINEAR);
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const names = [
      'u_projection',
      'u_viewOffset',
      'u_zoom',
      'u_artPerBase',
      'u_kinds',
      'u_paintAtlas',
      'u_light',
      'u_mapSize',
      'u_tileArt',
      'u_patch',
      'u_layer',
      'u_ambient',
      'u_lightFlicker',
      'u_lightTexture',
      'u_fieldLit',
      'u_saturation',
      'u_brightness',
      'u_waterTime',
      'u_tide',
      'u_waterField',
      'u_groundField',
      'u_groundFar',
      'u_artPerPx',
      'u_pieces'
    ];
    this.at = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
    const { patch, layer, tide } = groundKindTable(painted);
    this.tideOf = tide;
    gl.useProgram(program);
    gl.uniform1i(this.at.u_tide, TIDE_UNIT);
    gl.uniform1i(this.at.u_waterField, WATER_UNIT);
    gl.uniform1i(this.at.u_groundField, GROUND_UNIT);
    gl.uniform1i(this.at.u_groundFar, FAR_UNIT);
    const pieces = painted.tileset.ground?.pieces ?? { x: 0, y: 0 };
    gl.uniform2f(this.at.u_pieces, pieces.x, pieces.y);
    gl.uniform1i(this.at.u_paintAtlas, ATLAS_UNIT);
    gl.uniform1i(this.at.u_kinds, KIND_UNIT);
    gl.uniform1i(this.at.u_light, LIGHT_UNIT);
    gl.uniform1f(this.at.u_tileArt, painted.tileset.tile);
    gl.uniform1f(this.at.u_artPerBase, this.artPerBase);
    gl.uniform4fv(this.at.u_patch, patch);
    gl.uniform4fv(this.at.u_layer, layer);
  }

  private bindOn(unit: number, tex: WebGLTexture): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
  }

  private makeTexture(unit: number, filter: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    this.bindOn(unit, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    return tex;
  }

  setGrid(grid: GameGrid, dirtyTiles?: ReadonlyArray<{ x: number; y: number }>): void {
    if (grid !== this.grid || !dirtyTiles || dirtyTiles.length === 0) {
      this.grid = grid;
      this.stale = true;
      this.dirty = [];
      return;
    }
    if (!this.stale) for (const t of dirtyTiles) this.dirty.push(t);
  }

  private rebuildKinds(grid: GameGrid): void {
    const gl = this.gl;
    const bounds = grid.getBounds();
    const w = bounds ? bounds.max.x + 1 : 0;
    const h = bounds ? bounds.max.y + 1 : 0;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.lightBuilt = null;
      this.litRect = null;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      const r = w * BASE_TILE_PX;
      const b = h * BASE_TILE_PX;
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 0, r, 0, 0, b, r, 0, r, b, 0, b]),
        gl.STATIC_DRAW
      );
    }
    this.kinds = new Uint8Array(w * h);
    this.tides = new Uint8Array(w * h * 2);
    for (const t of grid.getAllTiles()) {
      const { x, y } = t.position;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      this.kinds[y * w + x] = t.ground ?? 0;
      this.tides.set(this.tideOfKind(t.ground ?? 0), (y * w + x) * 2);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.bindOn(KIND_UNIT, this.kindTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.kinds);
    this.bindOn(TIDE_UNIT, this.tideTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, w, h, 0, gl.RG, gl.UNSIGNED_BYTE, this.tides);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  private tideOfKind(k: number): Uint8Array {
    return this.tideOf.subarray(k * 2, k * 2 + 2);
  }

  private updateKindTexels(grid: GameGrid): void {
    const gl = this.gl;
    const changed: { x: number; y: number; k: number }[] = [];
    for (const { x, y } of this.dirty) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const k = grid.getTile(x, y)?.ground ?? 0;
      if (this.kinds[y * this.w + x] === k) continue;
      this.kinds[y * this.w + x] = k;
      this.tides.set(this.tideOfKind(k), (y * this.w + x) * 2);
      changed.push({ x, y, k });
    }
    this.dirty = [];
    if (changed.length === 0) return;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const layers = [
      {
        unit: KIND_UNIT,
        tex: this.kindTex,
        format: gl.RED_INTEGER,
        all: this.kinds,
        one: (k: number) => Uint8Array.of(k)
      },
      {
        unit: TIDE_UNIT,
        tex: this.tideTex,
        format: gl.RG,
        all: this.tides,
        one: (k: number) => this.tideOfKind(k)
      }
    ];
    for (const layer of layers) {
      this.bindOn(layer.unit, layer.tex);
      if (changed.length > TEXEL_UPDATE_LIMIT)
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          this.w,
          this.h,
          layer.format,
          gl.UNSIGNED_BYTE,
          layer.all
        );
      else
        for (const { x, y, k } of changed)
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            x,
            y,
            1,
            1,
            layer.format,
            gl.UNSIGNED_BYTE,
            layer.one(k)
          );
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  private sampleRect(r: Rect, sampler: LightSampler | undefined, time: number): Float32Array {
    const out = new Float32Array(r.w * r.h * 4);
    for (let j = 0; j < r.h; j++)
      for (let i = 0; i < r.w; i++) {
        const l = sampler ? sampler(r.x + i, r.y + j, time) : [1, 1, 1];
        out.set([l[0], l[1], l[2], 1], (j * r.w + i) * 4);
      }
    return out;
  }

  private rebuildLight(f: GroundBlendFrame): void {
    const built = this.lightBuilt;
    if (built && built.version === f.lightVersion && built.sampler === f.lightSampler) return;
    const gl = this.gl;
    const cw = this.w + 1;
    const ch = this.h + 1;
    this.bindOn(LIGHT_UNIT, this.lightTex);
    if (!built) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, cw, ch, 0, gl.RGBA, gl.FLOAT, null);
    const old = this.litRect;
    if (old && old.w > 0 && old.h > 0)
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        old.x,
        old.y,
        old.w,
        old.h,
        gl.RGBA,
        gl.FLOAT,
        new Float32Array(old.w * old.h * 4)
      );
    const whole = { x: 0, y: 0, w: cw, h: ch };
    const rect =
      !f.lightSampler || f.litBounds === undefined
        ? whole
        : f.litBounds === null
          ? null
          : lightRect(f.litBounds, this.w, this.h);
    if (rect && rect.w > 0 && rect.h > 0)
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        gl.RGBA,
        gl.FLOAT,
        this.sampleRect(rect, f.lightSampler, f.lightTime)
      );
    this.litRect = rect;
    this.lightBuilt = { version: f.lightVersion, sampler: f.lightSampler };
  }

  draw(f: GroundBlendFrame): boolean {
    const grid = this.grid;
    if (!grid) return false;
    const gl = this.gl;
    if (this.stale) {
      this.rebuildKinds(grid);
      this.stale = false;
      this.dirty = [];
    } else if (this.dirty.length > 0) this.updateKindTexels(grid);
    if (this.w === 0 || this.h === 0) return false;
    this.rebuildLight(f);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.at.u_projection, false, f.projection);
    gl.uniform2fv(this.at.u_viewOffset, f.viewOffset);
    gl.uniform2fv(this.at.u_zoom, f.zoom);
    gl.uniform1f(this.at.u_artPerPx, this.artPerBase / f.zoom[0]);
    gl.uniform3fv(this.at.u_ambient, f.ambient);
    gl.uniform1f(this.at.u_lightFlicker, f.flicker);
    gl.uniform1i(this.at.u_lightTexture, LIGHT_FIELD_UNIT);
    gl.uniform1f(this.at.u_fieldLit, f.fieldLit ? 1 : 0);
    gl.uniform1f(this.at.u_saturation, f.tone[0]);
    gl.uniform1f(this.at.u_brightness, f.tone[1]);
    gl.uniform1f(this.at.u_waterTime, f.waterTime);
    gl.uniform2i(this.at.u_mapSize, this.w, this.h);
    this.bindOn(ATLAS_UNIT, this.atlas);
    this.bindOn(KIND_UNIT, this.kindTex);
    this.bindOn(TIDE_UNIT, this.tideTex);
    this.bindOn(WATER_UNIT, this.water);
    if (this.field) {
      this.bindOn(GROUND_UNIT, this.field.field);
      this.bindOn(FAR_UNIT, this.field.far);
    }
    this.bindOn(LIGHT_UNIT, this.lightTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    return true;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.kindTex);
    gl.deleteTexture(this.tideTex);
    gl.deleteTexture(this.lightTex);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
