/* filepath: src/lib/webgl/grid-renderer.ts */
/**
 * Grid Renderer - Bridges GameGrid with WebGL2 character rendering
 * Efficiently renders tile grids using viewport culling and batch operations
 */

import type { GameGrid } from './game-grid.js';
import type { TileData, Viewport } from './tile-types.js';
import type { CharacterRenderer } from './character-renderer.js';
import type { ShaderManager } from './shaders.js';
import type { FontAtlas } from './types.js';
import { checkWebGLError } from './utils.js';

/** Default fully-lit value used when no light sampler is supplied. */
const ONE_LIGHT: [number, number, number] = [1, 1, 1];
/** Shared "no point light" value for tiles outside every emitter's reach. */
const ZERO_LIGHT: [number, number, number] = [0, 0, 0];

export interface GridRenderOptions {
  tileWidth: number; // Width of each tile in pixels
  tileHeight: number; // Height of each tile in pixels
  viewportX: number; // Camera X position in world tiles
  viewportY: number; // Camera Y position in world tiles
  viewportWidth: number; // Visible width in tiles
  viewportHeight: number; // Visible height in tiles
  // Per-tile dynamic lighting (Phase A2). Sampled at each tile CORNER and
  // uploaded as the a_light vertex attribute; the GPU interpolates it across
  // the quad. Returns an RGB multiplier (ambient + accumulated point light).
  // When absent, tiles render fully lit ([1,1,1]).
  lightSampler?: (wx: number, wy: number, time: number) => [number, number, number];
  lightTime?: number; // seconds, snapshot once per frame for seamless flicker
  // Monotonic version of the EMITTER SET (campfires lit/extinguished/moved). The
  // baked a_light is flicker-free, so the terrain buffer only needs rebuilding
  // when this changes — flicker itself is a cheap per-fragment shader uniform.
  lightVersion?: number;
  // Axis-aligned bounding box (in world tile coords) that encloses every active
  // light emitter's reach. Tiles fully outside it can't receive point light, so
  // the bake skips sampling them — making lighting cost scale with the lit area,
  // not the whole map. `null` means a sampler is present but no emitters are lit
  // (so every tile is dark); `undefined` falls back to sampling all tiles.
  litBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  renderAllTiles?: boolean;
  // Monotonic version of the grid's CONTENT. When provided, the generated
  // vertex buffer is cached and reused across frames as long as the version,
  // camera position, zoom and (coarse) light bucket are unchanged. This avoids
  // regenerating tens of thousands of static terrain tiles every single frame.
  // Omit for layers whose content changes every frame (e.g. the pawn overlay).
  cacheVersion?: number;
  // Which cached chunk set this grid draws into. The static terrain is the default; the resource
  // overlays (trees/plants — dense, static between edits, same dirty cadence as terrain) reuse the
  // SAME chunked-cache machinery under their own chunk maps so they're built on change, not per frame.
  chunkLayer?: 'terrain' | 'resource' | 'resourceTall';
  // Whether any flickering point-light emitters are currently lit. When false,
  // the baked additive light is constant 0 and the terrain cache never rebuilds
  // for lighting; when true it refreshes at ~10 Hz to animate the flicker.
  pointLightActive?: boolean;
}

export interface GridRenderStats {
  tilesRendered: number;
  tilesCulled: number;
  batchCount: number;
  renderTime: number;
}

/** One CHUNK_SIZE² slice of the static terrain layer — its own GPU buffer, built lazily on demand. */
interface TerrainChunk {
  vao: WebGLVertexArrayObject | null; // null until the chunk first has tiles to draw
  vbo: WebGLBuffer | null;
  count: number; // uploaded vertex count (0 = empty/off-map chunk, skip the draw)
  builtVersion: number; // cacheVersion the data was baked for (rebuild on mismatch)
  builtLight: number; // lightVersion baked into a_light (rebuild on emitter-set change)
  builtDirty: number; // per-chunk dirty stamp baked in (ADR-026 incremental terrain — rebuild on mismatch)
  lastFrame: number; // last frame this chunk was visible (for eviction)
}

/**
 * High-performance grid renderer with viewport culling
 */
export class GridRenderer {
  private gl: WebGL2RenderingContext;
  private shaderManager: ShaderManager;
  private characterRenderer: CharacterRenderer;
  private fontAtlas: FontAtlas;
  private debug: boolean;

  // Grid rendering VAO/VBO for batch rendering. The OVERLAY (dynamic, changes every frame)
  // uses this pair and re-uploads each frame.
  private gridVAO: WebGLVertexArrayObject | null = null;
  private gridVBO: WebGLBuffer | null = null;
  private currentVertexCount: number = 0;

  // CHUNKED TERRAIN (ENGINE-PERFORMANCE §E). The terrain layer used to be ONE giant VBO holding
  // every tile, built + uploaded + drawn in full. That was fine at 38k tiles but the default map
  // grew to 500×500 = 250k tiles (~138MB buffer, 1.5M verts drawn EVERY frame, O(map) rebuilds).
  // Now the map is sliced into CHUNK_SIZE² tiles, each with its OWN VAO/VBO, built lazily and drawn
  // only when it overlaps the viewport (+ a one-chunk margin ring). Off-screen chunks are neither
  // built, uploaded, nor drawn — render cost becomes O(visible tiles), independent of map size — and
  // a content change (cacheVersion bump) rebuilds only the visible chunks, not the whole map. Chunks
  // not drawn for a while are evicted to bound GPU memory while panning.
  private static readonly CHUNK_SIZE = 32;
  private static readonly CHUNK_MARGIN = 1; // extra chunk ring around the viewport (pre-build)
  private static readonly CHUNK_EVICT_FRAMES = 240; // ~4s un-drawn → free GL resources
  private static readonly CHUNK_SWEEP_EVERY = 120; // run the eviction sweep this often (frames)
  private terrainChunks: Map<string, TerrainChunk> = new Map();
  // Resource-overlay chunk caches — same machinery as terrain, one map per glyph layer (short plants +
  // tall canopy render in separate passes for occlusion ordering). Keyed by the SAME cacheVersion /
  // lightVersion / chunkDirty as terrain, since redrawOverlayNow rebuilds both from the same changed tiles.
  private resourceChunks: Map<string, TerrainChunk> = new Map();
  private resourceTallChunks: Map<string, TerrainChunk> = new Map();
  private terrainFrame = 0; // monotonic frame counter for chunk LRU eviction
  /** DEBUG: how many terrain chunks were (re)built+uploaded in the most recent renderTerrainChunked. */
  chunksRebuiltLastRender = 0;
  // ADR-026 per-chunk dirty: a partial terrain update (markTerrainChunksDirty) stamps ONLY the chunks
  // holding a changed tile, so they rebuild while every other visible chunk keeps its cached VBO — vs.
  // bumping the global cacheVersion, which re-vertexes every visible chunk for a single changed tile.
  private chunkDirty = new Map<string, number>();
  private chunkDirtyCounter = 0;

  // Render statistics
  private stats: GridRenderStats = {
    tilesRendered: 0,
    tilesCulled: 0,
    batchCount: 0,
    renderTime: 0
  };

  constructor(
    gl: WebGL2RenderingContext,
    shaderManager: ShaderManager,
    characterRenderer: CharacterRenderer,
    fontAtlas: FontAtlas,
    debug = false
  ) {
    this.gl = gl;
    this.shaderManager = shaderManager;
    this.characterRenderer = characterRenderer;
    this.fontAtlas = fontAtlas;
    this.debug = debug;

    this.initializeGridRendering();
  }

  /** Hot-swap the font atlas (e.g. after zoom changes the cell size). */
  setFontAtlas(atlas: FontAtlas): void {
    this.fontAtlas = atlas;
  }

  /**
   * Render a game grid with the specified options
   */
  renderGrid(grid: GameGrid, options: GridRenderOptions): GridRenderStats {
    const startTime = performance.now();

    // The STATIC TERRAIN layer (callers pass `cacheVersion`) takes the chunked,
    // viewport-culled path (§E) — render cost scales with the visible tiles, not
    // the whole map. The DYNAMIC overlays (no cacheVersion: sparse pawn/item/mob
    // grids) keep the full-render + per-frame upload path below — they hold only a
    // handful of cells, so `renderAllTiles` returning every tile is already cheap.
    if (options.cacheVersion !== undefined) {
      const chunks =
        options.chunkLayer === 'resource'
          ? this.resourceChunks
          : options.chunkLayer === 'resourceTall'
            ? this.resourceTallChunks
            : this.terrainChunks;
      const drawnTiles = this.renderTerrainChunked(grid, options, chunks);
      this.stats = {
        tilesRendered: drawnTiles,
        tilesCulled: 0,
        batchCount: drawnTiles > 0 ? 1 : 0,
        renderTime: performance.now() - startTime
      };
      return { ...this.stats };
    }

    // Create viewport for culling
    const viewport: Viewport = {
      x: Math.floor(options.viewportX),
      y: Math.floor(options.viewportY),
      width: options.viewportWidth,
      height: options.viewportHeight
    };

    // Get visible tiles using efficient culling. The sparse overlay grid asks
    // for all tiles instead (it holds only entities, so culling would waste a
    // full viewport scan to find a handful of cells).
    const visibleTiles = options.renderAllTiles
      ? grid.getAllTiles()
      : grid.getVisibleTiles(viewport);

    if (visibleTiles.length > 0) {
      const vertexData = this.generateBatchVertexData(visibleTiles, options);
      this.uploadAndDraw(vertexData);
    } else {
      this.currentVertexCount = 0;
    }

    // Update statistics
    const renderTime = performance.now() - startTime;
    this.stats = {
      tilesRendered: visibleTiles.length,
      tilesCulled: this.estimateCulledTiles(grid, viewport),
      batchCount: visibleTiles.length > 0 ? 1 : 0,
      renderTime
    };

    return { ...this.stats };
  }

  /**
   * Render the static terrain layer as viewport-culled chunks (§E). Only chunks overlapping the
   * viewport (+ a one-chunk margin) are built/uploaded/drawn; each is rebuilt only when the grid
   * content (`cacheVersion`) or emitter set (`lightVersion`) changes. Returns the tile count drawn.
   *
   * Geometry stays camera-independent — a tile's vertices use its WORLD position and pan/zoom are
   * shader uniforms — so a chunk's buffer is valid across pans and only the VISIBLE SET changes as
   * you scroll, never the geometry.
   */
  /**
   * ADR-026: mark only the chunks containing these changed tiles for rebuild on the next draw. Used by
   * the incremental terrain path (a single bumped stamp per affected chunk) instead of a global
   * cacheVersion bump, which would re-vertex every visible chunk for one changed tile.
   */
  markTerrainChunksDirty(tiles: ReadonlyArray<{ x: number; y: number }>): void {
    const CS = GridRenderer.CHUNK_SIZE;
    for (const t of tiles) {
      const key = `${Math.floor(t.x / CS)}:${Math.floor(t.y / CS)}`;
      this.chunkDirty.set(key, ++this.chunkDirtyCounter);
    }
  }

  private renderTerrainChunked(
    grid: GameGrid,
    options: GridRenderOptions,
    chunks: Map<string, TerrainChunk> = this.terrainChunks
  ): number {
    const CS = GridRenderer.CHUNK_SIZE;
    const m = GridRenderer.CHUNK_MARGIN;
    const cacheVersion = options.cacheVersion ?? 0;
    const lightVersion = options.lightVersion ?? 0;
    const frame = ++this.terrainFrame;
    this.chunksRebuiltLastRender = 0; // DEBUG: reset; drawTerrainChunk bumps it on each rebuild

    // Visible tile range → chunk range (with a margin ring so panning doesn't pop).
    const minTX = Math.floor(options.viewportX);
    const minTY = Math.floor(options.viewportY);
    const minCX = Math.floor(minTX / CS) - m;
    const minCY = Math.floor(minTY / CS) - m;
    const maxCX = Math.floor((minTX + options.viewportWidth) / CS) + m;
    const maxCY = Math.floor((minTY + options.viewportHeight) / CS) + m;

    if (!this.shaderManager.useProgram('tileRenderer')) {
      console.error('❌ Failed to use tile renderer shader');
      return 0;
    }

    let drawnVerts = 0;
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        drawnVerts += this.drawTerrainChunk(
          grid,
          options,
          cx,
          cy,
          cacheVersion,
          lightVersion,
          frame,
          chunks
        );
      }
    }

    if (frame % GridRenderer.CHUNK_SWEEP_EVERY === 0) this.evictStaleChunks(frame, chunks);
    this.currentVertexCount = drawnVerts;
    return drawnVerts / 6;
  }

  /**
   * Build (if stale) and draw one terrain chunk; returns the vertex count drawn. A chunk is rebuilt
   * only when its `cacheVersion`/`lightVersion` no longer match the requested ones — between bumps
   * it just binds its VAO and draws the buffer already on the GPU (no re-upload). Off-map chunks
   * cache `count = 0` so they aren't re-scanned every frame.
   */
  private drawTerrainChunk(
    grid: GameGrid,
    options: GridRenderOptions,
    cx: number,
    cy: number,
    version: number,
    lightVersion: number,
    frame: number,
    chunks: Map<string, TerrainChunk> = this.terrainChunks
  ): number {
    const gl = this.gl;
    const CS = GridRenderer.CHUNK_SIZE;
    const key = `${cx}:${cy}`;
    let chunk = chunks.get(key);
    const dirtyStamp = this.chunkDirty.get(key) ?? 0; // ADR-026 per-chunk incremental invalidation

    if (
      !chunk ||
      chunk.builtVersion !== version ||
      chunk.builtLight !== lightVersion ||
      chunk.builtDirty !== dirtyStamp
    ) {
      this.chunksRebuiltLastRender++; // DEBUG
      const tiles = grid.getTilesInRegion(cx * CS, cy * CS, CS, CS);
      if (!chunk) {
        chunk = {
          vao: null,
          vbo: null,
          count: 0,
          builtVersion: version,
          builtLight: lightVersion,
          builtDirty: dirtyStamp,
          lastFrame: frame
        };
        chunks.set(key, chunk);
      }
      if (tiles.length === 0) {
        chunk.count = 0; // off-map / empty — keep the entry so we don't rescan until the next bump
      } else {
        const data = this.generateBatchVertexData(tiles, options);
        if (!chunk.vao || !chunk.vbo) {
          chunk.vao = gl.createVertexArray();
          chunk.vbo = gl.createBuffer();
          if (!chunk.vao || !chunk.vbo) {
            console.error('❌ Failed to create terrain chunk VAO/VBO');
            return 0;
          }
          this.setupGridAttribs(chunk.vao, chunk.vbo);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, chunk.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        chunk.count = data.length / 23; // 23 floats per vertex
      }
      chunk.builtVersion = version;
      chunk.builtLight = lightVersion;
      chunk.builtDirty = dirtyStamp;
    }

    chunk.lastFrame = frame;
    if (chunk.count > 0 && chunk.vao) {
      gl.bindVertexArray(chunk.vao);
      gl.drawArrays(gl.TRIANGLES, 0, chunk.count);
      gl.bindVertexArray(null);
      return chunk.count;
    }
    return 0;
  }

  /** Free the GL resources of any chunk not drawn within CHUNK_EVICT_FRAMES (bounds memory while panning). */
  private evictStaleChunks(
    frame: number,
    chunks: Map<string, TerrainChunk> = this.terrainChunks
  ): void {
    const gl = this.gl;
    const maxAge = GridRenderer.CHUNK_EVICT_FRAMES;
    for (const [key, chunk] of chunks) {
      if (frame - chunk.lastFrame > maxAge) {
        if (chunk.vbo) gl.deleteBuffer(chunk.vbo);
        if (chunk.vao) gl.deleteVertexArray(chunk.vao);
        chunks.delete(key);
      }
    }
  }

  /**
   * Upload a prebuilt vertex buffer and issue the draw call.
   */
  private uploadAndDraw(vertexData: Float32Array): void {
    if (!this.gridVAO || !this.gridVBO) {
      console.error('❌ Grid rendering resources not initialized');
      return;
    }
    if (vertexData.length === 0) return;

    const gl = this.gl;

    // Upload vertex data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

    // Use tile renderer shader
    if (!this.shaderManager.useProgram('tileRenderer')) {
      console.error('❌ Failed to use tile renderer shader');
      return;
    }

    // Bind VAO and render
    gl.bindVertexArray(this.gridVAO);

    const vertexCount = vertexData.length / 23; // 23 components per vertex
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    gl.bindVertexArray(null);

    this.currentVertexCount = vertexCount;

    if (this.debug) {
      checkWebGLError(gl, 'grid batch rendering');
    }
  }

  /**
   * Generate vertex data for a batch of tiles
   */
  private generateBatchVertexData(tiles: TileData[], options: GridRenderOptions): Float32Array {
    // Write straight into a preallocated typed array (ENGINE-PERFORMANCE.md §D): every tile emits
    // exactly 6×23 = 138 floats and none is skipped, so the size is exact. This replaces a
    // ~5.2M-element `number[]` grown via `.push(...)` plus a final `new Float32Array(it)` copy —
    // the dominant allocation + GC cost of a full terrain rebuild, which the Chrome trace showed
    // is what the biggest renderer dips are made of. Output is byte-identical to the old path.
    const FLOATS_PER_TILE = 6 * 23;
    const out = new Float32Array(tiles.length * FLOATS_PER_TILE);
    let o = 0;
    const sampler = options.lightSampler;
    const lightTime = options.lightTime ?? 0;
    // Emitter reach. When a sampler is present but no emitters are lit (bounds ===
    // null) every tile is dark; when bounds is a rect we only sample tiles whose
    // quad overlaps it. `undefined` keeps the legacy sample-everything behaviour.
    const litBounds = options.litBounds;
    const noEmitters = sampler !== undefined && litBounds === null;

    for (const tile of tiles) {
      // Get character info from font atlas. For space/missing chars, render background only.
      const isSpace = !tile.char || tile.char === ' ';
      const charInfo = isSpace ? null : this.fontAtlas.characters.get(tile.char);
      if (!isSpace && !charInfo) {
        if (this.debug) {
          console.warn(`⚠️ Character '${tile.char}' not found in font atlas`);
        }
        // Fall through — render background quad with no glyph
      }

      // Calculate absolute world pixel position. The camera/pan offset is
      // applied in the vertex shader (u_viewOffset), so the buffer stays
      // valid across pans and never needs regenerating just to scroll.
      const screenX = tile.position.x * options.tileWidth;
      const screenY = tile.position.y * options.tileHeight;

      // Apply animation offset if present
      const offsetX = tile.animationOffset?.x || 0;
      const offsetY = tile.animationOffset?.y || 0;

      // Vertex quad fills the screen tile regardless of atlas tile size (UV coords reference the atlas
      // tile via charInfo.{x,y,width,height}). Oversized sprites (tile.scale > 1 — trees, large beasts)
      // grow the quad and ANCHOR it at the base cell's bottom-center, overflowing UPWARD + sideways so
      // the trunk/feet stay on the owning tile while the canopy/body rises into the tiles above.
      // scale === 1 (terrain, normal entities) reduces to the original full-cell quad exactly.
      const scale = tile.scale && tile.scale > 0 ? tile.scale : 1;
      const tileW = options.tileWidth;
      const tileH = options.tileHeight;
      const drawW = tileW * scale;
      const drawH = tileH * scale;
      const x1 = screenX + offsetX - (drawW - tileW) / 2; // always horizontally centered
      // Upscaled sprites (scale > 1 — trees, big beasts) anchor at the cell's BOTTOM so the canopy/body
      // grows upward off the base tile; downscaled marks (scale < 1 — ore veins) CENTER in the cell so
      // the speck sits in the middle of the rock rather than at its foot. scale === 1 reduces to both.
      const y1 =
        scale >= 1
          ? screenY + offsetY - (drawH - tileH)
          : screenY + offsetY + (tileH - drawH) / 2;
      const x2 = x1 + drawW;
      const y2 = y1 + drawH;

      // Calculate texture coordinates.
      // Use a UV of (0,0)→(0,0) for missing chars so sprite.a ≈ 0 → bg fills tile.
      const u1 = charInfo ? charInfo.x / this.fontAtlas.atlasWidth : 0;
      const v1 = charInfo ? charInfo.y / this.fontAtlas.atlasHeight : 0;
      const u2 = charInfo ? (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth : 0;
      const v2 = charInfo ? (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight : 0;

      // Get colors. The bitlands sprites are a white body + black line-work on magenta. The shader
      // blends a_foreground↔a_detail by sprite luminance: black px (luma 0) → a_foreground, white px
      // (luma 1) → a_detail. With no explicit detail set, map the white body to the tile colour and
      // the black line-work to a darkened shade, so each cell's own pattern survives the tint.
      // (Previously detail defaulted to the foreground, so black + white both became the tile colour
      // → flat fill, which made distinct cells like mud_brick_wall and mountain_wall identical.)
      const tileColor = [tile.foreground.r, tile.foreground.g, tile.foreground.b];
      const bg = [tile.background.r, tile.background.g, tile.background.b];
      const fg = tile.detail
        ? tileColor
        : [tileColor[0] * 0.3, tileColor[1] * 0.3, tileColor[2] * 0.3];
      const dt = tile.detail ? [tile.detail.r, tile.detail.g, tile.detail.b] : tileColor;
      const ol = tile.outline ? [tile.outline.r, tile.outline.g, tile.outline.b] : [0, 0, 0];
      // UV bounds for the current glyph (needed by outline edge-detection in fragment shader)
      const ub = charInfo
        ? [
            charInfo.x / this.fontAtlas.atlasWidth,
            charInfo.y / this.fontAtlas.atlasHeight,
            (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth,
            (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight
          ]
        : [0, 0, 0, 0];

      // UV corners — default (no rotation)
      let tlU = u1,
        tlV = v1; // top-left
      let trU = u2,
        trV = v1; // top-right
      let blU = u1,
        blV = v2; // bottom-left
      let brU = u2,
        brV = v2; // bottom-right

      // Rotate UV coords clockwise to spin the glyph within its quad
      if (tile.rotation === 90) {
        tlU = u1;
        tlV = v2;
        trU = u1;
        trV = v1;
        blU = u2;
        blV = v2;
        brU = u2;
        brV = v1;
      } else if (tile.rotation === 180) {
        tlU = u2;
        tlV = v2;
        trU = u1;
        trV = v2;
        blU = u2;
        blV = v1;
        brU = u1;
        brV = v1;
      } else if (tile.rotation === 270) {
        tlU = u2;
        tlV = v1;
        trU = u2;
        trV = v2;
        blU = u1;
        blV = v1;
        brU = u1;
        brV = v2;
      }

      // Per-corner dynamic light (Phase A2). Sample the light field at each
      // tile corner in WORLD coords; the GPU interpolates between them across
      // the quad, giving smooth gradients with no per-pixel cost.
      const wx = tile.position.x;
      const wy = tile.position.y;
      // Skip the four corner samples for tiles that can't be lit: no sampler
      // (lighting off → fully lit), no emitters (dark), or the tile quad lies
      // fully outside the emitter bounding box. This keeps lighting work
      // proportional to the lit area instead of the whole map.
      let Ltl: [number, number, number];
      let Ltr: [number, number, number];
      let Lbl: [number, number, number];
      let Lbr: [number, number, number];
      if (!sampler) {
        Ltl = Ltr = Lbl = Lbr = ONE_LIGHT;
      } else if (
        noEmitters ||
        (litBounds != null &&
          (wx + 1 < litBounds.minX ||
            wx > litBounds.maxX ||
            wy + 1 < litBounds.minY ||
            wy > litBounds.maxY))
      ) {
        Ltl = Ltr = Lbl = Lbr = ZERO_LIGHT;
      } else {
        Ltl = sampler(wx, wy, lightTime); // top-left
        Ltr = sampler(wx + 1, wy, lightTime); // top-right
        Lbl = sampler(wx, wy + 1, lightTime); // bottom-left
        Lbr = sampler(wx + 1, wy + 1, lightTime); // bottom-right
      }

      // Add vertex data for this character (2 triangles = 6 vertices)
      // Vertex format: x, y, u, v, fr, fg, fb, br, bg, bb, dr, dg, db, or, og, ob, u1, v1, u2, v2, lr, lg, lb (23 floats)
      const charVertices = [
        // Triangle 1
        x1,
        y1,
        tlU,
        tlV,
        fg[0],
        fg[1],
        fg[2],
        bg[0],
        bg[1],
        bg[2],
        dt[0],
        dt[1],
        dt[2],
        ol[0],
        ol[1],
        ol[2],
        ub[0],
        ub[1],
        ub[2],
        ub[3],
        Ltl[0],
        Ltl[1],
        Ltl[2], // Top-left
        x2,
        y1,
        trU,
        trV,
        fg[0],
        fg[1],
        fg[2],
        bg[0],
        bg[1],
        bg[2],
        dt[0],
        dt[1],
        dt[2],
        ol[0],
        ol[1],
        ol[2],
        ub[0],
        ub[1],
        ub[2],
        ub[3],
        Ltr[0],
        Ltr[1],
        Ltr[2], // Top-right
        x1,
        y2,
        blU,
        blV,
        fg[0],
        fg[1],
        fg[2],
        bg[0],
        bg[1],
        bg[2],
        dt[0],
        dt[1],
        dt[2],
        ol[0],
        ol[1],
        ol[2],
        ub[0],
        ub[1],
        ub[2],
        ub[3],
        Lbl[0],
        Lbl[1],
        Lbl[2], // Bottom-left

        // Triangle 2
        x2,
        y1,
        trU,
        trV,
        fg[0],
        fg[1],
        fg[2],
        bg[0],
        bg[1],
        bg[2],
        dt[0],
        dt[1],
        dt[2],
        ol[0],
        ol[1],
        ol[2],
        ub[0],
        ub[1],
        ub[2],
        ub[3],
        Ltr[0],
        Ltr[1],
        Ltr[2], // Top-right
        x2,
        y2,
        brU,
        brV,
        fg[0],
        fg[1],
        fg[2],
        bg[0],
        bg[1],
        bg[2],
        dt[0],
        dt[1],
        dt[2],
        ol[0],
        ol[1],
        ol[2],
        ub[0],
        ub[1],
        ub[2],
        ub[3],
        Lbr[0],
        Lbr[1],
        Lbr[2], // Bottom-right
        x1,
        y2,
        blU,
        blV,
        fg[0],
        fg[1],
        fg[2],
        bg[0],
        bg[1],
        bg[2],
        dt[0],
        dt[1],
        dt[2],
        ol[0],
        ol[1],
        ol[2],
        ub[0],
        ub[1],
        ub[2],
        ub[3],
        Lbl[0],
        Lbl[1],
        Lbl[2] // Bottom-left
      ];

      out.set(charVertices, o);
      o += FLOATS_PER_TILE;
    }

    return out;
  }

  /**
   * Initialize grid rendering resources
   */
  private initializeGridRendering(): void {
    const gl = this.gl;

    // Overlay (dynamic) pair. The static terrain layer no longer shares a buffer here — it owns a
    // grid of per-chunk VAO/VBOs created lazily in drawTerrainChunk (§E).
    this.gridVAO = gl.createVertexArray();
    this.gridVBO = gl.createBuffer();
    if (!this.gridVAO || !this.gridVBO) throw new Error('Failed to create grid VAO/VBO');
    this.setupGridAttribs(this.gridVAO, this.gridVBO);

    if (this.debug) {
      console.log('✅ Grid rendering resources initialized');
    }
  }

  /** Bind the tileRenderer's 8 vertex attributes (23-float interleaved stride) for a VAO/VBO. */
  private setupGridAttribs(vao: WebGLVertexArrayObject, vbo: WebGLBuffer): void {
    const gl = this.gl;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const stride = 23 * 4; // 23 floats per vertex, 4 bytes per float
    // [name, size, offset-in-floats]
    const attribs: [string, number, number][] = [
      ['a_position', 2, 0],
      ['a_texCoord', 2, 2],
      ['a_foreground', 3, 4],
      ['a_background', 3, 7],
      ['a_detail', 3, 10],
      ['a_outline', 3, 13],
      ['a_uvBounds', 4, 16],
      ['a_light', 3, 20]
    ];
    for (const [name, size, offset] of attribs) {
      const loc = this.shaderManager.getAttributeLocation('tileRenderer', name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
      }
    }
    gl.bindVertexArray(null);
  }

  /**
   * Estimate how many tiles were culled for statistics
   */
  private estimateCulledTiles(grid: GameGrid, viewport: Viewport): number {
    const totalTiles = grid.getAllTiles().length;
    const visibleArea = viewport.width * viewport.height;
    const estimatedVisible = Math.min(totalTiles, visibleArea);
    return Math.max(0, totalTiles - estimatedVisible);
  }

  /**
   * Get current render statistics
   */
  getStats(): GridRenderStats {
    return { ...this.stats };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    const gl = this.gl;

    if (this.gridVBO) {
      gl.deleteBuffer(this.gridVBO);
      this.gridVBO = null;
    }

    if (this.gridVAO) {
      gl.deleteVertexArray(this.gridVAO);
      this.gridVAO = null;
    }

    for (const chunk of this.terrainChunks.values()) {
      if (chunk.vbo) gl.deleteBuffer(chunk.vbo);
      if (chunk.vao) gl.deleteVertexArray(chunk.vao);
    }
    this.terrainChunks.clear();

    if (this.debug) {
      console.log('🧹 Grid renderer disposed');
    }
  }
}
