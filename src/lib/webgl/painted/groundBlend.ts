import vertexSource from '../shaders/groundBlend.vert.glsl?raw';
import fragmentSource from '../shaders/groundBlend.frag.glsl?raw';
import type { GameGrid } from '../game-grid.js';
import type { ShaderManager } from '../shaders.js';
import { BASE_TILE_PX } from '../tile-types.js';
import type { LoadedGroundField, LoadedPaintedTileset } from './loader.js';
import { groundFluid, groundLayer } from './groundLevels.js';
import { paintedGroundIds } from './tileset.js';
import { LIGHT_FIELD_UNIT } from './lightPass.js';
import { DEEP, DIST_STEPS, LAND, SHALLOW, distanceTo, shoreField } from './shoreField.js';
import { ART_PER_UNIT, waterBlockShift } from './waves.js';
import { ICE_UNIT, WaterIce } from './waterIce.js';
import { FLOW_UNIT, RiverTextures, STREAM_UNIT } from './riverTextures.js';
import { riverTiles, type RiverTiles } from './riverGrid.js';
import type { TileData } from '../tile-types.js';
import {
  BufferUsage,
  halfFloats,
  type GpuBuffer,
  type GpuDevice,
  type GpuPipeline,
  type GpuTexture,
  type GpuUniform,
  type GpuVertexLayout
} from '../../gpu/device.js';
import { TREE_UNIT, TreeGroundLayer, withTreeGround } from './treeGroundLayer.js';
import { treeSoils } from './treeGroundTable.js';
import type { TreeSoil } from './treeGroundManifest.js';
import { samplersOf } from '../samplers.js';
import { SizedTexture } from '../sizedTexture.js';

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
const TIDE_BYTES = 4;
const KIND_TIDE_BYTES = 2;

type LightSampler = (wx: number, wy: number, time: number) => [number, number, number];
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Rect = { x: number; y: number; w: number; h: number };
type Changed = { x: number; y: number; k: number };

export interface GroundBlendFrame {
  projection: Float32Array;
  viewOffset: [number, number];
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
  private readonly gpu: GpuDevice;
  private readonly program: GpuPipeline;
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
  private readonly vao: GpuVertexLayout;
  private readonly vbo: GpuBuffer;
  private readonly at: Record<string, GpuUniform | null>;
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
    const made = shaders.createProgram(PROGRAM, vertexSource, withTreeGround(fragmentSource));
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[ground blend] off:', made.error);
      return null;
    }
    if (!painted.water) {
      console.warn('[ground blend] off: the water field did not load');
      return null;
    }
    return new GroundBlend(gpu, program, painted, painted.water);
  }

  private constructor(
    gpu: GpuDevice,
    program: GpuPipeline,
    painted: LoadedPaintedTileset,
    water: GpuTexture
  ) {
    this.gpu = gpu;
    this.program = program;
    this.atlas = painted.texture;
    this.water = water;
    this.field = painted.ground;
    this.artPerBase = painted.tileset.tile / BASE_TILE_PX;
    this.kindTex = new SizedTexture(gpu, 'r8uint');
    this.tideTex = new SizedTexture(gpu, 'rgba8unorm');
    this.lightTex = new SizedTexture(gpu, 'rgba16float');
    gpu.bindSampler(TIDE_UNIT, samplersOf(gpu).linear);
    gpu.bindSampler(LIGHT_UNIT, samplersOf(gpu).linear);
    this.ice = new WaterIce(gpu);
    this.rivers = new RiverTextures(gpu);
    this.unitsPerTile = painted.tileset.tile / ART_PER_UNIT;
    this.vao = gpu.createVertexLayout()!;
    this.vbo = gpu.createBuffer({
      size: 12 * 4,
      usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
    });
    gpu.setVertexLayout(this.vao);
    gpu.setVertexBuffer(this.vbo);
    const loc = gpu.attribute(program, 'a_position');
    gpu.vertexAttribute(loc, { format: 'float32x2', stride: 0, offset: 0 });
    gpu.setVertexLayout(null);
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
      'u_pieces',
      'u_waterStyle',
      'u_waterBlock',
      'u_sea[0]',
      'u_fluid[0]',
      'u_ice',
      'u_flow',
      'u_stream',
      'u_trees',
      'u_treeRow',
      'u_treeKinds',
      'u_treeOnly',
      'u_grassShift'
    ];
    this.at = Object.fromEntries(names.map((n) => [n, gpu.uniform(program, n)]));
    const { patch, layer, tide, shore, still } = groundKindTable(painted);
    this.tideOf = tide;
    this.shoreOf = shore;
    this.stillOf = still;
    gpu.setPipeline(program);
    gpu.setI32(this.at.u_tide, TIDE_UNIT);
    gpu.setI32(this.at.u_waterField, WATER_UNIT);
    gpu.setI32(this.at.u_ice, ICE_UNIT);
    gpu.setI32(this.at.u_flow, FLOW_UNIT);
    gpu.setI32(this.at.u_stream, STREAM_UNIT);
    gpu.setI32(this.at.u_groundField, GROUND_UNIT);
    gpu.setI32(this.at.u_groundFar, FAR_UNIT);
    const pieces = painted.tileset.ground?.pieces ?? { x: 0, y: 0 };
    gpu.setVec2f(this.at.u_pieces, pieces.x, pieces.y);
    gpu.setI32(this.at.u_paintAtlas, ATLAS_UNIT);
    gpu.setI32(this.at.u_kinds, KIND_UNIT);
    gpu.setI32(this.at.u_light, LIGHT_UNIT);
    gpu.setF32(this.at.u_tileArt, painted.tileset.tile);
    gpu.setF32(this.at.u_artPerBase, this.artPerBase);
    gpu.setVec4fv(this.at.u_patch, patch);
    gpu.setVec4fv(this.at.u_layer, layer);
    const look = painted.tileset.treeGround;
    this.trees = look ? new TreeGroundLayer(gpu, look, painted.tileset.tile) : null;
    this.soils = look ? treeSoils(look, paintedGroundIds(), (id) => groundLayer(id).water > 0) : [];
    gpu.setPipeline(this.program);
    gpu.setI32(this.at.u_trees, TREE_UNIT);
    gpu.setI32(this.at.u_treeKinds, look?.kinds.length ?? 0);
    gpu.setVec2i(this.at.u_grassShift, look?.grassShift[0] ?? 0, look?.grassShift[1] ?? 0);
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

  private bindOn(unit: number, tex: GpuTexture): void {
    this.gpu.setTextureSlot(unit);
    this.gpu.bindTexture(tex);
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

  drawWinterTrees(f: GroundBlendFrame): boolean {
    if (!this.trees?.winter) return false;
    return this.draw(f, true);
  }

  draw(f: GroundBlendFrame, treeOnly = false): boolean {
    const grid = this.grid;
    if (!grid) return false;
    const gpu = this.gpu;
    if (this.stale) {
      this.rebuildKinds(grid);
      this.stale = false;
      this.dirty = [];
    } else if (this.dirty.length > 0) this.updateKindTexels(grid);
    if (this.w === 0 || this.h === 0) return false;
    this.ice.sync(this.w, this.h);
    if (f.sea && this.waveStyle) this.syncRivers();
    this.rebuildLight(f);
    this.trees?.sync(this.kinds, this.w, this.h, this.soils);
    gpu.setPipeline(this.program);
    gpu.setI32(this.at.u_treeOnly, treeOnly ? 1 : 0);
    gpu.setI32(this.at.u_treeRow, this.trees?.tableRow ?? 0);
    gpu.setMat4fv(this.at.u_projection, f.projection);
    gpu.setVec2fv(this.at.u_viewOffset, f.viewOffset);
    gpu.setVec2fv(this.at.u_zoom, f.zoom);
    gpu.setF32(this.at.u_artPerPx, this.artPerBase / f.zoom[0]);
    gpu.setVec3fv(this.at.u_ambient, f.ambient);
    gpu.setF32(this.at.u_lightFlicker, f.flicker);
    gpu.setI32(this.at.u_lightTexture, LIGHT_FIELD_UNIT);
    gpu.setF32(this.at.u_fieldLit, f.fieldLit ? 1 : 0);
    gpu.setF32(this.at.u_saturation, f.tone[0]);
    gpu.setF32(this.at.u_brightness, f.tone[1]);
    gpu.setF32(this.at.u_waterTime, f.waterTime);
    gpu.setI32(this.at.u_waterStyle, f.sea ? this.waveStyle : 0);
    gpu.setI32(this.at.u_waterBlock, waterBlockShift(this.artPerBase / f.zoom[0]));
    if (f.sea) gpu.setVec4fv(this.at['u_sea[0]'], f.sea);
    if (f.fluid) gpu.setVec4fv(this.at['u_fluid[0]'], f.fluid);
    gpu.setVec2i(this.at.u_mapSize, this.w, this.h);
    this.bindOn(ATLAS_UNIT, this.atlas);
    this.bindOn(KIND_UNIT, this.kindTex.texture);
    this.bindOn(TIDE_UNIT, this.tideTex.texture);
    this.bindOn(WATER_UNIT, this.water);
    if (this.field) {
      this.bindOn(GROUND_UNIT, this.field.field);
      this.bindOn(FAR_UNIT, this.field.far);
    }
    this.bindOn(LIGHT_UNIT, this.lightTex.texture);
    this.ice.bind();
    this.rivers.bind();
    if (this.trees) this.bindOn(TREE_UNIT, this.trees.texture);
    gpu.setTextureSlot(0);
    gpu.setVertexLayout(this.vao);
    gpu.draw('triangle-list', 6);
    gpu.setVertexLayout(null);
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
    gpu.destroyVertexLayout(this.vao);
    gpu.destroyPipeline(this.program);
  }
}
