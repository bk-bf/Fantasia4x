import { createOrthographicMatrix, PerformanceTimer } from './utils.js';
import { ShaderManager, createTileRendererShaders } from './shaders.js';
import { createSquareCellAtlas, loadBitlandsAtlas } from './font-atlas.js';
import { TextureManager } from './texture-manager.js';
import { CharacterRenderer } from './character-renderer.js';
import { GridRenderer } from './grid-renderer.js';
import { WebGLStateManager } from './webgl-state.js';
import type { GameGrid } from './game-grid.js';
import type { FontAtlas } from './types.js';
import { BASE_TILE_PX } from './tile-types.js';

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

  setAmbient(light: number, tint: [number, number, number]): void {
    this.ambientLight = light;
    this.ambientTint = tint;
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

      const gl = await this.webglState.initialize();

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
        this.debug
      );

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
    this.webglState.clear();
  }

  private render(): void {
    const gl = this.webglState.getContext();
    if (!gl || !this.shaderManager || !this.gridRenderer || !this.fontTexture || !this.gameGrid) {
      return;
    }

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
    this.shaderManager.setUniform('tileRenderer', 'u_ambient', [
      this.ambientLight * this.ambientTint[0],
      this.ambientLight * this.ambientTint[1],
      this.ambientLight * this.ambientTint[2]
    ]);
    const flickerTime = performance.now() / 1000;
    this.shaderManager.setUniform(
      'tileRenderer',
      'u_lightFlicker',
      this.dynamicLight ? fireFlickerGlobal(flickerTime) : 1.0
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
    this.shaderManager.setUniform('tileRenderer', 'u_fontAtlas', 0);
    if (this.fontAtlas) {
      this.shaderManager.setUniform('tileRenderer', 'u_texelSize', [
        1 / this.fontAtlas.atlasWidth,
        1 / this.fontAtlas.atlasHeight
      ]);
    }

    const viewportTilesW = Math.ceil(this.viewport.width / this.tileWidth);
    const viewportTilesH = Math.ceil(this.viewport.height / this.tileHeight);

    const lightTime = performance.now() / 1000;

    this.shaderManager.setUniform('tileRenderer', 'u_glyphOnly', 0);
    const tTerrain = performance.now();
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
      this.renderGlyphOverlay(
        this.resourceOverlayGrid,
        viewportTilesW,
        viewportTilesH,
        lightTime,
        true,
        'resource'
      );
      if (this.snowGrid) {
        this.drawSnowGrid(viewportTilesW, viewportTilesH, lightTime);
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
      gl.disable(gl.BLEND);
    } else {
      this.stats.overlayMs = 0;
    }
  }

  private drawSnowGrid(viewportTilesW: number, viewportTilesH: number, lightTime: number): void {
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
      chunkLayer: 'snow'
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
