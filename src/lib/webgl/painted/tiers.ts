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
import {
  ALPHA_BLEND,
  type GpuDevice,
  type GpuRenderPass,
  type GpuRenderPipeline,
  type GpuUniform
} from '../../gpu/device.js';
import { canvasPipeline } from '../canvasPipeline.js';
import { samplersOf } from '../samplers.js';
import { SizedTexture } from '../sizedTexture.js';

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

export class Tiers {
  private readonly gpu: GpuDevice;
  private readonly program: GpuRenderPipeline;
  private readonly painted: LoadedPaintedTileset;
  private readonly tiles = new TierTiles();
  private readonly tileTex: SizedTexture;
  private readonly fieldTex: SizedTexture;
  private readonly noiseTex: SizedTexture;
  private readonly at: Record<(typeof UNIFORMS)[number], GpuUniform | null>;
  private terrain: GameGrid | null = null;
  private resource: GameGrid | null = null;
  private pendingAll = false;
  private pending: TileAt[] = [];

  static create(
    gpu: GpuDevice,
    shaders: ShaderManager,
    painted: LoadedPaintedTileset
  ): Tiers | null {
    const made = shaders.createPipeline(
      PROGRAM,
      canvasPipeline(gpu, {
        vertex: vertexSource,
        fragment: withRockSurface(fragmentSource),
        topology: 'triangle-list',
        blend: ALPHA_BLEND,
        depthCompare: 'less-equal',
        depthWrite: true
      })
    );
    const program = made.pipeline;
    if (!made.success || !program) {
      console.error('[tiers] the rock tier shader did not build:', made.error);
      return null;
    }
    return new Tiers(gpu, program, painted);
  }

  private constructor(gpu: GpuDevice, program: GpuRenderPipeline, painted: LoadedPaintedTileset) {
    this.gpu = gpu;
    this.program = program;
    this.painted = painted;
    this.tileTex = new SizedTexture(gpu, 'rgba16uint');
    this.fieldTex = new SizedTexture(gpu, 'rgba8unorm');
    gpu.bindSampler(TIER_FIELD_UNIT, samplersOf(gpu).linear);
    this.noiseTex = new SizedTexture(gpu, 'rgba8unorm', NOISE_SIZE, NOISE_SIZE);
    this.noiseTex.write(tierNoiseTexels());
    this.at = Object.fromEntries(UNIFORMS.map((n) => [n, gpu.uniform(program, n)])) as Record<
      (typeof UNIFORMS)[number],
      GpuUniform | null
    >;
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

  private upload(tex: SizedTexture, data: ArrayBufferView): void {
    const { w, h } = this.tiles;
    if (w === 0 || h === 0) return;
    tex.resize(w, h);
    tex.write(data);
  }

  private uploadTiles(): void {
    if (this.tiles.texels.length === this.tiles.w * this.tiles.h * TIER_TEXEL)
      this.upload(this.tileTex, this.tiles.texels);
  }

  private uploadFields(): void {
    if (this.tiles.fields.length === this.tiles.w * this.tiles.h * TIER_FIELDS)
      this.upload(this.fieldTex, this.tiles.fields);
  }

  bindShared(): void {
    const gpu = this.gpu;
    gpu.setTextureSlot(TIER_TILE_UNIT);
    gpu.bindTexture(this.tileTex.texture);
    gpu.setTextureSlot(TIER_NOISE_UNIT);
    gpu.bindTexture(this.noiseTex.texture);
    gpu.setTextureSlot(0);
  }

  draw(pass: GpuRenderPass, f: TierFrame): number {
    const top = this.painted.top;
    if (!top || this.tiles.w === 0) return 0;
    const gpu = this.gpu;
    const tile = this.painted.tileset.tile;
    const u = this.at;
    pass.setPipeline(this.program);
    gpu.setMat4fv(u.u_projection, f.projection);
    gpu.setVec2fv(u.u_viewOffset, f.viewOffset);
    gpu.setVec2fv(u.u_zoom, f.zoom);
    gpu.setF32(u.u_atlasScale, tile / BASE_TILE_PX);
    gpu.setVec4f(u.u_rect, f.view.x0, f.view.y0, f.view.x1, f.view.y1);
    gpu.setVec2f(u.u_rockRamp, top.ramp.x, top.ramp.y);
    gpu.setVec2f(u.u_snowRamp, top.snow.x, top.snow.y);
    gpu.setF32(u.u_snow, f.snow ? 1 : 0);
    gpu.setF32(u.u_rockLift, top.lift);
    gpu.setF32(u.u_fieldLit, f.fieldLit ? 1 : 0);
    gpu.setVec3fv(u.u_ambient, f.ambient);
    gpu.setF32(u.u_saturation, f.tone[0]);
    gpu.setF32(u.u_brightness, f.tone[1]);
    gpu.setF32(u.u_rowPx, f.rowPx);
    gpu.setF32(u.u_rowDepth, f.rowDepth);
    gpu.setI32(u.u_tierFieldTexture, TIER_FIELD_UNIT);
    gpu.setI32(u.u_tierNoiseTexture, TIER_NOISE_UNIT);
    gpu.setI32(u.u_tierTileTexture, TIER_TILE_UNIT);
    gpu.setI32(u.u_paintAtlas, ATLAS_UNIT);
    gpu.setI32(u.u_rockTexture, ROCK_UNIT);
    gpu.setI32(u.u_veinTexture, VEIN_UNIT);
    gpu.setI32(u.u_lightTexture, LIGHT_FIELD_UNIT);
    gpu.setTextureSlot(ATLAS_UNIT);
    gpu.bindTexture(this.painted.texture);
    gpu.setTextureSlot(ROCK_UNIT);
    gpu.bindTexture(top.texture);
    gpu.setTextureSlot(VEIN_UNIT);
    gpu.bindTexture(top.veins);
    gpu.setTextureSlot(TIER_FIELD_UNIT);
    gpu.bindTexture(this.fieldTex.texture);
    this.bindShared();
    pass.draw(6);
    return 1;
  }

  dispose(): void {
    const gpu = this.gpu;
    this.tileTex.destroy();
    this.fieldTex.destroy();
    this.noiseTex.destroy();
    gpu.destroyRenderPipeline(this.program);
  }
}
