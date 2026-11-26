import { createOrthographicMatrix, PerformanceTimer } from './utils.js';
import { ShaderManager, createTileRendererShaders } from './shaders.js';
import { createSquareCellAtlas, loadBitlandsAtlas } from './font-atlas.js';
import { TextureManager, uploadFontAtlas } from './texture-manager.js';
import { samplersOf } from './samplers.js';
import { ALPHA_CUT, GridRenderer } from './grid-renderer.js';
import { WebGLStateManager } from './webgl-state.js';
import type { GameGrid } from './game-grid.js';
import type { GpuDevice, GpuTexture } from '../gpu/device.js';
import type { FontAtlas } from './types.js';
import { BASE_TILE_PX } from './tile-types.js';
import { WORK_PINS } from '../workPins/flag.js';
import { addFrameTotals } from '../workPins/page.js';
import { GROUND_BLEND, PAINTED_LIGHT, PAINTED_TILES, ROCK_TIERS } from './painted/flag.js';
import { passOn } from './passes.js';
import { loadPaintedTileset, type LoadedPaintedTileset } from './painted/loader.js';
import { GroundBlend, waterTime, type GroundBlendFrame } from './painted/groundBlend.js';
import { LIGHT_FIELD_UNIT, PaintedLightPass, type LightPassFrame } from './painted/lightPass.js';
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
import { PaintedShadowCast, SHADOW_DEPTH, SHADOW_SHADE } from './painted/shadowCast.js';
import { GroundRings, type GroundRing, type RingInk } from './groundRings.js';
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
import { CUT_MAX, CUT_UNIFORM, cutPoints } from './painted/cutaway.js';
import { TIER_NOISE_UNIT, TIER_TILE_UNIT, Tiers } from './painted/tiers.js';

const LIGHT_ATLAS_UNIT = 7;
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
  private rings: { list: readonly GroundRing[]; ink: RingInk } | null = null;
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
      debug: this.debug
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
      if (this.debug) console.log('🔄 Initializing WebGL2 renderer...');

      const gpu = await this.webglState.initialize({
        depth: this.rowDepth,
        stencil: this.rowDepth
      });

      this.shaderManager = await createTileRendererShaders(gpu, this.debug, PAINTED_TILES);
      if (!this.shaderManager) throw new Error('Shader init failed');

      try {
        this.fontAtlas = await loadBitlandsAtlas(12, 18, this.debug);
        this.tilesetLoaded = true;
      } catch {
        if (this.debug) console.warn('Bitlands atlas unavailable, using canvas atlas');
        this.fontAtlas = await createSquareCellAtlas(this.tileWidth, this.debug);
      }

      this.textureManager = new TextureManager(gpu, this.debug);
      this.fontTexture = this.textureManager.createFontAtlasTexture(this.fontAtlas);
      const { nearest } = samplersOf(gpu);
      for (const unit of [0, 1, LIGHT_ATLAS_UNIT]) gpu.bindSampler(unit, nearest);
      if (!this.fontTexture) throw new Error('Font texture creation failed');

      this.gridRenderer = new GridRenderer(
        gpu,
        this.shaderManager,
        this.fontAtlas,
        this.debug,
        this.rowDepth
      );
      if (PAINTED_TILES) this.painted = await loadPaintedTileset(gpu);
      if (GROUND_BLEND && this.painted)
        this.groundBlend = GroundBlend.create(gpu, this.shaderManager, this.painted);
      this.groundBlend?.setWaterStyle(this.wavesOn);
      this.gridRenderer.skipBlendedGround = this.groundBlend !== null;
      this.gridRenderer.skipWaterIce = this.groundBlend !== null;
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

      if (this.debug) console.log('✅ WebGL2 renderer ready');
      return true;
    } catch (error) {
      console.error('❌ WebGL init failed:', error);
      throw error;
    }
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
    this.webglState.clear(this.rowDepth);
  }

  private render(): void {
    const gpu = this.webglState.getDevice();
    if (!gpu || !this.shaderManager || !this.gridRenderer || !this.fontTexture || !this.gameGrid) {
      return;
    }

    const viewportTilesW = Math.ceil(this.viewport.width / this.tileWidth);
    const viewportTilesH = Math.ceil(this.viewport.height / this.tileHeight);
    const lightFrame =
      this.lightPass && this.painted
        ? this.lightFrame(this.painted.tileset.tile, viewportTilesW, viewportTilesH)
        : null;
    if (this.lightPass && lightFrame) this.stats.drawCalls += this.lightPass.drawField(lightFrame);

    if (!this.shaderManager.useProgram('tileRenderer')) return;
    this.shaderManager.setUniform('tileRenderer', 'u_projection', this.projectionMatrix);

    this.shaderManager.setUniform('tileRenderer', 'u_viewOffset', [
      this.viewTileX * BASE_TILE_PX,
      this.viewTileY * BASE_TILE_PX
    ]);
    this.shaderManager.setUniform('tileRenderer', 'u_zoom', [
      this.tileWidth / BASE_TILE_PX,
      this.tileHeight / BASE_TILE_PX
    ]);
    const unlit = lightFrame !== null;
    this.shaderManager.setUniform(
      'tileRenderer',
      'u_ambient',
      lightFrame
        ? lightFrame.grade.ambient
        : [
            this.ambientLight * this.ambientTint[0],
            this.ambientLight * this.ambientTint[1],
            this.ambientLight * this.ambientTint[2]
          ]
    );
    const flickerTime = performance.now() / 1000;
    const flicker = unlit ? 0 : this.dynamicLight ? fireFlickerGlobal(flickerTime) : 1.0;
    this.shaderManager.setUniform('tileRenderer', 'u_lightFlicker', flicker);
    this.shaderManager.setUniform('tileRenderer', 'u_fieldLit', unlit ? 1 : 0);
    this.shaderManager.setUniform(
      'tileRenderer',
      'u_saturation',
      lightFrame?.grade.saturation ?? 1
    );
    this.shaderManager.setUniform(
      'tileRenderer',
      'u_brightness',
      lightFrame?.grade.brightness ?? 1
    );
    if (unlit) this.shaderManager.setUniform('tileRenderer', 'u_lightTexture', LIGHT_FIELD_UNIT);
    const windSecs = this.wind.tick(performance.now());
    if (this.painted) {
      const artTile = this.painted.tileset.tile;
      const wind = this.wind.uniforms(artTile, BASE_TILE_PX / artTile);
      if (!this.swayOn) wind.u_wind[0] = 0;
      for (const [name, value] of Object.entries(wind))
        this.shaderManager.setUniform('tileRenderer', name, value);
    }

    gpu.setTextureSlot(0);
    gpu.bindTexture(this.fontTexture);
    this.shaderManager.setUniform('tileRenderer', 'u_fontAtlas', 0);
    if (this.fontAtlas) {
      this.shaderManager.setUniform('tileRenderer', 'u_texelSize', [
        1 / this.fontAtlas.atlasWidth,
        1 / this.fontAtlas.atlasHeight
      ]);
    }
    this.tiers?.sync();
    if (this.painted) this.bindPaintedAtlas(gpu, this.painted);
    if (this.rowDepth) {
      this.shaderManager.setUniform('tileRenderer', 'u_rowDepth', 1 / ROW_DEPTH_RANGE);
      this.shaderManager.setUniform('tileRenderer', 'u_alphaCut', ALPHA_CUT);
    }

    const lightTime = performance.now() / 1000;

    this.shaderManager.setUniform('tileRenderer', 'u_glyphOnly', 0);
    const tTerrain = performance.now();
    if (this.groundBlend)
      this.drawGroundBlend(this.groundBlend, flicker, lightTime, [
        lightFrame?.grade.saturation ?? 1,
        lightFrame?.grade.brightness ?? 1
      ]);
    this.tiers?.bindShared();
    const gridStats = passOn('terrain')
      ? this.gridRenderer.renderGrid(this.gameGrid, {
          tileWidth: BASE_TILE_PX,
          tileHeight: BASE_TILE_PX,
          viewportX: this.viewTileX,
          viewportY: this.viewTileY,
          viewportWidth: viewportTilesW,
          viewportHeight: viewportTilesH,
          lightSampler: this.lightSampler ?? undefined,
          lightTime,
          pointLightActive: this.dynamicLight,
          lightVersion: this.lightVersion,
          litBounds: this.lightBounds,
          cacheVersion: this.gridVersion
        })
      : { tilesRendered: 0 };
    this.stats.terrainMs = performance.now() - tTerrain;
    this.stats.terrainRebuilds = this.gridRenderer.chunksRebuiltLastRender;
    this.stats.drawCalls++;
    this.stats.vertexCount += gridStats.tilesRendered * 6;

    if (
      this.overlayGrid ||
      this.itemOverlayGrid ||
      this.buildingOverlayGrid ||
      this.resourceOverlayGrid ||
      this.resourceTallOverlayGrid ||
      this.snowGrid
    ) {
      gpu.setBlending(true);
      gpu.setBlendFunc('src-alpha', 'one-minus-src-alpha');
      this.shaderManager.setUniform('tileRenderer', 'u_glyphOnly', 1);
      const tOverlay = performance.now();
      if (this.snowGrid && passOn('snow')) {
        this.shaderManager.setUniform('tileRenderer', 'u_bgOnly', 1);
        this.drawSnowGrid(viewportTilesW, viewportTilesH, lightTime);
        this.shaderManager.setUniform('tileRenderer', 'u_bgOnly', 0);
      }
      this.drawTreeGround(gpu, flicker, lightTime, lightFrame, viewportTilesW, viewportTilesH);
      if (this.rowDepth) {
        gpu.setDepthTest(true);
        gpu.setDepthCompare('less-equal');
        this.drawShadowCast(gpu, viewportTilesW, viewportTilesH);
      }
      this.drawGroundRings();
      this.setCutaway(viewportTilesW, viewportTilesH);
      for (const layer of SPRITE_LAYERS) {
        if (!passOn(LAYER_PASS[layer])) continue;
        const chunk = CHUNKED[layer];
        this.renderGlyphOverlay(
          this.spriteGrid(layer),
          viewportTilesW,
          viewportTilesH,
          lightTime,
          chunk !== undefined,
          chunk
        );
        if (layer === 'resource' && this.snowGrid && passOn('snow'))
          this.drawSnowPieces(gpu, viewportTilesW, viewportTilesH, lightTime);
        if (layer === 'resource' && ROCK_TIERS && this.rowDepth)
          this.drawTiers(gpu, viewportTilesW, viewportTilesH, lightFrame);
      }
      this.drawLeaves(windSecs, viewportTilesW, viewportTilesH, lightFrame);
      this.stats.overlayMs = performance.now() - tOverlay;
      this.shaderManager.setUniform('tileRenderer', 'u_glyphOnly', 0);
      if (this.rowDepth) gpu.setDepthTest(false);
      gpu.setBlending(false);
    } else {
      this.stats.overlayMs = 0;
    }
    if (this.vignette && lightFrame && this.vignetteOn)
      this.stats.drawCalls += this.vignette.draw({
        canvas: [this.viewport.width, this.viewport.height],
        strength: lightFrame.grade.vignette,
        tilePx: this.tileWidth
      });
  }

  private drawTiers(
    gpu: GpuDevice,
    viewportTilesW: number,
    viewportTilesH: number,
    lightFrame: LightPassFrame | null
  ): void {
    if (!this.tiers || !this.painted || !this.shaderManager || !this.fontTexture) return;
    const art = this.painted.tileset.tile;
    this.stats.drawCalls += this.tiers.draw({
      view: {
        x0: this.viewTileX * art,
        y0: this.viewTileY * art,
        x1: (this.viewTileX + viewportTilesW + 1) * art,
        y1: (this.viewTileY + viewportTilesH + 1) * art
      },
      projection: this.projectionMatrix,
      viewOffset: [this.viewTileX * BASE_TILE_PX, this.viewTileY * BASE_TILE_PX],
      zoom: [this.tileWidth / BASE_TILE_PX, this.tileHeight / BASE_TILE_PX],
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
    });
    this.shaderManager.useProgram('tileRenderer');
    gpu.setTextureSlot(0);
    gpu.bindTexture(this.fontTexture);
  }

  private lightFrame(
    artTile: number,
    viewportTilesW: number,
    viewportTilesH: number
  ): LightPassFrame {
    const view = { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH };
    return {
      canvas: [this.viewport.width, this.viewport.height],
      viewOffset: [this.viewTileX * BASE_TILE_PX, this.viewTileY * BASE_TILE_PX],
      zoom: [this.tileWidth / BASE_TILE_PX, this.tileHeight / BASE_TILE_PX],
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

  private setCutaway(viewportTilesW: number, viewportTilesH: number): void {
    if (!this.shaderManager) return;
    const n = this.painted
      ? cutPoints(
          this.overlayGrid,
          { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH },
          this.painted.tileset.tile,
          this.cuts
        )
      : 0;
    if (n > 0) this.shaderManager.setUniformVec4s('tileRenderer', CUT_UNIFORM, this.cuts);
    this.shaderManager.setUniform('tileRenderer', 'u_cuts', n);
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

  private drawLeaves(
    secs: number,
    viewportTilesW: number,
    viewportTilesH: number,
    lightFrame: LightPassFrame | null
  ): void {
    if (!this.leaves || !this.painted || !this.shaderManager) return;
    const artTile = this.painted.tileset.tile;
    this.stats.drawCalls += this.leaves.draw(
      secs,
      this.wind,
      {
        canvas: [this.viewport.width, this.viewport.height],
        viewOffset: [this.viewTileX * BASE_TILE_PX, this.viewTileY * BASE_TILE_PX],
        zoom: [this.tileWidth / BASE_TILE_PX, this.tileHeight / BASE_TILE_PX],
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
      { atlas: 1, light: LIGHT_FIELD_UNIT }
    );
    this.shaderManager.useProgram('tileRenderer');
  }

  private drawGroundRings(): void {
    if (!this.groundRings || !this.rings || !this.shaderManager) return;
    const { list, ink } = this.rings;
    this.stats.drawCalls += this.groundRings.draw(list, ink, [
      this.viewport.width,
      this.viewport.height
    ]);
    this.shaderManager.useProgram('tileRenderer');
  }

  private drawShadowCast(gpu: GpuDevice, viewportTilesW: number, viewportTilesH: number): void {
    if (!this.shadowCast || !this.painted || !this.shaderManager) return;
    const artTile = this.painted.tileset.tile;
    gpu.setDepthCompare('less');
    gpu.setBlendFunc('zero', 'src');
    this.stats.drawCalls += this.shadowCast.draw({
      canvas: [this.viewport.width, this.viewport.height],
      viewOffset: [this.viewTileX * BASE_TILE_PX, this.viewTileY * BASE_TILE_PX],
      zoom: [this.tileWidth / BASE_TILE_PX, this.tileHeight / BASE_TILE_PX],
      artPerBase: artTile / BASE_TILE_PX,
      artTile,
      view: { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH },
      casters: [this.resourceOverlayGrid, this.buildingOverlayGrid]
    });
    gpu.setBlendFunc('src-alpha', 'one-minus-src-alpha');
    gpu.setDepthCompare('less-equal');
    this.shaderManager.useProgram('tileRenderer');
  }

  private drawTreeGround(
    gpu: GpuDevice,
    flicker: number,
    lightTime: number,
    lightFrame: LightPassFrame | null,
    viewportTilesW: number,
    viewportTilesH: number
  ): void {
    const blend = this.groundBlend;
    if (!blend?.trees || !this.gridRenderer || !this.shaderManager || !passOn('terrain')) return;
    const tone: [number, number] = [
      lightFrame?.grade.saturation ?? 1,
      lightFrame?.grade.brightness ?? 1
    ];
    gpu.setStencil({ compare: 'always', reference: TREE_GROUND_STENCIL, write: true });
    if (this.drawGroundBlend(blend, flicker, lightTime, tone, true)) {
      this.tiers?.bindShared();
      this.shaderManager.useProgram('tileRenderer');
      gpu.setTextureSlot(0);
      gpu.bindTexture(this.fontTexture);
    }
    const view = { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH };
    const touched = blend.trees.dressAround(view, DRESS_BUDGET_MS);
    if (touched.length > 0) this.gridRenderer.markDecorChunksDirty(touched);
    const s = this.gridRenderer.renderGrid(blend.trees.decor, {
      tileWidth: BASE_TILE_PX,
      tileHeight: BASE_TILE_PX,
      viewportX: this.viewTileX,
      viewportY: this.viewTileY,
      viewportWidth: viewportTilesW,
      viewportHeight: viewportTilesH,
      lightSampler: this.lightSampler ?? undefined,
      lightTime,
      pointLightActive: this.dynamicLight,
      lightVersion: this.lightVersion,
      litBounds: this.lightBounds,
      cacheVersion: this.gridVersion,
      chunkLayer: 'decor'
    });
    gpu.setStencil(null);
    this.stats.drawCalls++;
    this.stats.vertexCount += s.tilesRendered * 6;
  }

  private drawGroundBlend(
    blend: GroundBlend,
    flicker: number,
    lightTime: number,
    tone: [number, number],
    winterTrees = false
  ): boolean {
    const frame: GroundBlendFrame = {
      projection: this.projectionMatrix,
      viewOffset: [this.viewTileX * BASE_TILE_PX, this.viewTileY * BASE_TILE_PX],
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
      litBounds: this.lightBounds
    };
    const drawn = winterTrees ? blend.drawWinterTrees(frame) : blend.draw(frame);
    if (!drawn) return false;
    this.stats.drawCalls++;
    this.stats.vertexCount += 6;
    return true;
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

  private bindPaintedAtlas(gpu: GpuDevice, painted: LoadedPaintedTileset): void {
    if (!this.shaderManager) return;
    gpu.setTextureSlot(1);
    gpu.bindTexture(painted.texture);
    gpu.setTextureSlot(0);
    this.shaderManager.setUniform('tileRenderer', 'u_paintAtlas', 1);
    this.shaderManager.setUniform(
      'tileRenderer',
      'u_atlasScale',
      painted.tileset.tile / BASE_TILE_PX
    );
    this.shaderManager.setUniform('tileRenderer', 'u_paintTexelSize', [
      1 / painted.tileset.atlasW,
      1 / painted.tileset.atlasH
    ]);
    gpu.setTextureSlot(LIGHT_ATLAS_UNIT);
    gpu.bindTexture(painted.light);
    gpu.setTextureSlot(0);
    this.shaderManager.setUniform('tileRenderer', 'u_lightAtlas', LIGHT_ATLAS_UNIT);
    this.shaderManager.setUniform('tileRenderer', 'u_shade', SHADOW_SHADE);
    this.shaderManager.setUniform('tileRenderer', 'u_shadowDepth', SHADOW_DEPTH);
    this.shaderManager.setUniform('tileRenderer', 'u_shadowPass', 0);
    this.shaderManager.setUniform('tileRenderer', 'u_tierTileTexture', TIER_TILE_UNIT);
    this.shaderManager.setUniform('tileRenderer', 'u_tierNoiseTexture', TIER_NOISE_UNIT);
    this.shaderManager.setUniform('tileRenderer', 'u_snow', this.season === WINTER ? 1 : 0);
    if (!painted.top) return;
    this.shaderManager.setUniform('tileRenderer', 'u_snowRamp', [
      painted.top.snow.x,
      painted.top.snow.y
    ]);
    gpu.setTextureSlot(2);
    gpu.bindTexture(painted.top.texture);
    gpu.setTextureSlot(3);
    gpu.bindTexture(painted.top.veins);
    gpu.setTextureSlot(0);
    this.shaderManager.setUniform('tileRenderer', 'u_rockTexture', 2);
    this.shaderManager.setUniform('tileRenderer', 'u_veinTexture', 3);
    this.shaderManager.setUniform(
      'tileRenderer',
      'u_rowPx',
      this.rowDepth ? painted.tileset.tile : 0
    );
    this.shaderManager.setUniform('tileRenderer', 'u_rockRamp', [
      painted.top.ramp.x,
      painted.top.ramp.y
    ]);
    this.shaderManager.setUniform('tileRenderer', 'u_rockLift', painted.top.lift);
  }

  private drawSnowPieces(
    gpu: GpuDevice,
    viewportTilesW: number,
    viewportTilesH: number,
    lightTime: number
  ): void {
    const kept = !!this.groundBlend?.trees;
    if (kept)
      gpu.setStencil({ compare: 'not-equal', reference: TREE_GROUND_STENCIL, write: false });
    this.drawSnowGrid(viewportTilesW, viewportTilesH, lightTime, this.rowDepth);
    if (kept) gpu.setStencil(null);
  }

  private drawSnowGrid(
    viewportTilesW: number,
    viewportTilesH: number,
    lightTime: number,
    rowPasses = false
  ): void {
    if (!this.snowGrid || !this.gridRenderer) return;
    const s = this.gridRenderer.renderGrid(this.snowGrid, {
      tileWidth: BASE_TILE_PX,
      tileHeight: BASE_TILE_PX,
      viewportX: this.viewTileX,
      viewportY: this.viewTileY,
      viewportWidth: viewportTilesW,
      viewportHeight: viewportTilesH,
      lightSampler: this.lightSampler ?? undefined,
      lightTime,
      pointLightActive: this.dynamicLight,
      lightVersion: this.lightVersion,
      litBounds: this.lightBounds,
      cacheVersion: this.snowVersion,
      chunkLayer: 'snow',
      rowPasses
    });
    this.stats.drawCalls++;
    this.stats.vertexCount += s.tilesRendered * 6;
  }

  private renderGlyphOverlay(
    grid: GameGrid | null,
    viewportTilesW: number,
    viewportTilesH: number,
    lightTime: number,
    viewportCulled = false,
    chunkLayer?: 'resource' | 'resourceTall'
  ): void {
    if (!grid || !this.gridRenderer) return;
    const stats = this.gridRenderer.renderGrid(grid, {
      tileWidth: BASE_TILE_PX,
      tileHeight: BASE_TILE_PX,
      viewportX: this.viewTileX,
      viewportY: this.viewTileY,
      viewportWidth: viewportTilesW,
      viewportHeight: viewportTilesH,
      lightSampler: this.lightSampler ?? undefined,
      lightTime,
      litBounds: this.lightBounds,
      renderAllTiles: !viewportCulled,
      rowPasses: this.rowDepth,
      ...(chunkLayer
        ? { chunkLayer, cacheVersion: this.gridVersion, lightVersion: this.lightVersion }
        : {})
    });
    if (chunkLayer) this.stats.resourceRebuilds += this.gridRenderer.chunksRebuiltLastRender;
    this.stats.drawCalls++;
    this.stats.vertexCount += stats.tilesRendered * 6;
  }

  endFrame(): void {
    if (passOn('gl')) this.render();
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
