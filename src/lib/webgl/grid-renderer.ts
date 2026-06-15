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

  // Dedicated TERRAIN VAO/VBO. The terrain layer is static (changes only on cacheVersion bump),
  // so it gets its OWN buffer and is uploaded ONLY when its vertex data reference changes — not
  // every frame. Previously terrain shared gridVBO with the overlay, which clobbered it each
  // frame and forced a full ~21MB re-upload of the 38k-tile buffer every frame (~90ms).
  private terrainVAO: WebGLVertexArrayObject | null = null;
  private terrainVBO: WebGLBuffer | null = null;
  private terrainUploaded: Float32Array | null = null; // last data uploaded to terrainVBO
  private terrainVertexCount: number = 0;

  // Cached vertex buffer for the static terrain layer (see GridRenderOptions.cacheVersion).
  private terrainCache: {
    version: number;
    viewX: number;
    viewY: number;
    tileW: number;
    tileH: number;
    lightVersion: number;
    count: number;
    data: Float32Array;
  } | null = null;

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

    if (this.debug) {
      console.log(
        `🎯 Rendering ${visibleTiles.length} visible tiles in viewport ${viewport.width}x${viewport.height}`
      );
    }

    // Render tiles in batches. The cached terrain layer (cacheVersion set) draws from its own
    // persistent VBO and only re-uploads when its data reference changes; the dynamic overlay
    // (no cacheVersion) re-uploads every frame as before.
    if (visibleTiles.length > 0) {
      const vertexData = this.getVertexData(grid, visibleTiles, options);
      if (options.cacheVersion !== undefined) {
        this.uploadAndDrawTerrain(vertexData);
      } else {
        this.uploadAndDraw(vertexData);
      }
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
   * Resolve the vertex buffer for this draw, reusing the terrain cache when
   * possible. Only callers that pass `cacheVersion` (the static terrain layer)
   * are cached; per-frame layers like the pawn overlay always regenerate.
   */
  private getVertexData(
    grid: GameGrid,
    tiles: TileData[],
    options: GridRenderOptions
  ): Float32Array {
    if (options.cacheVersion === undefined) {
      return this.generateBatchVertexData(tiles, options);
    }

    // Geometry is now camera-independent (pan/zoom applied via shader uniforms,
    // ambient + flicker via uniforms), so the terrain buffer only needs rebuilding
    // when:
    //   - the grid content changes (cacheVersion bump),
    //   - the zoom (tile pixel size) changes, or
    //   - the EMITTER SET changes (a campfire is lit/extinguished/moved). The baked
    //     a_light is flicker-free and static per emitter set, so flicker animation
    //     no longer forces a rebuild — it's a per-fragment shader uniform now.
    const lightVersion = options.lightVersion ?? 0;

    const c = this.terrainCache;
    if (
      c &&
      c.version === options.cacheVersion &&
      c.tileW === options.tileWidth &&
      c.tileH === options.tileHeight &&
      c.lightVersion === lightVersion &&
      c.count === tiles.length
    ) {
      return c.data;
    }

    const data = this.generateBatchVertexData(tiles, options);
    this.terrainCache = {
      version: options.cacheVersion,
      viewX: 0,
      viewY: 0,
      tileW: options.tileWidth,
      tileH: options.tileHeight,
      lightVersion,
      count: tiles.length,
      data
    };
    return data;
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
   * Draw the static terrain layer from its dedicated VBO. Re-uploads ONLY when `vertexData` is a
   * different array than last time (i.e. the terrain cache was rebuilt) — otherwise it just binds
   * and draws the buffer already on the GPU, skipping the ~21MB/frame upload that dominated
   * renderCPU. `vertexData` is the terrainCache's stable reference, so identity == unchanged.
   */
  private uploadAndDrawTerrain(vertexData: Float32Array): void {
    if (!this.terrainVAO || !this.terrainVBO) {
      console.error('❌ Terrain rendering resources not initialized');
      return;
    }
    if (vertexData.length === 0) return;
    const gl = this.gl;

    if (vertexData !== this.terrainUploaded) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.terrainVBO);
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
      this.terrainUploaded = vertexData;
      this.terrainVertexCount = vertexData.length / 23; // 23 components per vertex
    }

    if (!this.shaderManager.useProgram('tileRenderer')) {
      console.error('❌ Failed to use tile renderer shader');
      return;
    }
    gl.bindVertexArray(this.terrainVAO);
    gl.drawArrays(gl.TRIANGLES, 0, this.terrainVertexCount);
    gl.bindVertexArray(null);

    this.currentVertexCount = this.terrainVertexCount;
    if (this.debug) {
      checkWebGLError(gl, 'terrain batch rendering');
    }
  }

  /**
   * Generate vertex data for a batch of tiles
   */
  private generateBatchVertexData(tiles: TileData[], options: GridRenderOptions): Float32Array {
    const vertexData: number[] = [];
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

      // Vertex quad always fills the full screen tile regardless of atlas tile size.
      // UV coords reference the atlas tile via charInfo.{x,y,width,height}.
      const tileW = options.tileWidth;
      const tileH = options.tileHeight;
      const x1 = screenX + offsetX;
      const y1 = screenY + offsetY;
      const x2 = screenX + tileW + offsetX;
      const y2 = screenY + tileH + offsetY;

      // Calculate texture coordinates.
      // Use a UV of (0,0)→(0,0) for missing chars so sprite.a ≈ 0 → bg fills tile.
      const u1 = charInfo ? charInfo.x / this.fontAtlas.atlasWidth : 0;
      const v1 = charInfo ? charInfo.y / this.fontAtlas.atlasHeight : 0;
      const u2 = charInfo ? (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth : 0;
      const v2 = charInfo ? (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight : 0;

      // Get colors — detail defaults to foreground when not set
      const fg = [tile.foreground.r, tile.foreground.g, tile.foreground.b];
      const bg = [tile.background.r, tile.background.g, tile.background.b];
      const dt = tile.detail ? [tile.detail.r, tile.detail.g, tile.detail.b] : fg;
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

      vertexData.push(...charVertices);
    }

    return new Float32Array(vertexData);
  }

  /**
   * Initialize grid rendering resources
   */
  private initializeGridRendering(): void {
    const gl = this.gl;

    // Overlay (dynamic) pair.
    this.gridVAO = gl.createVertexArray();
    this.gridVBO = gl.createBuffer();
    if (!this.gridVAO || !this.gridVBO) throw new Error('Failed to create grid VAO/VBO');
    this.setupGridAttribs(this.gridVAO, this.gridVBO);

    // Terrain (static) pair — same attribute layout, separate buffer so the overlay can't
    // clobber it (which used to force a full re-upload every frame).
    this.terrainVAO = gl.createVertexArray();
    this.terrainVBO = gl.createBuffer();
    if (!this.terrainVAO || !this.terrainVBO) throw new Error('Failed to create terrain VAO/VBO');
    this.setupGridAttribs(this.terrainVAO, this.terrainVBO);

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

    if (this.terrainVBO) {
      gl.deleteBuffer(this.terrainVBO);
      this.terrainVBO = null;
    }
    if (this.terrainVAO) {
      gl.deleteVertexArray(this.terrainVAO);
      this.terrainVAO = null;
    }
    this.terrainUploaded = null;

    if (this.debug) {
      console.log('🧹 Grid renderer disposed');
    }
  }
}
