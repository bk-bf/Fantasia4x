import vertexSource from '../shaders/tier.vert.glsl?raw';
import fragmentSource from '../shaders/tier.frag.glsl?raw';
import type { GameGrid } from '../game-grid.js';
import type { ShaderManager } from '../shaders.js';
import { BASE_TILE_PX } from '../tile-types.js';
import type { LoadedPaintedTileset } from './loader.js';
import { withRockSurface } from './rockSurface.js';
import { LIGHT_FIELD_UNIT } from './lightPass.js';
import { NOISE_SIZE, tierNoiseTexels } from './tierNoise.js';
import { TIER_FIELDS, TIER_TEXEL, TierTiles, type TileAt } from './tierTiles.js';

const PROGRAM = 'tiers';
export const TIER_TILE_UNIT = 4;
export const TIER_NOISE_UNIT = 10;
const TIER_FIELD_UNIT = 9;
const ATLAS_UNIT = 1;
const ROCK_UNIT = 2;
const VEIN_UNIT = 3;

export interface TierView {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TierFrame {
  view: TierView;
  projection: Float32Array;
  viewOffset: [number, number];
  zoom: [number, number];
  ambient: [number, number, number];
  fieldLit: boolean;
  tone: [number, number];
  rowPx: number;
  rowDepth: number;
  snow: boolean;
}

const UNIFORMS = [
  'u_projection',
  'u_viewOffset',
  'u_zoom',
  'u_atlasScale',
  'u_rect',
  'u_tierFieldTexture',
  'u_tierNoiseTexture',
  'u_tierTileTexture',
  'u_paintAtlas',
  'u_rockTexture',
  'u_veinTexture',
  'u_rockRamp',
  'u_snowRamp',
  'u_snow',
  'u_rockLift',
  'u_lightTexture',
  'u_fieldLit',
  'u_ambient',
  'u_saturation',
  'u_brightness',
  'u_rowPx',
  'u_rowDepth'
] as const;

function texture(gl: WebGL2RenderingContext, unit: number, filter: number): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export class Tiers {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly painted: LoadedPaintedTileset;
  private readonly tiles = new TierTiles();
  private readonly tileTex: WebGLTexture;
  private readonly fieldTex: WebGLTexture;
  private readonly noiseTex: WebGLTexture;
  private readonly vao: WebGLVertexArrayObject;
  private readonly at: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private terrain: GameGrid | null = null;
  private resource: GameGrid | null = null;
  private pendingAll = false;
  private pending: TileAt[] = [];

  static create(
    gl: WebGL2RenderingContext,
    shaders: ShaderManager,
    painted: LoadedPaintedTileset
  ): Tiers | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, withRockSurface(fragmentSource));
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.error('[tiers] the rock tier shader did not build:', made.error);
      return null;
    }
    return new Tiers(gl, program, painted);
  }

  private constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    painted: LoadedPaintedTileset
  ) {
    this.gl = gl;
    this.program = program;
    this.painted = painted;
    this.vao = gl.createVertexArray()!;
    this.tileTex = texture(gl, TIER_TILE_UNIT, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16UI,
      1,
      1,
      0,
      gl.RGBA_INTEGER,
      gl.UNSIGNED_SHORT,
      new Uint16Array(4)
    );
    this.fieldTex = texture(gl, TIER_FIELD_UNIT, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(4)
    );
    this.noiseTex = texture(gl, TIER_NOISE_UNIT, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      NOISE_SIZE,
      NOISE_SIZE,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      tierNoiseTexels()
    );
    gl.activeTexture(gl.TEXTURE0);
    this.at = Object.fromEntries(
      UNIFORMS.map((n) => [n, gl.getUniformLocation(program, n)])
    ) as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  }

  setGrids(terrain: GameGrid, resource: GameGrid | null, dirty?: readonly TileAt[]): void {
    const fresh = terrain !== this.terrain || resource !== this.resource;
    this.terrain = terrain;
    this.resource = resource;
    if (fresh || !dirty || dirty.length === 0) {
      this.pendingAll = true;
      this.pending = [];
      return;
    }
    if (!this.pendingAll) for (const t of dirty) this.pending.push(t);
  }

  sync(): void {
    if (!this.terrain) return;
    const tile = this.painted.tileset.tile;
    if (this.pendingAll) {
      this.pendingAll = false;
      this.pending = [];
      this.tiles.readAll(this.terrain, this.resource, tile);
      this.uploadTiles();
      this.uploadFields();
      return;
    }
    if (this.pending.length === 0) return;
    const moved = this.tiles.read(this.terrain, this.resource, this.pending);
    this.pending = [];
    this.uploadTiles();
    if (moved) this.uploadFields();
  }

  private upload(unit: number, tex: WebGLTexture, format: 'tiles' | 'fields'): void {
    const gl = this.gl;
    const { w, h } = this.tiles;
    if (w === 0 || h === 0) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (format === 'tiles')
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16UI,
        w,
        h,
        0,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_SHORT,
        this.tiles.texels
      );
    else
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.tiles.fields
      );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  private uploadTiles(): void {
    if (this.tiles.texels.length === this.tiles.w * this.tiles.h * TIER_TEXEL)
      this.upload(TIER_TILE_UNIT, this.tileTex, 'tiles');
  }

  private uploadFields(): void {
    if (this.tiles.fields.length === this.tiles.w * this.tiles.h * TIER_FIELDS)
      this.upload(TIER_FIELD_UNIT, this.fieldTex, 'fields');
  }

  bindShared(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + TIER_TILE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.activeTexture(gl.TEXTURE0 + TIER_NOISE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.activeTexture(gl.TEXTURE0);
  }

  draw(f: TierFrame): number {
    const top = this.painted.top;
    if (!top || this.tiles.w === 0) return 0;
    const gl = this.gl;
    const tile = this.painted.tileset.tile;
    const u = this.at;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(u.u_projection, false, f.projection);
    gl.uniform2fv(u.u_viewOffset, f.viewOffset);
    gl.uniform2fv(u.u_zoom, f.zoom);
    gl.uniform1f(u.u_atlasScale, tile / BASE_TILE_PX);
    gl.uniform4f(u.u_rect, f.view.x0, f.view.y0, f.view.x1, f.view.y1);
    gl.uniform2f(u.u_rockRamp, top.ramp.x, top.ramp.y);
    gl.uniform2f(u.u_snowRamp, top.snow.x, top.snow.y);
    gl.uniform1f(u.u_snow, f.snow ? 1 : 0);
    gl.uniform1f(u.u_rockLift, top.lift);
    gl.uniform1f(u.u_fieldLit, f.fieldLit ? 1 : 0);
    gl.uniform3fv(u.u_ambient, f.ambient);
    gl.uniform1f(u.u_saturation, f.tone[0]);
    gl.uniform1f(u.u_brightness, f.tone[1]);
    gl.uniform1f(u.u_rowPx, f.rowPx);
    gl.uniform1f(u.u_rowDepth, f.rowDepth);
    gl.uniform1i(u.u_tierFieldTexture, TIER_FIELD_UNIT);
    gl.uniform1i(u.u_tierNoiseTexture, TIER_NOISE_UNIT);
    gl.uniform1i(u.u_tierTileTexture, TIER_TILE_UNIT);
    gl.uniform1i(u.u_paintAtlas, ATLAS_UNIT);
    gl.uniform1i(u.u_rockTexture, ROCK_UNIT);
    gl.uniform1i(u.u_veinTexture, VEIN_UNIT);
    gl.uniform1i(u.u_lightTexture, LIGHT_FIELD_UNIT);
    gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.painted.texture);
    gl.activeTexture(gl.TEXTURE0 + ROCK_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, top.texture);
    gl.activeTexture(gl.TEXTURE0 + VEIN_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, top.veins);
    gl.activeTexture(gl.TEXTURE0 + TIER_FIELD_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    this.bindShared();
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    return 1;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.tileTex);
    gl.deleteTexture(this.fieldTex);
    gl.deleteTexture(this.noiseTex);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
