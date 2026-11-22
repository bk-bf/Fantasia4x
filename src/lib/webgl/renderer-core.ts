import { createOrthographicMatrix, PerformanceTimer } from './utils.js';
import { ShaderManager, createTileRendererShaders } from './shaders.js';
import { createSquareCellAtlas, loadBitlandsAtlas } from './font-atlas.js';
import { TextureManager } from './texture-manager.js';
import { CharacterRenderer } from './character-renderer.js';
import { ALPHA_CUT, GridRenderer } from './grid-renderer.js';
import { WebGLStateManager } from './webgl-state.js';
import type { GameGrid } from './game-grid.js';
import type { FontAtlas } from './types.js';
import { BASE_TILE_PX } from './tile-types.js';
import { WORK_PINS } from '../workPins/flag.js';
import { addFrameTotals } from '../workPins/page.js';
import { GROUND_BLEND, PAINTED_LIGHT, PAINTED_TILES } from './painted/flag.js';
import { loadPaintedTileset, type LoadedPaintedTileset } from './painted/loader.js';
import { GroundBlend } from './painted/groundBlend.js';
import { LIGHT_FIELD_UNIT, PaintedLightPass, type LightPassFrame } from './painted/lightPass.js';
import {
  MAP_WEATHER,
  gradeForHour,
  type MapWeatherId,
  type PointLight,
  type Rgb
} from './painted/lightGrade.js';
import { PaintedShadowCast, SHADOW_DEPTH, SHADOW_SHADE } from './painted/shadowCast.js';

const LIGHT_ATLAS_UNIT = 7;

export const ROW_DEPTH_RANGE = 8192;

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
  private characterRenderer: CharacterRenderer | null = null;
  private gridRenderer: GridRenderer | null = null;

  private fontAtlas: FontAtlas | null = null;
  private fontTexture: WebGLTexture | null = null;

  private tilesetLoaded = false;
  private painted: LoadedPaintedTileset | null = null;
  private rowDepth = PAINTED_TILES;
  private groundBlend: GroundBlend | null = null;
  private lightPass: PaintedLightPass | null = null;
  private shadowCast: PaintedShadowCast | null = null;
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
    this.groundBlend?.setGrid(grid, dirtyTiles);
    if (dirtyTiles && dirtyTiles.length > 0) {
      this.gridRenderer?.markTerrainChunksDirty(dirtyTiles);
    } else {
      this.gridVersion++;
    }
  }

  setSnowGrid(grid: GameGrid | null, dirtyTiles?: ReadonlyArray<{ x: number; y: number }>): void {
    this.snowGrid = grid;
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
    this.resourceOverlayGrid = grid;
  }

  setResourceTallOverlayGrid(grid: GameGrid | null): void {
    this.resourceTallOverlayGrid = grid;
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

  setPointLights(lights: readonly PointLight[]): void {
    this.pointLights = lights;
  }

  setDynamicLight(active: boolean): void {
    this.dynamicLight = active;
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
      const gl = this.webglState.getContext();
      if (!gl || !this.gridRenderer) return;

      const newAtlas = await createSquareCellAtlas(cellSize, this.debug);

      const newTexture = gl.createTexture();
      if (!newTexture) return;

      gl.bindTexture(gl.TEXTURE_2D, newTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        newAtlas.atlasWidth,
        newAtlas.atlasHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        newAtlas.texture.data
      );

      if (this.fontTexture) gl.deleteTexture(this.fontTexture);
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

      const gl = await this.webglState.initialize({ depth: this.rowDepth });

      this.shaderManager = await createTileRendererShaders(gl, this.debug);
      if (!this.shaderManager) throw new Error('Shader init failed');

      try {
        this.fontAtlas = await loadBitlandsAtlas(12, 18, this.debug);
        this.tilesetLoaded = true;
      } catch {
        if (this.debug) console.warn('Bitlands atlas unavailable, using canvas atlas');
        this.fontAtlas = await createSquareCellAtlas(this.tileWidth, this.debug);
      }

      this.textureManager = new TextureManager(gl, this.debug);
      this.fontTexture = this.textureManager.createFontAtlasTexture(this.fontAtlas, {
        filtering: 'nearest',
        wrapping: 'clamp',
        flipY: false
      });
      if (!this.fontTexture) throw new Error('Font texture creation failed');

      this.characterRenderer = new CharacterRenderer(
        gl,
        this.shaderManager,
        this.fontAtlas,
        this.debug
      );
      this.gridRenderer = new GridRenderer(
        gl,
        this.shaderManager,
        this.characterRenderer,
        this.fontAtlas,
        this.debug,
        this.rowDepth
      );
      if (PAINTED_TILES) this.painted = await loadPaintedTileset(gl);
      if (GROUND_BLEND && this.painted)
        this.groundBlend = GroundBlend.create(gl, this.shaderManager, this.painted);
      this.gridRenderer.skipBlendedGround = this.groundBlend !== null;
      if (this.gameGrid) this.groundBlend?.setGrid(this.gameGrid);
      if (PAINTED_LIGHT && this.painted)
        this.lightPass = PaintedLightPass.create(gl, this.shaderManager);
      if (this.painted) this.shadowCast = PaintedShadowCast.create(gl, this.shaderManager);

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
    const gl = this.webglState.getContext();
    if (!gl || !this.shaderManager || !this.gridRenderer || !this.fontTexture || !this.gameGrid) {
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

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
    this.shaderManager.setUniform('tileRenderer', 'u_fontAtlas', 0);
    if (this.fontAtlas) {
      this.shaderManager.setUniform('tileRenderer', 'u_texelSize', [
        1 / this.fontAtlas.atlasWidth,
        1 / this.fontAtlas.atlasHeight
      ]);
    }
    if (this.painted) this.bindPaintedAtlas(gl, this.painted);
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
    const gridStats = this.gridRenderer.renderGrid(this.gameGrid, {
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
    });
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
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.shaderManager.setUniform('tileRenderer', 'u_glyphOnly', 1);
      const tOverlay = performance.now();
      if (this.snowGrid) {
        this.shaderManager.setUniform('tileRenderer', 'u_bgOnly', 1);
        this.drawSnowGrid(viewportTilesW, viewportTilesH, lightTime);
        this.shaderManager.setUniform('tileRenderer', 'u_bgOnly', 0);
      }
      if (this.rowDepth) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        this.drawShadowCast(gl, viewportTilesW, viewportTilesH);
      }
      this.renderGlyphOverlay(
        this.resourceOverlayGrid,
        viewportTilesW,
        viewportTilesH,
        lightTime,
        true,
        'resource'
      );
      if (this.snowGrid) {
        this.drawSnowGrid(viewportTilesW, viewportTilesH, lightTime, this.rowDepth);
      }
      this.renderGlyphOverlay(this.buildingOverlayGrid, viewportTilesW, viewportTilesH, lightTime);
      this.renderGlyphOverlay(this.itemOverlayGrid, viewportTilesW, viewportTilesH, lightTime);
      this.renderGlyphOverlay(this.overlayGrid, viewportTilesW, viewportTilesH, lightTime);
      this.renderGlyphOverlay(
        this.resourceTallOverlayGrid,
        viewportTilesW,
        viewportTilesH,
        lightTime,
        true,
        'resourceTall'
      );
      this.stats.overlayMs = performance.now() - tOverlay;
      this.shaderManager.setUniform('tileRenderer', 'u_glyphOnly', 0);
      if (this.rowDepth) gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
    } else {
      this.stats.overlayMs = 0;
    }
  }

  private lightFrame(
    artTile: number,
    viewportTilesW: number,
    viewportTilesH: number
  ): LightPassFrame {
    return {
      canvas: [this.viewport.width, this.viewport.height],
      viewOffset: [this.viewTileX * BASE_TILE_PX, this.viewTileY * BASE_TILE_PX],
      zoom: [this.tileWidth / BASE_TILE_PX, this.tileHeight / BASE_TILE_PX],
      artPerBase: artTile / BASE_TILE_PX,
      artTile,
      view: { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH },
      grade: gradeForHour(this.ambientLight, this.ambientBase, MAP_WEATHER[this.mapWeather]),
      lights: this.spriteLights(),
      time: performance.now() / 1000
    };
  }

  private spriteLights(): PointLight[] {
    const layers = [
      this.buildingOverlayGrid,
      this.resourceOverlayGrid,
      this.resourceTallOverlayGrid
    ];
    return this.pointLights.map((l) => {
      const emit = layers
        .map((g) => g?.getTile(l.x, l.y)?.painted?.emit)
        .find((e) => e !== undefined);
      if (!emit) return l;
      return {
        ...l,
        color: emit.col,
        flicker: emit.flicker === true,
        art: { x: emit.x, y: emit.y, rad: emit.rad, night: emit.night === true }
      };
    });
  }

  private drawShadowCast(
    gl: WebGL2RenderingContext,
    viewportTilesW: number,
    viewportTilesH: number
  ): void {
    if (!this.shadowCast || !this.painted || !this.shaderManager) return;
    const artTile = this.painted.tileset.tile;
    gl.depthFunc(gl.LESS);
    gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    this.stats.drawCalls += this.shadowCast.draw({
      canvas: [this.viewport.width, this.viewport.height],
      viewOffset: [this.viewTileX * BASE_TILE_PX, this.viewTileY * BASE_TILE_PX],
      zoom: [this.tileWidth / BASE_TILE_PX, this.tileHeight / BASE_TILE_PX],
      artPerBase: artTile / BASE_TILE_PX,
      artTile,
      view: { x: this.viewTileX, y: this.viewTileY, w: viewportTilesW, h: viewportTilesH },
      casters: [this.resourceOverlayGrid, this.buildingOverlayGrid]
    });
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LEQUAL);
    this.shaderManager.useProgram('tileRenderer');
  }

  private drawGroundBlend(
    blend: GroundBlend,
    flicker: number,
    lightTime: number,
    tone: [number, number]
  ): void {
    const drawn = blend.draw({
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
      lightSampler: this.lightSampler ?? undefined,
      lightTime,
      lightVersion: this.lightVersion,
      litBounds: this.lightBounds
    });
    if (!drawn) return;
    this.stats.drawCalls++;
    this.stats.vertexCount += 6;
  }

  private bindPaintedAtlas(gl: WebGL2RenderingContext, painted: LoadedPaintedTileset): void {
    if (!this.shaderManager) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, painted.texture);
    gl.activeTexture(gl.TEXTURE0);
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
    gl.activeTexture(gl.TEXTURE0 + LIGHT_ATLAS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, painted.light);
    gl.activeTexture(gl.TEXTURE0);
    this.shaderManager.setUniform('tileRenderer', 'u_lightAtlas', LIGHT_ATLAS_UNIT);
    this.shaderManager.setUniform('tileRenderer', 'u_shade', SHADOW_SHADE);
    this.shaderManager.setUniform('tileRenderer', 'u_shadowDepth', SHADOW_DEPTH);
    this.shaderManager.setUniform('tileRenderer', 'u_shadowPass', 0);
    if (!painted.top) return;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, painted.top.texture);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, painted.top.veins);
    gl.activeTexture(gl.TEXTURE0);
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
    this.render();
    this.stats.frameTime = this.timer.end();
    this.stats.fps = this.timer.updateFPS();
    if (WORK_PINS) addFrameTotals(this.stats);
  }

  getStats(): RenderStats {
    return { ...this.stats };
  }
  getContext(): WebGL2RenderingContext | null {
    return this.webglState.getContext();
  }
  getProjectionMatrix(): Float32Array {
    return this.projectionMatrix;
  }
  getShaderManager(): ShaderManager | null {
    return this.shaderManager;
  }
  getCharacterRenderer(): CharacterRenderer | null {
    return this.characterRenderer;
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
    this.characterRenderer?.dispose();
    this.shaderManager?.dispose();
    this.textureManager?.dispose();
    this.groundBlend?.dispose();
    this.groundBlend = null;
    this.lightPass?.dispose();
    this.lightPass = null;
    this.shadowCast?.dispose();
    this.shadowCast = null;
    if (this.painted) this.webglState.getContext()?.deleteTexture(this.painted.texture);
    if (this.painted) this.webglState.getContext()?.deleteTexture(this.painted.light);
    if (this.painted?.top) this.webglState.getContext()?.deleteTexture(this.painted.top.texture);
    if (this.painted?.top) this.webglState.getContext()?.deleteTexture(this.painted.top.veins);
    this.painted = null;
    this.webglState.dispose();
    this.gridRenderer = null;
    this.characterRenderer = null;
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
