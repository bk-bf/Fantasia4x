/* filepath: src/lib/webgl/renderer-core.ts */
/**
 * Core WebGL2 Renderer — generic tile-based renderer
 * Adapted from Exiled for Fantasia4x. No game-specific imports.
 * Game data is injected via setGrid() / setViewport().
 */

import { createOrthographicMatrix, PerformanceTimer } from './utils.js';
import { ShaderManager, createTileRendererShaders } from './shaders.js';
import { createSquareCellAtlas, loadBitlandsAtlas } from './font-atlas.js';
import { TextureManager } from './texture-manager.js';
import { CharacterRenderer } from './character-renderer.js';
import { GridRenderer } from './grid-renderer.js';
import { TerrainCache } from './terrain-cache.js';
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
  /** Per-pass CPU time (ms) — terrain vs entity overlay — for the profiler render breakdown. */
  terrainMs: number;
  overlayMs: number;
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

  // Tile dimensions (pixels per tile)
  private tileWidth: number;
  private tileHeight: number;

  // Viewport in tile coordinates
  private viewTileX = 0;
  private viewTileY = 0;

  // Subsystem managers
  private webglState: WebGLStateManager;
  private shaderManager: ShaderManager | null = null;
  private textureManager: TextureManager | null = null;
  private characterRenderer: CharacterRenderer | null = null;
  private gridRenderer: GridRenderer | null = null;
  // Terrain FBO cache (§E.1 followup 2). While PAUSED, the heavy terrain pass is captured to a
  // viewport texture once and re-blitted each frame (1 sample/pixel) instead of re-running the
  // fillrate-heavy terrain shader — the entity overlays still draw live on top. Gated on paused, so
  // running play never touches it. Invalidated on camera/grid/resize so a pan re-captures.
  private terrainCache: TerrainCache | null = null;
  private terrainCacheEnabled = false;

  // Resources
  private fontAtlas: FontAtlas | null = null;
  private fontTexture: WebGLTexture | null = null;

  // Whether a pre-baked PNG tileset is active (skip atlas regeneration on zoom)
  private tilesetLoaded = false;

  // External grid data
  private gameGrid: GameGrid | null = null;
  // Bumped every time the terrain grid is replaced; lets the grid renderer
  // cache the static terrain vertex buffer and skip per-frame regeneration.
  private gridVersion = 0;
  // Sparse entity-overlay grid (pawns, mobs) rendered as an alpha-blended pass on
  // top of the terrain grid so entities never destroy the terrain glyph in their
  // cell and can slide smoothly between tiles.
  private overlayGrid: GameGrid | null = null;
  // Dropped/stored items live in their OWN overlay grid, rendered between terrain
  // and entities. Items are a separate single-glyph grid so a pawn standing on an
  // item's tile composites on top of it instead of overwriting the item glyph
  // (which is what happened when both shared one grid).
  private itemOverlayGrid: GameGrid | null = null;

  // Day/night ambient (Phase A — EnvironmentService drives these each turn).
  // Applied as the u_ambient fragment uniform, combined with the baked additive
  // point light, so ambient changes never rebuild the terrain vertex buffer.
  private ambientLight = 1.0;
  private ambientTint: [number, number, number] = [1.0, 1.0, 1.0];

  // Whether flickering point lights (campfires) are currently lit. Drives the
  // terrain cache's light-refresh gating so a fire-free map never rebuilds.
  private dynamicLight = false;

  // Version of the emitter SET. The baked a_light is flicker-free, so the terrain
  // buffer is only regenerated when this changes (a campfire toggled/moved).
  private lightVersion = 0;

  // Per-tile dynamic POINT lighting (Phase A2). The sampler bakes ONLY the
  // additive point-light contribution into the a_light vertex attribute; the
  // global ambient is added per-fragment via the u_ambient uniform.
  private lightSampler:
    | ((wx: number, wy: number, time: number) => [number, number, number])
    | null = null;
  // Bounding box (world tiles) enclosing all lit emitters' reach. `undefined`
  // until first set; `null` once set with no emitters lit. Lets the bake skip
  // sampling tiles that no campfire can reach.
  private lightBounds:
    | { minX: number; minY: number; maxX: number; maxY: number }
    | null
    | undefined = undefined;

  // Initialization promise
  private initPromise: Promise<boolean>;

  constructor(options: RendererOptions) {
    this.canvas = options.canvas;
    this.debug = options.debug ?? false;
    this.tileWidth = options.tileWidth ?? 12;
    this.tileHeight = options.tileHeight ?? 20;
    this.timer = new PerformanceTimer();
    this.stats = { fps: 0, frameTime: 0, drawCalls: 0, vertexCount: 0, terrainMs: 0, overlayMs: 0 };

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

  /** Inject the game grid to render. Call whenever the world changes. */
  setGrid(grid: GameGrid): void {
    this.gameGrid = grid;
    this.gridVersion++;
    this.terrainCache?.invalidate(); // terrain content changed → re-capture the paused cache
  }

  /**
   * Enable/disable the paused terrain cache (§E.1 followup 2). Pass `true` while the game is paused so
   * the heavy terrain pass is captured once and re-blitted; `false` (running) renders terrain directly.
   * Toggling re-captures on the next frame.
   */
  setTerrainCacheEnabled(enabled: boolean): void {
    if (enabled !== this.terrainCacheEnabled) this.terrainCache?.invalidate();
    this.terrainCacheEnabled = enabled;
  }

  /** Inject the entity-overlay grid (pawns/mobs) rendered on top of the terrain. */
  setOverlayGrid(grid: GameGrid | null): void {
    this.overlayGrid = grid;
  }

  /** Inject the item-overlay grid, rendered between the terrain and entities. */
  setItemOverlayGrid(grid: GameGrid | null): void {
    this.itemOverlayGrid = grid;
  }

  /** Set the top-left viewport tile position. */
  setViewTileOffset(x: number, y: number): void {
    if (x !== this.viewTileX || y !== this.viewTileY) this.terrainCache?.invalidate();
    this.viewTileX = x;
    this.viewTileY = y;
  }

  /** Update ambient light values; called each turn from the game canvas. */
  setAmbient(light: number, tint: [number, number, number]): void {
    // Day/night tint is baked into the cached terrain image; if it actually changes (e.g. a debug
    // season override while paused) the cache must re-capture. No-op cost while running (cache off).
    if (
      light !== this.ambientLight ||
      tint[0] !== this.ambientTint[0] ||
      tint[1] !== this.ambientTint[1] ||
      tint[2] !== this.ambientTint[2]
    ) {
      this.terrainCache?.invalidate();
    }
    this.ambientLight = light;
    this.ambientTint = tint;
  }

  /**
   * Declare whether any flickering point-light emitters are currently lit. When
   * false the terrain cache treats baked point light as a constant 0 and never
   * rebuilds for lighting; when true it refreshes the lit subset at ~10 Hz.
   */
  setDynamicLight(active: boolean): void {
    this.dynamicLight = active;
  }

  /**
   * Set the emitter-set version. Bumped by the canvas whenever a campfire is
   * lit/extinguished/moved so the terrain vertex buffer rebakes its (static)
   * point light exactly once per change — flicker is a per-fragment uniform.
   */
  setLightVersion(version: number): void {
    this.lightVersion = version;
  }

  /**
   * Set the bounding box (world tiles) that encloses every lit emitter's reach,
   * or null when nothing is lit. The terrain bake samples point light only for
   * tiles overlapping this box, so a small campfire costs a small box of work.
   */
  setLightBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number } | null): void {
    this.lightBounds = bounds;
  }

  /**
   * Provide the per-tile light sampler (Phase A2). The grid renderer queries it
   * at every tile corner to bake dynamic lighting into the a_light attribute.
   */
  setLightSampler(
    sampler: ((wx: number, wy: number, time: number) => [number, number, number]) | null
  ): void {
    this.lightSampler = sampler;
  }

  /** Change tile pixel dimensions (used for zoom). Regenerates atlas only when the integer cell size changes (skipped for bitmap tilesets). */
  setTileSize(w: number, h: number): void {
    const prevCellSize = Math.round(this.tileWidth);
    if (w !== this.tileWidth || h !== this.tileHeight) this.terrainCache?.invalidate(); // zoom changed
    this.tileWidth = w;
    this.tileHeight = h;
    if (!this.tilesetLoaded && Math.round(w) !== prevCellSize) {
      this.reloadAtlasForCellSize(Math.round(w));
    }
  }

  // Prevent overlapping async atlas reloads
  private atlasReloadPending = false;
  private atlasReloadQueued: number | null = null;

  /** Regenerate the font atlas at the given cell size and upload to GPU directly (no TextureManager cache). */
  private async reloadAtlasForCellSize(cellSize: number): Promise<void> {
    // If already loading, just queue the latest size — process after current finishes
    if (this.atlasReloadPending) {
      this.atlasReloadQueued = cellSize;
      return;
    }
    this.atlasReloadPending = true;

    try {
      const gl = this.webglState.getContext();
      if (!gl || !this.gridRenderer) return;

      const newAtlas = await createSquareCellAtlas(cellSize, this.debug);

      // Allocate raw GL texture — bypass TextureManager to avoid stale cache issues
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

      // Swap in atomically
      if (this.fontTexture) gl.deleteTexture(this.fontTexture);
      this.fontTexture = newTexture;
      this.fontAtlas = newAtlas;
      this.gridRenderer.setFontAtlas(newAtlas);
    } catch (err) {
      console.warn('Atlas reload failed:', err);
    } finally {
      this.atlasReloadPending = false;
      // Process any size change that arrived while we were loading
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

      // Load all bitlands sheets into a unified atlas
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
      this.terrainCache = new TerrainCache(gl);

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
    this.terrainCache?.invalidate(); // viewport size changed → re-capture at the new size
  }

  beginFrame(): void {
    this.timer.start();
    this.stats.drawCalls = 0;
    this.stats.vertexCount = 0;
    this.webglState.clear();
  }

  private render(): void {
    const gl = this.webglState.getContext();
    if (!gl || !this.shaderManager || !this.gridRenderer || !this.fontTexture || !this.gameGrid) {
      return;
    }

    if (!this.shaderManager.useProgram('tileRenderer')) return;
    this.shaderManager.setUniform('tileRenderer', 'u_projection', this.projectionMatrix);

    // Pan AND zoom are shader uniforms now: terrain geometry is baked once at a
    // fixed BASE_TILE_PX size, then shifted (u_viewOffset) and scaled (u_zoom)
    // here — so neither scrolling nor zooming ever rebuilds the vertex buffer.
    this.shaderManager.setUniform('tileRenderer', 'u_viewOffset', [
      this.viewTileX * BASE_TILE_PX,
      this.viewTileY * BASE_TILE_PX
    ]);
    this.shaderManager.setUniform('tileRenderer', 'u_zoom', [
      this.tileWidth / BASE_TILE_PX,
      this.tileHeight / BASE_TILE_PX
    ]);
    // Global day/night ambient is a uniform too, combined per-fragment with the
    // baked additive point light, so ambient changes never rebuild the buffer.
    this.shaderManager.setUniform('tileRenderer', 'u_ambient', [
      this.ambientLight * this.ambientTint[0],
      this.ambientLight * this.ambientTint[1],
      this.ambientLight * this.ambientTint[2]
    ]);
    // Global fire-flicker multiplier for the baked (static) point light. Cheap
    // per-frame uniform so a lit campfire animates without rebaking any vertices.
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

    // Terrain pass — opaque, fills every cell background. Rendered as viewport-culled CHUNKS (§E):
    // geometry is camera-independent (world-space verts + u_viewOffset/u_zoom), so only the chunks
    // overlapping the viewport are built/drawn and panning just changes which chunks are visible.
    // §E.1 followup 2: while PAUSED (terrainCacheEnabled), render the terrain ONCE into an FBO and
    // re-blit it each frame instead of re-running the fillrate-heavy shader; the entity overlays still
    // draw live on top. The cache self-invalidates on camera/grid/resize/ambient change.
    const tTerrain = performance.now();
    const cache = this.terrainCache;
    if (this.terrainCacheEnabled && cache && cache.isValid()) {
      // Paused + valid: just blit the cached terrain (1 sample/pixel).
      cache.draw();
    } else {
      const capturing =
        this.terrainCacheEnabled && cache
          ? cache.beginCapture(this.viewport.width, this.viewport.height)
          : false;
      this.shaderManager.setUniform('tileRenderer', 'u_glyphOnly', 0);
      const gridStats = this.gridRenderer.renderGrid(this.gameGrid, {
        // Geometry baked at the fixed base size; zoom comes from u_zoom.
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
      this.stats.vertexCount += gridStats.tilesRendered * 6;
      if (capturing && cache) {
        cache.endCapture(); // back to the default framebuffer
        cache.draw(); // and blit the freshly-captured terrain to the screen this frame too
      }
    }
    this.stats.terrainMs = performance.now() - tTerrain;
    this.stats.drawCalls++;

    // Overlay passes — glyph-only, alpha-blended on top of the terrain so the tile
    // underneath keeps rendering and motion can be sub-tile. Draw order is
    // terrain → items → entities: each is its own single-glyph grid, so a pawn
    // composites OVER a dropped item instead of overwriting its glyph.
    if (this.overlayGrid || this.itemOverlayGrid) {
      // The terrain-cache blit binds its OWN program + texture (TEXTURE0); re-assert the tile renderer
      // program + font atlas before the glyph overlays (no-op after the direct terrain path).
      this.shaderManager.useProgram('tileRenderer');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
      this.shaderManager.setUniform('tileRenderer', 'u_fontAtlas', 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.shaderManager.setUniform('tileRenderer', 'u_glyphOnly', 1);
      const tOverlay = performance.now();
      // Items first (beneath), then entities (on top).
      this.renderGlyphOverlay(this.itemOverlayGrid, viewportTilesW, viewportTilesH, lightTime);
      this.renderGlyphOverlay(this.overlayGrid, viewportTilesW, viewportTilesH, lightTime);
      this.stats.overlayMs = performance.now() - tOverlay;
      this.shaderManager.setUniform('tileRenderer', 'u_glyphOnly', 0);
      gl.disable(gl.BLEND);
    } else {
      this.stats.overlayMs = 0;
    }
  }

  /** Render one glyph-only overlay grid (no-op when null). Caller sets up blend + u_glyphOnly. */
  private renderGlyphOverlay(
    grid: GameGrid | null,
    viewportTilesW: number,
    viewportTilesH: number,
    lightTime: number
  ): void {
    if (!grid || !this.gridRenderer) return;
    const stats = this.gridRenderer.renderGrid(grid, {
      // Geometry baked at the fixed base size; zoom comes from u_zoom. The
      // overlay's sub-tile animationOffset is likewise in base-tile pixels.
      tileWidth: BASE_TILE_PX,
      tileHeight: BASE_TILE_PX,
      viewportX: this.viewTileX,
      viewportY: this.viewTileY,
      viewportWidth: viewportTilesW,
      viewportHeight: viewportTilesH,
      lightSampler: this.lightSampler ?? undefined,
      lightTime,
      litBounds: this.lightBounds,
      renderAllTiles: true
    });
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
    this.terrainCache?.dispose();
    this.terrainCache = null;
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

/**
 * Global fire-flicker scalar in [0.85, 1.0] applied as the u_lightFlicker uniform.
 * Mirrors LightingService.fireFlicker(time, 0) so the baked-vs-uniform split stays
 * visually consistent. A single shared phase animates all lit campfires together,
 * which is a negligible visual trade for eliminating per-frame vertex rebakes.
 */
function fireFlickerGlobal(time: number): number {
  const n = Math.sin(time * 6.0) * 0.5 + Math.sin(time * 11.3) * 0.5;
  return 0.85 + 0.15 * (0.5 + 0.5 * n);
}
