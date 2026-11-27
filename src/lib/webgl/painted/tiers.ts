import vertexSource from '../shaders/tier.vert.glsl?raw';
import fragmentSource from '../shaders/tier.frag.glsl?raw';
import ditherSource from '../shaders/dither.wgsl?raw';
import rockSurfaceSource from '../shaders/rockSurface.wgsl?raw';
import wgslSource from '../shaders/tier.wgsl?raw';
import type { GameGrid } from '../game-grid.js';
import type { ShaderManager } from '../shaders.js';
import { BASE_TILE_PX } from '../tile-types.js';
import type { LoadedPaintedTileset } from './loader.js';
import { withRockSurface } from './rockSurface.js';
import { NOISE_SIZE, tierNoiseTexels } from './tierNoise.js';
import { TIER_FIELDS, TIER_TEXEL, TierTiles, type TileAt } from './tierTiles.js';
import {
  ALPHA_BLEND,
  type GpuDevice,
  type GpuRenderPass,
  type GpuRenderPipeline,
  type GpuTexture
} from '../../gpu/device.js';
import { uniformLayout } from '../../gpu/uniforms.js';
import { canvasPipeline } from '../canvasPipeline.js';
import { PASS_GROUP, PassBindings } from '../passBindings.js';
import { SizedTexture } from '../sizedTexture.js';

const PROGRAM = 'tiers';

export interface TierView {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TierFrame {
  view: TierView;
  ambient: [number, number, number];
  fieldLit: boolean;
  tone: [number, number];
  rowPx: number;
  rowDepth: number;
  snow: boolean;
}

const TIER_FRAME = uniformLayout('TierFrame', [
  { name: 'u_rect', type: 'vec4', precision: 'highp' },
  { name: 'u_ambient', type: 'vec3', precision: 'mediump' },
  { name: 'u_atlasScale', type: 'float', precision: 'highp' },
  { name: 'u_rockRamp', type: 'vec2', precision: 'highp' },
  { name: 'u_snowRamp', type: 'vec2', precision: 'highp' },
  { name: 'u_snow', type: 'float', precision: 'mediump' },
  { name: 'u_rockLift', type: 'float', precision: 'mediump' },
  { name: 'u_fieldLit', type: 'float', precision: 'mediump' },
  { name: 'u_saturation', type: 'float', precision: 'mediump' },
  { name: 'u_brightness', type: 'float', precision: 'mediump' },
  { name: 'u_rowPx', type: 'float', precision: 'highp' },
  { name: 'u_rowDepth', type: 'float', precision: 'highp' }
]);

const TIER_TEXTURES = [
  { name: 'u_tierFieldTexture', sampleType: 'float', filter: 'linear' },
  { name: 'u_tierNoiseTexture', sampleType: 'unfilterable-float' },
  { name: 'u_tierTileTexture', sampleType: 'uint' },
  { name: 'u_paintAtlas', sampleType: 'unfilterable-float' },
  { name: 'u_rockTexture', sampleType: 'unfilterable-float' },
  { name: 'u_veinTexture', sampleType: 'unfilterable-float' },
  { name: 'u_lightTexture', sampleType: 'unfilterable-float' }
] as const;

export class Tiers {
  private readonly tiles = new TierTiles();
  private readonly tileTex: SizedTexture;
  private readonly fieldTex: SizedTexture;
  private readonly noiseTex: SizedTexture;
  private drawn: readonly GpuTexture[] | null = null;
  private terrain: GameGrid | null = null;
  private resource: GameGrid | null = null;
  private pendingAll = false;
  private pending: TileAt[] = [];

  static create(
    gpu: GpuDevice,
    shaders: ShaderManager,
    painted: LoadedPaintedTileset
  ): Tiers | null {
    const bindings = new PassBindings(gpu, PROGRAM, [TIER_FRAME], TIER_TEXTURES);
    const made = shaders.createPipeline(
      PROGRAM,
      canvasPipeline(gpu, {
        vertex: vertexSource,
        fragment: withRockSurface(fragmentSource),
        wgsl: ditherSource + rockSurfaceSource + wgslSource,
        topology: 'triangle-list',
        blend: ALPHA_BLEND,
        depthCompare: 'less-equal',
        depthWrite: true,
        bindings: [bindings]
      })
    );
    const program = made.pipeline;
    if (!made.success || !program) {
      bindings.destroy();
      console.error('[tiers] the rock tier shader did not build:', made.error);
      return null;
    }
    return new Tiers(gpu, program, painted, bindings);
  }

  private constructor(
    private readonly gpu: GpuDevice,
    private readonly program: GpuRenderPipeline,
    private readonly painted: LoadedPaintedTileset,
    private readonly bindings: PassBindings
  ) {
    this.tileTex = new SizedTexture(gpu, 'rgba16uint');
    this.fieldTex = new SizedTexture(gpu, 'rgba8unorm');
    this.noiseTex = new SizedTexture(gpu, 'rgba8unorm', NOISE_SIZE, NOISE_SIZE);
    this.noiseTex.write(tierNoiseTexels());
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

  get tileTexture(): GpuTexture {
    return this.tileTex.texture;
  }

  get noiseTexture(): GpuTexture {
    return this.noiseTex.texture;
  }

  prepare(f: TierFrame, light: GpuTexture): void {
    this.drawn = null;
    const top = this.painted.top;
    if (!top || this.tiles.w === 0) return;
    const b = this.bindings;
    b.set('u_atlasScale', this.painted.tileset.tile / BASE_TILE_PX);
    b.set('u_rect', [f.view.x0, f.view.y0, f.view.x1, f.view.y1]);
    b.set('u_rockRamp', [top.ramp.x, top.ramp.y]);
    b.set('u_snowRamp', [top.snow.x, top.snow.y]);
    b.set('u_snow', f.snow ? 1 : 0);
    b.set('u_rockLift', top.lift);
    b.set('u_fieldLit', f.fieldLit ? 1 : 0);
    b.set('u_ambient', f.ambient);
    b.set('u_saturation', f.tone[0]);
    b.set('u_brightness', f.tone[1]);
    b.set('u_rowPx', f.rowPx);
    b.set('u_rowDepth', f.rowDepth);
    b.upload();
    this.drawn = [
      this.fieldTex.texture,
      this.noiseTex.texture,
      this.tileTex.texture,
      this.painted.texture,
      top.texture,
      top.veins,
      light
    ];
  }

  encode(pass: GpuRenderPass): number {
    if (!this.drawn) return 0;
    pass.setPipeline(this.program);
    pass.setBindGroup(PASS_GROUP, this.bindings.group(this.drawn));
    pass.draw(6);
    return 1;
  }

  dispose(): void {
    const gpu = this.gpu;
    this.tileTex.destroy();
    this.fieldTex.destroy();
    this.noiseTex.destroy();
    this.bindings.destroy();
    gpu.destroyRenderPipeline(this.program);
  }
}
