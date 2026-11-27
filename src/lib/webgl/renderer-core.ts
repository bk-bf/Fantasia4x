import { createOrthographicMatrix, PerformanceTimer } from './utils.js';
import { MissingWgsl, ShaderManager, createTileRendererShaders } from './shaders.js';
import { createSquareCellAtlas, loadBitlandsAtlas } from './font-atlas.js';
import { TextureManager, uploadFontAtlas } from './texture-manager.js';
import { ALPHA_CUT, GridRenderer, type GridDraw, type GridRenderOptions } from './grid-renderer.js';
import type { TileShading } from './tileShading.js';
import { WebGLStateManager } from './webgl-state.js';
import type { GameGrid } from './game-grid.js';
import { PipelineBuildFailed, type GpuDevice, type GpuRenderPass, type GpuTexture } from '../gpu/device.js';
import type { FontAtlas } from './types.js';
import { BASE_TILE_PX } from './tile-types.js';
import { WORK_PINS } from '../workPins/flag.js';
import { addFrameTotals } from '../workPins/page.js';
import { GROUND_BLEND, PAINTED_LIGHT, PAINTED_TILES, ROCK_TIERS } from './painted/flag.js';
import { passOn } from './passes.js';
import { loadPaintedTileset, type LoadedPaintedTileset } from './painted/loader.js';
import { GroundBlend, waterTime } from './painted/groundBlend.js';
import { PaintedLightPass, type LightPassFrame } from './painted/lightPass.js';
import {
  MAP_WEATHER,
  gradeForHour,
  type MapWeatherId,
  type PointLight,
  type Rgb,
  type TileRect
} from './painted/lightGrade.js';
import { resolveSpriteLights } from './painted/spriteLights.js';
import { PaintedVignette } from './painted/vignette.js';
import { FRAME_GROUP, frameBindings } from './frameBindings.js';
import { blankTexture } from './passBindings.js';
import { PaintedShadowCast, SHADOW_DEPTH, SHADOW_SHADE } from './painted/shadowCast.js';
import { GroundRings, type GroundRing, type RingInk, type RingSet } from './groundRings.js';
import {
  drawnAt,
  drawnBounds,
  drawnFigure,
  type DrawnFigure,
  type DrawnFrame,
  type Quad
} from './drawnSprites.js';
import { WindClock, type Heading } from './painted/wind.js';
import type { PaintedSprite, TreeFx } from './painted/manifest.js';
import { WaveClock, waterStill, type MapMotion, type SeaWeather } from './painted/waves.js';
import { FLUID_DEFS, FluidClock, WATER_FLUID, type FluidSet } from './painted/fluids.js';
import { FallingLeaves } from './painted/leaves.js';
import { CUT_MAX, cutPoints } from './painted/cutaway.js';
import { Tiers } from './painted/tiers.js';

const DRESS_BUDGET_MS = 3;
const TREE_GROUND_STENCIL = 1;
const WINTER = 'winter';

export const ROW_DEPTH_RANGE = 8192;

export const SPRITE_LAYERS = ['resource', 'building', 'item', 'entity', 'resourceTall'] as const;
export type SpriteLayer = (typeof SPRITE_LAYERS)[number];
const LAYER_PASS = {
  resource: 'resources',
  building: 'buildings',
  item: 'items',
  entity: 'creatures',
  resourceTall: 'tall-resources'
} as const satisfies Record<SpriteLayer, Parameters<typeof passOn>[0]>;
const CHUNKED: Partial<Record<SpriteLayer, 'resource' | 'resourceTall'>> = {
  resource: 'resource',
  resourceTall: 'resourceTall'
};

interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderStats {
  fps: number;
  frameTime: number;
  drawCalls: number;
  vertexCount: number;
  terrainMs: number;
  overlayMs: number;
  terrainRebuilds: number;
  resourceRebuilds: number;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  tileWidth?: number;
  tileHeight?: number;
  debug?: boolean;
  contextAttributes?: WebGLContextAttributes;
  onDeviceLost?: (message: string) => void;
}

export class WebGLRendererCore {
  private canvas: HTMLCanvasElement;
  private projectionMatrix: Float32Array;
  private viewport: Viewport;
  private debug: boolean;
  private timer: PerformanceTimer;
  private stats: RenderStats;

  private tileWidth: number;
  private tileHeight: number;

  private viewTileX = 0;
  private viewTileY = 0;

  private webglState: WebGLStateManager;
  private shaderManager: ShaderManager | null = null;
  private tile: TileShading | null = null;
  private textureManager: TextureManager | null = null;
  private gridRenderer: GridRenderer | null = null;

  private fontAtlas: FontAtlas | null = null;
  private fontTexture: GpuTexture | null = null;

  private tilesetLoaded = false;
  private painted: LoadedPaintedTileset | null = null;
  private rowDepth = PAINTED_TILES;
  private groundBlend: GroundBlend | null = null;
  private lightPass: PaintedLightPass | null = null;
  private shadowCast: PaintedShadowCast | null = null;
  private vignette: PaintedVignette | null = null;
  private groundRings: GroundRings | null = null;
  private leaves: FallingLeaves | null = null;
  private tiers: Tiers | null = null;
  private readonly wind = new WindClock();
  private readonly waves = new WaveClock();
  private readonly fluidClock = new FluidClock();
  private fluids: FluidSet = FLUID_DEFS;
  private season: string | undefined = undefined;
  private rings: RingSet | null = null;
  private pointLights: readonly PointLight[] = [];
  private ambientBase: Rgb = [1, 1, 1];
  private mapWeather: MapWeatherId = 'clear';

  private gameGrid: GameGrid | null = null;
  private gridVersion = 0;
  private overlayGrid: GameGrid | null = null;
  private itemOverlayGrid: GameGrid | null = null;
  private buildingOverlayGrid: GameGrid | null = null;
  private snowGrid: GameGrid | null = null;
  private snowVersion = 0;
  private resourceOverlayGrid: GameGrid | null = null;
  private resourceTallOverlayGrid: GameGrid | null = null;

  private ambientLight = 1.0;
  private ambientTint: [number, number, number] = [1.0, 1.0, 1.0];

  private dynamicLight = false;
  private vignetteOn = true;
  private swayOn = true;
  private wavesOn = true;
  private seaWeather: SeaWeather = { rain: 0 };
  private waveMix = 1;

  private lightVersion = 0;

  private lightSampler:
    | ((wx: number, wy: number, time: number) => [number, number, number])
    | null = null;
  private lightBounds:
    | { minX: number; minY: number; maxX: number; maxY: number }
    | null
    | undefined = undefined;

  private initPromise: Promise<boolean>;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.debug = options.debug ?? false;
    this.tileWidth = options.tileWidth ?? 12;
    this.tileHeight = options.tileHeight ?? 20;
    this.timer = new PerformanceTimer();
    this.stats = {
      fps: 0,
      frameTime: 0,
      drawCalls: 0,
      vertexCount: 0,
      terrainMs: 0,
      overlayMs: 0,
      terrainRebuilds: 0,
      resourceRebuilds: 0
    };

    this.viewport = { x: 0, y: 0, width: this.canvas.width, height: this.canvas.height };

    this.projectionMatrix = createOrthographicMatrix(0, this.canvas.width, this.canvas.height, 0);

    this.webglState = new WebGLStateManager({
      canvas: this.canvas,
      contextAttributes: options.contextAttributes,
      debug: this.debug,
      onDeviceLost: options.onDeviceLost
    });

    this.initPromise = this.initialize();
  }

  async waitForInitialization(): Promise<boolean> {
    return this.initPromise;
  }

  setGrid(grid: GameGrid, dirtyTiles?: ReadonlyArray<{ x: number; y: number }>): void {
    this.gameGrid = grid;
    this.tiers?.setGrids(grid, this.resourceOverlayGrid, dirtyTiles);
    this.groundBlend?.setGrid(grid, dirtyTiles);
    this.groundBlend?.setTrees(this.treeGrids(), dirtyTiles);
    if (dirtyTiles && dirtyTiles.length > 0) {
      this.gridRenderer?.markTerrainChunksDirty(dirtyTiles);
    } else {
      this.gridVersion++;
    }
  }

  setSnowGrid(grid: GameGrid | null, dirtyTiles?: ReadonlyArray<{ x: number; y: number }>): void {
    this.snowGrid = grid;
    this.groundBlend?.setIce(grid, dirtyTiles);
    if (dirtyTiles && dirtyTiles.length > 0) {
      this.gridRenderer?.markSnowChunksDirty(dirtyTiles);
    } else {
      this.snowVersion++;
    }
  }

  setOverlayGrid(grid: GameGrid | null): void {
    this.overlayGrid = grid;
  }

  setItemOverlayGrid(grid: GameGrid | null): void {
    this.itemOverlayGrid = grid;
  }

  setBuildingOverlayGrid(grid: GameGrid | null): void {
    this.buildingOverlayGrid = grid;
  }

  setResourceOverlayGrid(grid: GameGrid | null): void {
    if (this.gameGrid && grid !== this.resourceOverlayGrid)
      this.tiers?.setGrids(this.gameGrid, grid);
    this.resourceOverlayGrid = grid;
    this.groundBlend?.setTrees(this.treeGrids());
  }

  private treeGrids(): (GameGrid | null)[] {
    return [this.resourceOverlayGrid, this.resourceTallOverlayGrid];
  }

  setResourceTallOverlayGrid(grid: GameGrid | null): void {
    this.resourceTallOverlayGrid = grid;
    this.groundBlend?.setTrees(this.treeGrids());
  }

  setGroundRings(list: readonly GroundRing[], ink: RingInk): void {
    this.rings = { list, ink };
  }

  private spriteGrid(layer: SpriteLayer): GameGrid | null {
    if (layer === 'resource') return this.resourceOverlayGrid;
    if (layer === 'building') return this.buildingOverlayGrid;
    if (layer === 'item') return this.itemOverlayGrid;
    if (layer === 'entity') return this.overlayGrid;
    return this.resourceTallOverlayGrid;
  }

  private drawnFrame(): DrawnFrame {
    return {
      basePx: BASE_TILE_PX,
      artPx: this.painted?.tileset.tile ?? BASE_TILE_PX,
      lift: this.painted?.top?.lift ?? null,
      texels: this.painted?.texels() ?? null,
      depth: this.rowDepth
    };
  }

  drawnAt(px: number, py: number): { layer: SpriteLayer; x: number; y: number } | null {
    const hit = drawnAt(
      SPRITE_LAYERS.map((layer) => this.spriteGrid(layer)),
      px,
      py,
      this.drawnFrame()
    );
    return hit && { layer: SPRITE_LAYERS[hit.layer], x: hit.x, y: hit.y };
  }

  drawnBounds(layer: SpriteLayer, x: number, y: number): Quad | null {
    const tile = this.spriteGrid(layer)?.getTile(x, y);
    if (!tile || (!tile.painted && (!tile.char || tile.char === ' '))) return null;
    return drawnBounds(tile, this.drawnFrame());
  }

  drawnFigure(layer: SpriteLayer, x: number, y: number): DrawnFigure | null {
    const tile = this.spriteGrid(layer)?.getTile(x, y);
    if (!tile || (!tile.painted && (!tile.char || tile.char === ' '))) return null;
    return drawnFigure(tile, this.drawnFrame());
  }

  atlasCell(q: Quad): Uint8ClampedArray | null {
    return this.painted?.cell(q[0], q[1], q[2] - q[0], q[3] - q[1]) ?? null;
  }

  gradeWeights(): Rgb {
    return gradeForHour(this.ambientLight, this.ambientBase, MAP_WEATHER[this.mapWeather]).weights;
  }

  setViewTileOffset(x: number, y: number): void {
    this.viewTileX = x;
    this.viewTileY = y;
  }

  setAmbient(light: number, tint: Rgb, baseTint?: Rgb): void {
    this.ambientLight = light;
    this.ambientTint = tint;
    this.ambientBase = baseTint ?? tint;
  }

  setMapWeather(weather: MapWeatherId): void {
    this.mapWeather = weather;
  }

  setWind(strength: number, dir: Heading, season?: string): void {
    this.wind.set(strength, dir);
    if (season !== undefined) this.season = season;
  }

  setSeaWeather(weather: SeaWeather): void {
    this.seaWeather = weather;
  }

  setPointLights(lights: readonly PointLight[]): void {
    this.pointLights = lights;
  }

  setDynamicLight(active: boolean): void {
    this.dynamicLight = active;
  }

  setVignette(on: boolean): void {
    this.vignetteOn = on;
  }

  setMotion(motion: MapMotion): void {
    this.swayOn = motion.sway;
    this.wavesOn = motion.waves;
    this.waveMix = motion.waveMix;
    this.fluids = motion.fluids;
    this.waves.water = motion.fluids[WATER_FLUID] ?? FLUID_DEFS[WATER_FLUID];
    this.groundBlend?.setWaterStyle(motion.waves);
  }

  setLightVersion(version: number): void {
    this.lightVersion = version;
  }

  setLightBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number } | null): void {
    this.lightBounds = bounds;
  }

  setLightSampler(
    sampler: ((wx: number, wy: number, time: number) => [number, number, number]) | null
  ): void {
    this.lightSampler = sampler;
  }

  setTileSize(w: number, h: number): void {
    const prevCellSize = Math.round(this.tileWidth);
    this.tileWidth = w;
    this.tileHeight = h;
    if (!this.tilesetLoaded && Math.round(w) !== prevCellSize) {
      this.reloadAtlasForCellSize(Math.round(w));
    }
  }

  private atlasReloadPending = false;
  private atlasReloadQueued: number | null = null;

  private async reloadAtlasForCellSize(cellSize: number): Promise<void> {
    if (this.atlasReloadPending) {
      this.atlasReloadQueued = cellSize;
      return;
    }
    this.atlasReloadPending = true;

    try {
      const gpu = this.webglState.getDevice();
      if (!gpu || !this.gridRenderer) return;

      const newAtlas = await createSquareCellAtlas(cellSize, this.debug);

      const newTexture = uploadFontAtlas(gpu, newAtlas);

      if (this.fontTexture) gpu.destroyTexture(this.fontTexture);
      this.fontTexture = newTexture;
      this.fontAtlas = newAtlas;
      this.gridRenderer.setFontAtlas(newAtlas);
    } catch (err) {
      console.warn('Atlas reload failed:', err);
    } finally {
      this.atlasReloadPending = false;
      if (this.atlasReloadQueued !== null) {
        const next = this.atlasReloadQueued;
        this.atlasReloadQueued = null;
        this.reloadAtlasForCellSize(next);
      }
    }
  }

  private async initialize(): Promise<boolean> {
    try {
      return await this.build();
    } catch (error) {
      const noWebgpu = error instanceof MissingWgsl || error instanceof PipelineBuildFailed;
      if (!noWebgpu || !this.webglState.canFallBack) {
        console.error('❌ WebGL init failed:', error);
        if (error instanceof PipelineBuildFailed)
          throw new Error(
            'WebGPU could not build its shaders. Start with ?gpu=webgl2 to draw with WebGL2.'
          );
        throw error;
      }
      console.info(`[gpu] ${error.message}, so the automatic choice falls back to WebGL2`);
      this.forgetPasses();
      this.webglState.fallBackToWebgl2(error.message);
      return this.build();
    }
  }

  private forgetPasses(): void {
    this.shaderManager = null;
    this.tile = null;
    this.textureManager = null;
    this.fontTexture = null;
    this.gridRenderer = null;
    this.painted = null;
    this.groundBlend = null;
    this.lightPass = null;
    this.shadowCast = null;
    this.vignette = null;
    this.groundRings = null;
    this.leaves = null;
    this.tiers = null;
  }

  private async build(): Promise<boolean> {
    if (this.debug) console.log('🔄 Initializing WebGL2 renderer...');

    const gpu = await this.webglState.initialize({
      depth: this.rowDepth,
      stencil: this.rowDepth
    });

    const made = await createTileRendererShaders(
      gpu,
      this.debug,
      PAINTED_TILES,
      this.rowDepth,
      this.webglState.wgslRule
    );
    if (!made) throw new Error('Shader init failed');
    this.shaderManager = made.shaders;
    this.tile = made.tile;

    try {
      this.fontAtlas = await loadBitlandsAtlas(12, 18, this.debug);
      this.tilesetLoaded = true;
    } catch {
      if (this.debug) console.warn('Bitlands atlas unavailable, using canvas atlas');
      this.fontAtlas = await createSquareCellAtlas(this.tileWidth, this.debug);
    }

    this.textureManager = new TextureManager(gpu, this.debug);
    this.fontTexture = this.textureManager.createFontAtlasTexture(this.fontAtlas);
    if (!this.fontTexture) throw new Error('Font texture creation failed');

    this.gridRenderer = made.tile
      ? new GridRenderer(gpu, made.tile, this.fontAtlas, this.debug, this.rowDepth)
      : null;
    if (PAINTED_TILES) this.painted = await loadPaintedTileset(gpu);
    if (GROUND_BLEND && this.painted)
      this.groundBlend = GroundBlend.create(gpu, this.shaderManager, this.painted);
    this.groundBlend?.setWaterStyle(this.wavesOn);
    if (this.gridRenderer) {
      this.gridRenderer.skipBlendedGround = this.groundBlend !== null;
      this.gridRenderer.skipWaterIce = this.groundBlend !== null;
    }
    if (this.gameGrid) this.groundBlend?.setGrid(this.gameGrid);
    this.groundBlend?.setTrees(this.treeGrids());
    this.groundBlend?.setIce(this.snowGrid);
    this.snowVersion++;
    if (PAINTED_LIGHT && this.painted)
      this.lightPass = PaintedLightPass.create(gpu, this.shaderManager);
    if (this.painted) this.shadowCast = PaintedShadowCast.create(gpu, this.shaderManager);
    if (this.lightPass) this.vignette = PaintedVignette.create(gpu, this.shaderManager);
    this.groundRings = GroundRings.create(gpu, this.shaderManager);
    if (this.painted) this.leaves = FallingLeaves.create(gpu, this.shaderManager);
    if (this.painted) this.tiers = Tiers.create(gpu, this.shaderManager, this.painted);
    if (this.gameGrid) this.tiers?.setGrids(this.gameGrid, this.resourceOverlayGrid);

    await gpu.pipelinesReady();
    if (this.debug) console.log('✅ WebGL2 renderer ready');
    return true;
  }

  resize(width: number, height: number): void {
    this.viewport.width = width;
    this.viewport.height = height;
    this.projectionMatrix = createOrthographicMatrix(0, width, height, 0);
    this.webglState.updateViewport(width, height);
  }

  beginFrame(): void {
    this.timer.start();
    this.stats.drawCalls = 0;
    this.stats.vertexCount = 0;
    this.stats.resourceRebuilds = 0;
    this.gridRenderer?.beginFrame();
  }

  private render(): boolean {
    const gpu = this.webglState.getDevice();
    const tile = this.tile;
    const grid = this.gridRenderer;
    if (!gpu || !this.fontTexture || !this.gameGrid) return false;

    const viewportTilesW = Math.ceil(this.viewport.width / this.tileWidth);
    const viewportTilesH = Math.ceil(this.viewport.height / this.tileHeight);
    const lightFrame =
      this.lightPass && this.painted
        ? this.lightFrame(this.painted.tileset.tile, viewportTilesW, viewportTilesH)
        : null;
    const frame = frameBindings(gpu);
    frame.view.set('u_projection', this.projectionMatrix);
    frame.view.set('u_canvas', [this.viewport.width, this.viewport.height]);
    frame.view.set('u_viewOffset', [this.viewTileX * BASE_TILE_PX, this.viewTileY * BASE_TILE_PX]);
    frame.view.set('u_zoom', [this.tileWidth / BASE_TILE_PX, this.tileHeight / BASE_TILE_PX]);
    frame.view.upload(gpu.queue, frame.buffer);
    const overlays =
      this.overlayGrid ||
      this.itemOverlayGrid ||
      this.buildingOverlayGrid ||
      this.resourceOverlayGrid ||
      this.resourceTallOverlayGrid ||
      this.snowGrid;
    this.groundRings?.prepare(overlays ? this.rings : null);
    if (overlays && this.rowDepth) this.prepareShadowCast(viewportTilesW, viewportTilesH);
    if (this.lightPass && lightFrame) this.lightPass.prepare(lightFrame);
    const windSecs = this.wind.tick(performance.now());
    this.tiers?.sync();
    if (overlays && ROCK_TIERS && this.rowDepth)
      this.prepareTiers(gpu, viewportTilesW, viewportTilesH, lightFrame);
    if (overlays) this.prepareLeaves(gpu, windSecs, viewportTilesW, viewportTilesH, lightFrame);
    const vignette = this.vignetteOn && lightFrame ? this.vignette : null;
    if (vignette && lightFrame)
      vignette.prepare({ strength: lightFrame.grade.vignette, tilePx: this.tileWidth });
    const unlit = lightFrame !== null;
    const flickerTime = performance.now() / 1000;
    const flicker = unlit ? 0 : this.dynamicLight ? fireFlickerGlobal(flickerTime) : 1.0;
    const lightTime = performance.now() / 1000;
    if (this.groundBlend)
      this.prepareGroundBlend(
        this.groundBlend,
        flicker,
        lightTime,
        [lightFrame?.grade.saturation ?? 1, lightFrame?.grade.brightness ?? 1],
        this.lightField(gpu, lightFrame)
      );
    if (tile) this.prepareTile(gpu, tile, lightFrame, flicker, viewportTilesW, viewportTilesH);

    const tTerrain = performance.now();
    const terrain = grid && passOn('terrain')
      ? this.prepareGrid(grid, this.gameGrid, viewportTilesW, viewportTilesH, lightTime, {
          pointLightActive: this.dynamicLight,
          lightVersion: this.lightVersion,
          cacheVersion: this.gridVersion
        })
      : null;
    this.stats.terrainRebuilds = grid && terrain ? grid.chunksRebuiltLastRender : 0;
    const terrainPrepareMs = performance.now() - tTerrain;

    const tOverlay = performance.now();
    const overlaySteps = overlays
      ? this.prepareOverlays(grid, viewportTilesW, viewportTilesH, lightTime)
      : [];
    const overlayPrepareMs = performance.now() - tOverlay;

    const encoder = gpu.createCommandEncoder();
    if (this.lightPass && lightFrame) this.stats.drawCalls += this.lightPass.encode(encoder);
    const pass = encoder.beginRenderPass(this.webglState.canvasPass(gpu));
    pass.setBindGroup(FRAME_GROUP, frame.group);
    pass.setStencilReference(TREE_GROUND_STENCIL);

    const tTerrainEncode = performance.now();
    if (this.groundBlend?.encode(pass)) {
      this.stats.drawCalls++;
      this.stats.vertexCount += 6;
    }
    if (grid && terrain) grid.encodeGrid(pass, terrain);
    this.stats.terrainMs = terrainPrepareMs + performance.now() - tTerrainEncode;

    if (overlays) {
      const tOverlayEncode = performance.now();
      for (const step of overlaySteps) this.stats.drawCalls += step(pass);
      this.stats.overlayMs = overlayPrepareMs + performance.now() - tOverlayEncode;
    } else {
      this.stats.overlayMs = 0;
    }
    if (vignette) this.stats.drawCalls += vignette.encode(pass);
    pass.end();
    gpu.queue.submit([encoder.finish()]);
    return true;
  }

  private prepareOverlays(
    grid: GridRenderer | null,
    viewportTilesW: number,
    viewportTilesH: number,
    lightTime: number
  ): ((pass: GpuRenderPass) => number)[] {
    const steps: ((pass: GpuRenderPass) => number)[] = [];
    const drawGrid = (draw: GridDraw) =>
      steps.push((pass) => {
        grid?.encodeGrid(pass, draw);
        return 0;
      });
    const snowOn = grid !== null && this.snowGrid !== null && passOn('snow');
    if (grid && snowOn)
      drawGrid(this.prepareSnow(grid, viewportTilesW, viewportTilesH, lightTime, 'wash'));
    const trees = this.prepareTreeGround(grid, viewportTilesW, viewportTilesH, lightTime);
    if (trees) steps.push(trees);
    const shadowCast = this.shadowCast;
    if (this.rowDepth && shadowCast) steps.push((pass) => shadowCast.encode(pass));
    const rings = this.groundRings;
    if (rings) steps.push((pass) => rings.encode(pass));
    for (const layer of SPRITE_LAYERS) {
      if (!passOn(LAYER_PASS[layer])) continue;
      const sprites = this.spriteGrid(layer);
      if (grid && sprites)
        drawGrid(
          this.prepareSprites(
            grid,
            sprites,
            viewportTilesW,
            viewportTilesH,
            lightTime,
            CHUNKED[layer]
          )
        );
      if (grid && layer === 'resource' && snowOn)
        drawGrid(this.prepareSnow(grid, viewportTilesW, viewportTilesH, lightTime, 'overlay'));
      const tiers = this.tiers;
      if (layer === 'resource' && ROCK_TIERS && this.rowDepth && tiers)
        steps.push((pass) => tiers.encode(pass));
    }
    const leaves = this.leaves;
    if (leaves) steps.push((pass) => leaves.encode(pass));
    return steps;
  }

  private prepareGrid(
    grid: GridRenderer,
    of: GameGrid,
    viewportTilesW: number,
    viewportTilesH: number,
    lightTime: number,
    options: Partial<GridRenderOptions>
  ): GridDraw {
    const draw = grid.prepareGrid(of, {
      tileWidth: BASE_TILE_PX,
      tileHeight: BASE_TILE_PX,
      viewportX: this.viewTileX,
      viewportY: this.viewTileY,
      viewportWidth: viewportTilesW,
      viewportHeight: viewportTilesH,
      lightSampler: this.lightSampler ?? undefined,
      lightTime,
      litBounds: this.lightBounds,
      ...options
    });
    this.stats.drawCalls++;
    this.stats.vertexCount += grid.getStats().tilesRendered * 6;
    return draw;
  }

  private prepareTile(
    gpu: GpuDevice,
    tile: TileShading,
    lightFrame: LightPassFrame | null,
    flicker: number,
    viewportTilesW: number,
    viewportTilesH: number
  ): void {
    tile.set(
      'u_ambient',
      lightFrame
        ? lightFrame.grade.ambient
        : [
            this.ambientLight * this.ambientTint[0],
            this.ambientLight * this.ambientTint[1],
            this.ambientLight * this.ambientTint[2]
          ]
    );
    tile.set('u_lightFlicker', flicker);
    tile.set('u_fieldLit', lightFrame ? 1 : 0);
    tile.set('u_saturation', lightFrame?.grade.saturation ?? 1);
    tile.set('u_brightness', lightFrame?.grade.brightness ?? 1);
    if (this.fontAtlas)
      tile.set('u_texelSize', [1 / this.fontAtlas.atlasWidth, 1 / this.fontAtlas.atlasHeight]);
    if (this.rowDepth) {
      tile.set('u_rowDepth', 1 / ROW_DEPTH_RANGE);
      tile.set('u_alphaCut', ALPHA_CUT);
    }
    const painted = this.painted;
    if (painted) {
      const artTile = painted.tileset.tile;
      const wind = this.wind.uniforms(artTile, BASE_TILE_PX / artTile);
      if (!this.swayOn) wind.u_wind[0] = 0;
      for (const [name, value] of Object.entries(wind)) tile.set(name, value);
      this.setPaintedAtlas(tile, painted);
    }
    this.setCutaway(tile, viewportTilesW, viewportTilesH);
    tile.setTextures({
      u_fontAtlas: this.fontTexture,
      u_paintAtlas: painted?.texture ?? null,
      u_lightAtlas: painted?.light ?? null,
      u_lightTexture: this.lightField(gpu, lightFrame),
      u_rockTexture: painted?.top?.texture ?? null,
      u_veinTexture: painted?.top?.veins ?? null,
      u_tierTileTexture: this.tiers?.tileTexture ?? null,
      u_tierNoiseTexture: this.tiers?.noiseTexture ?? null
    });
    tile.upload();
  }

  private clearCanvas(): void {
    const gpu = this.webglState.getDevice();
    if (!gpu) return;
    const encoder = gpu.createCommandEncoder();
    encoder.beginRenderPass(this.webglState.canvasPass(gpu)).end();
    gpu.queue.submit([encoder.finish()]);
  }

  private prepareTiers(
    gpu: GpuDevice,
    viewportTilesW: number,
    viewportTilesH: number,
    lightFrame: LightPassFrame | null
  ): void {
    if (!this.tiers || !this.painted) return;
    const art = this.painted.tileset.tile;
    this.tiers.prepare(
      {
        view: {
          x0: this.viewTileX * art,
          y0: this.viewTileY * art,
          x1: (this.viewTileX + viewportTilesW + 1) * art,
          y1: (this.viewTileY + viewportTilesH + 1) * art
        },
        ambient: lightFrame
          ? lightFrame.grade.ambient
          : [
              this.ambientLight * this.ambientTint[0],
              this.ambientLight * this.ambientTint[1],
              this.ambientLight * this.ambientTint[2]
            ],
        fieldLit: lightFrame !== null,
        tone: [lightFrame?.grade.saturation ?? 1, lightFrame?.grade.brightness ?? 1],
        rowPx: art,
        rowDepth: 1 / ROW_DEPTH_RANGE,
        snow: this.season === WINTER
      },
      this.lightField(gpu, lightFrame)
    );
  }

  private lightFrame(
    artTile: number,
    viewportTilesW: number,
    viewportTilesH: number
  ): LightPassFrame {
    const view = { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH };
    return {
      canvas: [this.viewport.width, this.viewport.height],
      artPerBase: artTile / BASE_TILE_PX,
      artTile,
      view,
      grade: gradeForHour(this.ambientLight, this.ambientBase, MAP_WEATHER[this.mapWeather]),
      lights: this.spriteLights(view),
      time: performance.now() / 1000
    };
  }

  private spriteLights(view: TileRect): PointLight[] {
    return resolveSpriteLights(
      this.pointLights,
      [this.buildingOverlayGrid, this.resourceOverlayGrid, this.resourceTallOverlayGrid],
      view
    );
  }

  private readonly cuts = new Float32Array(CUT_MAX * 4);

  private setCutaway(tile: TileShading, viewportTilesW: number, viewportTilesH: number): void {
    const n = this.painted
      ? cutPoints(
          this.overlayGrid,
          { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH },
          this.painted.tileset.tile,
          this.cuts
        )
      : 0;
    if (n > 0) tile.set('u_cut', this.cuts);
    tile.set('u_cuts', n);
  }

  private fxTree = (x: number, y: number) => {
    for (const grid of [this.resourceTallOverlayGrid, this.resourceOverlayGrid]) {
      const s = grid?.getTile(x, y)?.painted;
      if (s?.fx) return s as PaintedSprite & { fx: TreeFx };
    }
    return undefined;
  };

  private leafTree = (x: number, y: number) => {
    for (const grid of [this.resourceTallOverlayGrid, this.resourceOverlayGrid]) {
      const s = grid?.getTile(x, y)?.painted;
      if (s?.leafy) return s;
    }
    return undefined;
  };

  private prepareLeaves(
    gpu: GpuDevice,
    secs: number,
    viewportTilesW: number,
    viewportTilesH: number,
    lightFrame: LightPassFrame | null
  ): void {
    if (!this.leaves || !this.painted || !this.shaderManager) return;
    const artTile = this.painted.tileset.tile;
    this.leaves.prepare(
      secs,
      this.wind,
      {
        basePerArt: BASE_TILE_PX / artTile,
        artTile,
        view: {
          x: Math.floor(this.viewTileX),
          y: Math.floor(this.viewTileY),
          w: viewportTilesW + 1,
          h: viewportTilesH + 1
        },
        season: this.season,
        treeAt: this.leafTree,
        fxAt: this.fxTree,
        texels: this.painted.texels(),
        light: {
          fieldLit: lightFrame !== null,
          ambient: lightFrame
            ? lightFrame.grade.ambient
            : [
                this.ambientLight * this.ambientTint[0],
                this.ambientLight * this.ambientTint[1],
                this.ambientLight * this.ambientTint[2]
              ],
          tone: [lightFrame?.grade.saturation ?? 1, lightFrame?.grade.brightness ?? 1]
        }
      },
      { atlas: this.painted.texture, light: this.lightField(gpu, lightFrame) }
    );
  }

  private lightField(gpu: GpuDevice, lightFrame: LightPassFrame | null): GpuTexture {
    return this.lightPass && lightFrame ? this.lightPass.fieldTexture : blankTexture(gpu);
  }

  private prepareShadowCast(viewportTilesW: number, viewportTilesH: number): void {
    if (!this.shadowCast || !this.painted) return;
    const artTile = this.painted.tileset.tile;
    this.shadowCast.prepare({
      canvas: [this.viewport.width, this.viewport.height],
      artPerBase: artTile / BASE_TILE_PX,
      artTile,
      view: { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH },
      casters: [this.resourceOverlayGrid, this.buildingOverlayGrid]
    });
  }

  private prepareTreeGround(
    grid: GridRenderer | null,
    viewportTilesW: number,
    viewportTilesH: number,
    lightTime: number
  ): ((pass: GpuRenderPass) => number) | null {
    const blend = this.groundBlend;
    if (!blend?.trees || !passOn('terrain')) return null;
    if (!grid) return (pass) => (blend.encodeWinterTrees(pass) ? 1 : 0);
    const view = { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH };
    const touched = blend.trees.dressAround(view, DRESS_BUDGET_MS);
    if (touched.length > 0) grid.markDecorChunksDirty(touched);
    const decor = this.prepareGrid(
      grid,
      blend.trees.decor,
      viewportTilesW,
      viewportTilesH,
      lightTime,
      {
        pointLightActive: this.dynamicLight,
        lightVersion: this.lightVersion,
        cacheVersion: this.gridVersion,
        chunkLayer: 'decor',
        pipeline: 'marking',
        slice: 'overlay'
      }
    );
    return (pass) => {
      const winter = blend.encodeWinterTrees(pass);
      if (winter) this.stats.vertexCount += 6;
      grid.encodeGrid(pass, decor);
      return winter ? 1 : 0;
    };
  }

  private prepareGroundBlend(
    blend: GroundBlend,
    flicker: number,
    lightTime: number,
    tone: [number, number],
    lightField: GpuTexture
  ): void {
    blend.prepare({
      zoom: [this.tileWidth / BASE_TILE_PX, this.tileHeight / BASE_TILE_PX],
      ambient: this.lightPass
        ? [1, 1, 1]
        : [
            this.ambientLight * this.ambientTint[0],
            this.ambientLight * this.ambientTint[1],
            this.ambientLight * this.ambientTint[2]
          ],
      flicker,
      fieldLit: this.lightPass !== null,
      tone,
      waterTime: waterTime(performance.now()),
      sea: this.wavesOn ? this.seaFrame() : undefined,
      fluid: this.fluidFrame(),
      lightSampler: this.lightSampler ?? undefined,
      lightTime,
      lightVersion: this.lightVersion,
      litBounds: this.lightBounds,
      lightField
    });
  }

  private seaFrame(): Float32Array {
    const { strength, dir } = this.wind;
    this.waves.tick(performance.now(), strength, dir, waterStill(this.tileWidth));
    const artPerPx = (this.painted?.tileset.tile ?? BASE_TILE_PX) / this.tileWidth;
    return this.waves.uniforms(strength, dir, artPerPx, this.waveMix, this.seaWeather);
  }

  private fluidFrame(): Float32Array {
    const { strength, dir } = this.wind;
    const hold = !this.wavesOn || waterStill(this.tileWidth);
    this.fluidClock.tick(performance.now(), this.fluids, strength, dir, hold);
    return this.fluidClock.uniforms(this.fluids);
  }

  private setPaintedAtlas(tile: TileShading, painted: LoadedPaintedTileset): void {
    tile.set('u_atlasScale', painted.tileset.tile / BASE_TILE_PX);
    tile.set('u_paintTexelSize', [1 / painted.tileset.atlasW, 1 / painted.tileset.atlasH]);
    tile.set('u_shade', SHADOW_SHADE);
    tile.set('u_shadowDepth', SHADOW_DEPTH);
    tile.set('u_snow', this.season === WINTER ? 1 : 0);
    if (!painted.top) return;
    tile.set('u_snowRamp', [painted.top.snow.x, painted.top.snow.y]);
    tile.set('u_rowPx', this.rowDepth ? painted.tileset.tile : 0);
    tile.set('u_rockRamp', [painted.top.ramp.x, painted.top.ramp.y]);
    tile.set('u_rockLift', painted.top.lift);
  }

  private prepareSnow(
    grid: GridRenderer,
    viewportTilesW: number,
    viewportTilesH: number,
    lightTime: number,
    slice: 'wash' | 'overlay'
  ): GridDraw {
    const rowPasses = slice === 'overlay' && this.rowDepth;
    return this.prepareGrid(
      grid,
      this.snowGrid as GameGrid,
      viewportTilesW,
      viewportTilesH,
      lightTime,
      {
        pointLightActive: this.dynamicLight,
        lightVersion: this.lightVersion,
        cacheVersion: this.snowVersion,
        chunkLayer: 'snow',
        rowPasses,
        pipeline: rowPasses ? 'masked' : 'flat',
        slice
      }
    );
  }

  private prepareSprites(
    grid: GridRenderer,
    sprites: GameGrid,
    viewportTilesW: number,
    viewportTilesH: number,
    lightTime: number,
    chunkLayer?: 'resource' | 'resourceTall'
  ): GridDraw {
    const draw = this.prepareGrid(grid, sprites, viewportTilesW, viewportTilesH, lightTime, {
      renderAllTiles: chunkLayer === undefined,
      rowPasses: this.rowDepth,
      pipeline: 'overlay',
      slice: 'overlay',
      ...(chunkLayer
        ? { chunkLayer, cacheVersion: this.gridVersion, lightVersion: this.lightVersion }
        : {})
    });
    if (chunkLayer) this.stats.resourceRebuilds += grid.chunksRebuiltLastRender;
    return draw;
  }

  endFrame(): void {
    if (!passOn('gl') || !this.render()) this.clearCanvas();
    this.stats.frameTime = this.timer.end();
    this.stats.fps = this.timer.updateFPS();
    if (WORK_PINS) addFrameTotals(this.stats);
  }

  getStats(): RenderStats {
    return { ...this.stats };
  }
  getDevice(): GpuDevice | null {
    return this.webglState.getDevice();
  }
  getProjectionMatrix(): Float32Array {
    return this.projectionMatrix;
  }
  getShaderManager(): ShaderManager | null {
    return this.shaderManager;
  }
  getGridRenderer(): GridRenderer | null {
    return this.gridRenderer;
  }
  getFontAtlas(): FontAtlas | null {
    return this.fontAtlas;
  }

  isReady(): boolean {
    return this.webglState.isReady() && this.shaderManager !== null;
  }

  dispose(): void {
    this.gridRenderer?.dispose();
    this.tile?.dispose();
    this.tile = null;
    this.shaderManager?.dispose();
    this.textureManager?.dispose();
    this.groundBlend?.dispose();
    this.groundBlend = null;
    this.lightPass?.dispose();
    this.lightPass = null;
    this.shadowCast?.dispose();
    this.shadowCast = null;
    this.vignette?.dispose();
    this.vignette = null;
    this.groundRings?.dispose();
    this.groundRings = null;
    this.leaves?.dispose();
    this.leaves = null;
    this.tiers?.dispose();
    this.tiers = null;
    if (this.painted) this.webglState.getDevice()?.destroyTexture(this.painted.texture);
    if (this.painted) this.webglState.getDevice()?.destroyTexture(this.painted.light);
    if (this.painted?.top) this.webglState.getDevice()?.destroyTexture(this.painted.top.texture);
    if (this.painted?.top) this.webglState.getDevice()?.destroyTexture(this.painted.top.veins);
    this.painted = null;
    this.webglState.dispose();
    this.gridRenderer = null;
    this.shaderManager = null;
    this.textureManager = null;
    this.fontAtlas = null;
    this.fontTexture = null;
    this.gameGrid = null;
  }
}

function fireFlickerGlobal(time: number): number {
  const n = Math.sin(time * 6.0) * 0.5 + Math.sin(time * 11.3) * 0.5;
  return 0.85 + 0.15 * (0.5 + 0.5 * n);
}
