import vertexSource from '../shaders/groundBlend.vert.glsl?raw';
import fragmentSource from '../shaders/groundBlend.frag.glsl?raw';
import wgslSource from '../shaders/groundBlend.wgsl?raw';
import type { GameGrid } from '../game-grid.js';
import type { ShaderManager } from '../shaders.js';
import { BASE_TILE_PX } from '../tile-types.js';
import type { LoadedGroundField, LoadedPaintedTileset } from './loader.js';
import { groundFluid, groundLayer } from './groundLevels.js';
import { paintedGroundIds } from './tileset.js';
import { DEEP, DIST_STEPS, LAND, SHALLOW, distanceTo, shoreField } from './shoreField.js';
import { ART_PER_UNIT, waterBlockShift } from './waves.js';
import { WaterIce } from './waterIce.js';
import { RiverTextures } from './riverTextures.js';
import { riverTiles, type RiverTiles } from './riverGrid.js';
import type { TileData } from '../tile-types.js';
import {
  BufferUsage,
  halfFloats,
  type GpuBuffer,
  type GpuDevice,
  type GpuRenderPass,
  type GpuRenderPipeline,
  type GpuTexture,
  type StencilFaceState
} from '../../gpu/device.js';
import { TreeGroundLayer, withTreeGround, withTreeGroundWgsl } from './treeGroundLayer.js';
import { treeSoils } from './treeGroundTable.js';
import type { TreeSoil } from './treeGroundManifest.js';
import { uniformLayout, type UniformMember } from '../../gpu/uniforms.js';
import { SizedTexture } from '../sizedTexture.js';
import { canvasPipeline } from '../canvasPipeline.js';
import { MARK } from '../tilePipelines.js';
import { PASS_GROUP, PassBindings, blankTexture } from '../passBindings.js';
import { DRAW_GROUP, DrawSlices } from '../drawSlices.js';

const PROGRAM = 'groundBlend';
const MAX_KINDS = 64;
const TEXEL_UPDATE_LIMIT = 64;
const NO_BLOCK = -1;
const SHORE_LEVEL = 1.6;
const DEEP_WATER = 2;
const FULL = 255;
const WATER_FRAMES = 16;
const WATER_FPS = 8;
const TIDE_BYTES = 4;
const KIND_TIDE_BYTES = 2;

const SEA_VECS = 18;
const FLUID_VECS = 28;

const high = (name: string, type: UniformMember['type'], count?: number): UniformMember => ({
  name,
  type,
  precision: 'highp',
  ...(count === undefined ? {} : { count })
});

const GROUND_STATIC = uniformLayout('GroundStatic', [
  high('u_patch', 'vec4', MAX_KINDS),
  high('u_layer', 'vec4', MAX_KINDS),
  high('u_pieces', 'vec2'),
  high('u_tileArt', 'float'),
  high('u_artPerBase', 'float'),
  high('u_grassShift', 'ivec2'),
  high('u_treeKinds', 'int')
]);

export const GROUND_FRAME = uniformLayout('GroundFrame', [
  high('u_sea', 'vec4', SEA_VECS),
  high('u_fluid', 'vec4', FLUID_VECS),
  high('u_ambient', 'vec3'),
  high('u_artPerPx', 'float'),
  high('u_mapSize', 'ivec2'),
  high('u_lightFlicker', 'float'),
  high('u_fieldLit', 'float'),
  high('u_saturation', 'float'),
  high('u_brightness', 'float'),
  high('u_waterTime', 'float'),
  high('u_waterStyle', 'int'),
  high('u_waterBlock', 'int'),
  high('u_treeRow', 'int')
]);

const GROUND_DRAW = uniformLayout('GroundDraw', [high('u_treeOnly', 'int')]);
const GROUND_DRAW_WHOLE = 0;
const GROUND_DRAW_TREES = 1;

const GROUND_TEXTURES = [
  { name: 'u_kinds', sampleType: 'uint' },
  { name: 'u_paintAtlas', sampleType: 'unfilterable-float' },
  { name: 'u_light', sampleType: 'float', filter: 'linear' },
  { name: 'u_lightTexture', sampleType: 'unfilterable-float' },
  { name: 'u_tide', sampleType: 'float', filter: 'linear' },
  { name: 'u_waterField', sampleType: 'unfilterable-float' },
  { name: 'u_groundField', sampleType: 'unfilterable-float' },
  { name: 'u_groundFar', sampleType: 'unfilterable-float' },
  { name: 'u_ice', sampleType: 'float', filter: 'linear' },
  { name: 'u_flow', sampleType: 'float', filter: 'linear' },
  { name: 'u_stream', sampleType: 'unfilterable-float' },
  { name: 'u_trees', sampleType: 'unfilterable-float' }
] as const;

type LightSampler = (wx: number, wy: number, time: number) => [number, number, number];
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Rect = { x: number; y: number; w: number; h: number };
type Changed = { x: number; y: number; k: number };

export interface GroundBlendFrame {
  zoom: [number, number];
  ambient: [number, number, number];
  flicker: number;
  fieldLit: boolean;
  tone: [number, number];
  waterTime: number;
  sea?: Float32Array;
  fluid?: Float32Array;
  lightSampler?: LightSampler;
  lightTime: number;
  lightVersion: number;
  litBounds: Bounds | null | undefined;
  lightField: GpuTexture;
}

export function waterTime(nowMs: number): number {
  return (nowMs / 1000) % (WATER_FRAMES / WATER_FPS);
}

export function groundKindTable(painted: LoadedPaintedTileset): {
  patch: Float32Array;
  layer: Float32Array;
  tide: Uint8Array;
  shore: Uint8Array;
  still: Uint8Array;
} {
  const patch = new Float32Array(MAX_KINDS * 4);
  const layer = new Float32Array(MAX_KINDS * 4);
  const tide = new Uint8Array(MAX_KINDS * 2);
  const shore = new Uint8Array(MAX_KINDS);
  const still = new Uint8Array(MAX_KINDS);
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
          ? [art.bare.x, art.bare.y, art.bare.side, groundFluid(id)]
          : [0, 0, 0, groundFluid(id)]
        : [
            Math.round(first.u1 * tileset.atlasW),
            Math.round(first.v1 * tileset.atlasH),
            variant.patch * tileset.tile,
            groundFluid(id)
          ],
      k * 4
    );
    const { level, water } = groundLayer(id);
    layer.set([level, water, art?.ramps.x ?? NO_BLOCK, art?.ramps.y ?? NO_BLOCK], k * 4);
    tide.set([water >= DEEP_WATER ? FULL : 0, level > SHORE_LEVEL ? FULL : 0], k * 2);
    shore[k] = water >= DEEP_WATER ? DEEP : water > 0 ? SHALLOW : LAND;
    still[k] = groundFluid(id) > 0 ? 1 : 0;
  });
  return { patch, layer, tide, shore, still };
}

export function lightRect(bounds: Bounds, w: number, h: number): Rect {
  const x0 = Math.max(0, Math.floor(bounds.minX) - 1);
  const y0 = Math.max(0, Math.floor(bounds.minY) - 1);
  const x1 = Math.min(w, Math.ceil(bounds.maxX) + 1);
  const y1 = Math.min(h, Math.ceil(bounds.maxY) + 1);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0 + 1), h: Math.max(0, y1 - y0 + 1) };
}

export class GroundBlend {
  private readonly atlas: GpuTexture;
  private readonly kindTex: SizedTexture;
  private readonly tideTex: SizedTexture;
  private readonly water: GpuTexture;
  private readonly field: LoadedGroundField | null;
  private readonly artPerBase: number;
  private readonly tideOf: Uint8Array;
  private readonly shoreOf: Uint8Array;
  private readonly stillOf: Uint8Array;
  private waveStyle = 0;
  private readonly lightTex: SizedTexture;
  private readonly ice: WaterIce;
  private readonly rivers: RiverTextures;
  private readonly unitsPerTile: number;
  private riverData: RiverTiles = riverTiles(0);
  private riverStale = true;
  private readonly vbo: GpuBuffer;
  private drawn: readonly GpuTexture[] | null = null;
  private kinds = new Uint8Array(0);
  private tides = new Uint8Array(0);
  private w = 0;
  private h = 0;
  private grid: GameGrid | null = null;
  private stale = true;
  private dirty: { x: number; y: number }[] = [];
  private lightBuilt: { version: number; sampler: LightSampler | undefined } | null = null;
  private litRect: Rect | null = null;
  readonly trees: TreeGroundLayer | null;
  private readonly soils: TreeSoil[];

  static create(
    gpu: GpuDevice,
    shaders: ShaderManager,
    painted: LoadedPaintedTileset
  ): GroundBlend | null {
    const bindings = new PassBindings(gpu, PROGRAM, [GROUND_STATIC, GROUND_FRAME], GROUND_TEXTURES);
    const draws = new DrawSlices(gpu, PROGRAM, GROUND_DRAW);
    const describe = (stencil?: StencilFaceState) =>
      canvasPipeline(gpu, {
        vertex: vertexSource,
        fragment: withTreeGround(fragmentSource),
        wgsl: withTreeGroundWgsl(wgslSource),
        attributes: { a_position: 0 },
        buffers: [
          {
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [{ shaderLocation: 0, format: 'float32x2', offset: 0 }]
          }
        ],
        topology: 'triangle-list',
        bindings: [bindings, draws],
        ...(stencil ? { stencil } : {})
      });
    const made = shaders.createPipeline(PROGRAM, describe());
    const marking = shaders.createPipeline(`${PROGRAM}.marking`, describe(MARK));
    const program = made.pipeline;
    const marks = marking.pipeline;
    if (!made.success || !program || !marking.success || !marks) {
      bindings.destroy();
      draws.destroy();
      console.warn('[ground blend] off:', made.error ?? marking.error);
      return null;
    }
    if (!painted.water) {
      bindings.destroy();
      draws.destroy();
      console.warn('[ground blend] off: the water field did not load');
      return null;
    }
    return new GroundBlend(gpu, program, marks, bindings, draws, painted, painted.water);
  }

  private constructor(
    private readonly gpu: GpuDevice,
    private readonly program: GpuRenderPipeline,
    private readonly marking: GpuRenderPipeline,
    private readonly bindings: PassBindings,
    private readonly draws: DrawSlices,
    painted: LoadedPaintedTileset,
    water: GpuTexture
  ) {
    this.atlas = painted.texture;
    this.water = water;
    this.field = painted.ground;
    this.artPerBase = painted.tileset.tile / BASE_TILE_PX;
    this.kindTex = new SizedTexture(gpu, 'r8uint');
    this.tideTex = new SizedTexture(gpu, 'rgba8unorm');
    this.lightTex = new SizedTexture(gpu, 'rgba16float');
    this.ice = new WaterIce(gpu);
    this.rivers = new RiverTextures(gpu);
    this.unitsPerTile = painted.tileset.tile / ART_PER_UNIT;
    this.vbo = gpu.createBuffer({
      size: 12 * 4,
      usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
    });
    const { patch, layer, tide, shore, still } = groundKindTable(painted);
    this.tideOf = tide;
    this.shoreOf = shore;
    this.stillOf = still;
    const pieces = painted.tileset.ground?.pieces ?? { x: 0, y: 0 };
    bindings.set('u_pieces', [pieces.x, pieces.y]);
    bindings.set('u_tileArt', painted.tileset.tile);
    bindings.set('u_artPerBase', this.artPerBase);
    bindings.set('u_patch', patch);
    bindings.set('u_layer', layer);
    const look = painted.tileset.treeGround;
    this.trees = look ? new TreeGroundLayer(gpu, look, painted.tileset.tile) : null;
    this.soils = look ? treeSoils(look, paintedGroundIds(), (id) => groundLayer(id).water > 0) : [];
    bindings.set('u_treeKinds', look?.kinds.length ?? 0);
    bindings.set('u_grassShift', look?.grassShift ?? [0, 0]);
    draws.stage(GROUND_DRAW_WHOLE, { u_treeOnly: 0 });
    draws.stage(GROUND_DRAW_TREES, { u_treeOnly: 1 });
    draws.upload(2);
  }

  setTrees(
    grids: readonly (GameGrid | null)[],
    dirtyTiles?: ReadonlyArray<{ x: number; y: number }>
  ): void {
    this.trees?.setTrees(grids, dirtyTiles);
  }

  setIce(grid: GameGrid | null, dirtyTiles?: ReadonlyArray<{ x: number; y: number }>): void {
    this.ice.setGrid(grid, dirtyTiles);
  }

  setWaterStyle(waves: boolean): void {
    this.waveStyle = waves ? 1 : 0;
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
    const gpu = this.gpu;
    const bounds = grid.getBounds();
    const w = bounds ? bounds.max.x + 1 : 0;
    const h = bounds ? bounds.max.y + 1 : 0;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.lightBuilt = null;
      this.litRect = null;
      const r = w * BASE_TILE_PX;
      const b = h * BASE_TILE_PX;
      gpu.queue.writeBuffer(this.vbo, 0, new Float32Array([0, 0, r, 0, 0, b, r, 0, r, b, 0, b]));
    }
    this.kinds = new Uint8Array(w * h);
    this.tides = new Uint8Array(w * h * TIDE_BYTES);
    this.riverData = riverTiles(w * h);
    this.riverStale = true;
    for (const t of grid.getAllTiles()) {
      const { x, y } = t.position;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      this.kinds[y * w + x] = t.ground ?? 0;
      this.tides.set(this.tideOfKind(t.ground ?? 0), (y * w + x) * TIDE_BYTES);
      this.setRiverAt(y * w + x, t);
    }
    this.fillShore();
    this.fillStill();
    if (w === 0 || h === 0) return;
    for (const [tex, data] of [
      [this.kindTex, this.kinds],
      [this.tideTex, this.tides]
    ] as const) {
      tex.resize(w, h);
      tex.write(data);
    }
  }

  private setRiverAt(i: number, t: TileData | undefined): void {
    const r = this.riverData;
    const course = t?.riverCourse;
    r.river[i] = t?.river ? 1 : 0;
    r.down[i] = course ? course.down : -1;
    r.discharge[i] = course?.discharge ?? 0;
    r.slope[i] = course?.slope ?? 0;
  }

  private syncRivers(): void {
    if (!this.riverStale) return;
    this.riverStale = false;
    const water = Uint8Array.from(this.kinds, (k) => (this.shoreOf[k] === LAND ? 0 : 1));
    this.rivers.update({
      w: this.w,
      h: this.h,
      water,
      tiles: this.riverData,
      unitsPerTile: this.unitsPerTile
    });
  }

  private tideOfKind(k: number): Uint8Array {
    return this.tideOf.subarray(k * KIND_TIDE_BYTES, k * KIND_TIDE_BYTES + KIND_TIDE_BYTES);
  }

  private fillShore(): void {
    const n = this.w * this.h;
    const classes = new Uint8Array(n);
    for (let i = 0; i < n; i++) classes[i] = this.shoreOf[this.kinds[i]];
    const field = shoreField(classes, this.w, this.h);
    for (let i = 0; i < n; i++)
      this.tides.set(field.subarray(i * 2, i * 2 + 2), i * TIDE_BYTES + KIND_TIDE_BYTES);
  }

  private fillStill(): void {
    const n = this.w * this.h;
    const toBank = distanceTo((i) => this.stillOf[this.kinds[i]] === 0, this.w, this.h);
    const reach = new Uint8Array(n);
    for (let i = 0; i < n; i++) reach[i] = Math.min(FULL, Math.round(toBank[i] * DIST_STEPS));
    this.ice.setStill(reach);
  }

  private updateKindTexels(grid: GameGrid): void {
    const changed: Changed[] = [];
    let reshore = false;
    let restill = false;
    for (const { x, y } of this.dirty) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const tile = grid.getTile(x, y);
      const k = tile?.ground ?? 0;
      const was = this.kinds[y * this.w + x];
      if (this.riverData.river[y * this.w + x] !== (tile?.river ? 1 : 0)) this.riverStale = true;
      this.setRiverAt(y * this.w + x, tile);
      if (was === k) continue;
      if (this.shoreOf[was] !== this.shoreOf[k]) reshore = true;
      if (this.stillOf[was] !== this.stillOf[k]) restill = true;
      this.kinds[y * this.w + x] = k;
      this.tides.set(this.tideOfKind(k), (y * this.w + x) * TIDE_BYTES);
      changed.push({ x, y, k });
    }
    this.dirty = [];
    if (changed.length === 0) return;
    if (reshore) this.fillShore();
    if (restill) this.fillStill();
    if (reshore) this.riverStale = true;
    const tideAt = (x: number, y: number) =>
      this.tides.subarray(
        (y * this.w + x) * TIDE_BYTES,
        (y * this.w + x) * TIDE_BYTES + TIDE_BYTES
      );
    const layers = [
      {
        tex: this.kindTex,
        all: this.kinds,
        whole: false,
        one: (c: Changed) => Uint8Array.of(c.k)
      },
      {
        tex: this.tideTex,
        all: this.tides,
        whole: reshore,
        one: (c: Changed) => tideAt(c.x, c.y)
      }
    ];
    for (const layer of layers) {
      if (layer.whole || changed.length > TEXEL_UPDATE_LIMIT) layer.tex.write(layer.all);
      else for (const c of changed) layer.tex.write(layer.one(c), c.x, c.y, 1, 1);
    }
  }

  private sampleRect(r: Rect, sampler: LightSampler | undefined, time: number): Uint16Array {
    const out = new Float32Array(r.w * r.h * 4);
    for (let j = 0; j < r.h; j++)
      for (let i = 0; i < r.w; i++) {
        const l = sampler ? sampler(r.x + i, r.y + j, time) : [1, 1, 1];
        out.set([l[0], l[1], l[2], 1], (j * r.w + i) * 4);
      }
    return halfFloats(out);
  }

  private rebuildLight(f: GroundBlendFrame): void {
    const built = this.lightBuilt;
    if (built && built.version === f.lightVersion && built.sampler === f.lightSampler) return;
    const cw = this.w + 1;
    const ch = this.h + 1;
    if (!built) this.lightTex.resize(cw, ch, true);
    const old = this.litRect;
    if (old && old.w > 0 && old.h > 0)
      this.lightTex.write(new Uint16Array(old.w * old.h * 4), old.x, old.y, old.w, old.h);
    const whole = { x: 0, y: 0, w: cw, h: ch };
    const rect =
      !f.lightSampler || f.litBounds === undefined
        ? whole
        : f.litBounds === null
          ? null
          : lightRect(f.litBounds, this.w, this.h);
    if (rect && rect.w > 0 && rect.h > 0)
      this.lightTex.write(
        this.sampleRect(rect, f.lightSampler, f.lightTime),
        rect.x,
        rect.y,
        rect.w,
        rect.h
      );
    this.litRect = rect;
    this.lightBuilt = { version: f.lightVersion, sampler: f.lightSampler };
  }

  prepare(f: GroundBlendFrame): void {
    this.drawn = null;
    const grid = this.grid;
    if (!grid) return;
    if (this.stale) {
      this.rebuildKinds(grid);
      this.stale = false;
      this.dirty = [];
    } else if (this.dirty.length > 0) this.updateKindTexels(grid);
    if (this.w === 0 || this.h === 0) return;
    this.ice.sync(this.w, this.h);
    if (f.sea && this.waveStyle) this.syncRivers();
    this.rebuildLight(f);
    this.trees?.sync(this.kinds, this.w, this.h, this.soils);
    const b = this.bindings;
    b.set('u_treeRow', this.trees?.tableRow ?? 0);
    b.set('u_artPerPx', this.artPerBase / f.zoom[0]);
    b.set('u_ambient', f.ambient);
    b.set('u_lightFlicker', f.flicker);
    b.set('u_fieldLit', f.fieldLit ? 1 : 0);
    b.set('u_saturation', f.tone[0]);
    b.set('u_brightness', f.tone[1]);
    b.set('u_waterTime', f.waterTime);
    b.set('u_waterStyle', f.sea ? this.waveStyle : 0);
    b.set('u_waterBlock', waterBlockShift(this.artPerBase / f.zoom[0]));
    if (f.sea) b.set('u_sea', f.sea);
    if (f.fluid) b.set('u_fluid', f.fluid);
    b.set('u_mapSize', [this.w, this.h]);
    b.upload();
    const blank = blankTexture(this.gpu);
    this.drawn = [
      this.kindTex.texture,
      this.atlas,
      this.lightTex.texture,
      f.lightField,
      this.tideTex.texture,
      this.water,
      this.field?.field ?? blank,
      this.field?.far ?? blank,
      this.ice.texture,
      this.rivers.flow,
      this.rivers.stream,
      this.trees?.texture ?? blank
    ];
  }

  encodeWinterTrees(pass: GpuRenderPass): boolean {
    if (!this.trees?.winter) return false;
    return this.encode(pass, GROUND_DRAW_TREES, this.marking);
  }

  encode(pass: GpuRenderPass, slice = GROUND_DRAW_WHOLE, pipeline = this.program): boolean {
    if (!this.drawn) return false;
    pass.setPipeline(pipeline);
    pass.setBindGroup(PASS_GROUP, this.bindings.group(this.drawn));
    pass.setBindGroup(DRAW_GROUP, this.draws.group, [this.draws.offset(slice)]);
    pass.setVertexBuffer(0, this.vbo);
    pass.draw(6);
    return true;
  }

  dispose(): void {
    const gpu = this.gpu;
    this.kindTex.destroy();
    this.tideTex.destroy();
    this.lightTex.destroy();
    this.trees?.dispose();
    this.ice.dispose();
    this.rivers.dispose();
    gpu.destroyBuffer(this.vbo);
    this.bindings.destroy();
    this.draws.destroy();
    gpu.destroyRenderPipeline(this.program);
    gpu.destroyRenderPipeline(this.marking);
  }
}
