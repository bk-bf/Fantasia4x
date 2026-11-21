import type { GameGrid } from './game-grid.js';
import type { TileData, Viewport } from './tile-types.js';
import type { CharacterRenderer } from './character-renderer.js';
import type { ShaderManager } from './shaders.js';
import type { FontAtlas } from './types.js';
import { checkWebGLError } from './utils.js';
import { paintedQuad } from './painted/manifest.js';

const ONE_LIGHT: [number, number, number] = [1, 1, 1];
const ZERO_LIGHT: [number, number, number] = [0, 0, 0];
const NO_OUTLINE = [0, 0, 0];
const PAINTED_UV_SHIFT = 2;
const paintedCorners = [0, 0, 0, 0];
const GLYPH_VERTEX_FLOATS = 24;
const ROW_VERTEX_FLOATS = 29;
const NO_VEIN = { x: -1, y: -1 };
export const ALPHA_CUT = 0.5;
export const SHADOW_FLOOR = 0.5 / 255;

export interface GridRenderOptions {
  tileWidth: number;
  tileHeight: number;
  viewportX: number;
  viewportY: number;
  viewportWidth: number;
  viewportHeight: number;
  lightSampler?: (wx: number, wy: number, time: number) => [number, number, number];
  lightTime?: number;
  lightVersion?: number;
  litBounds?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  renderAllTiles?: boolean;
  cacheVersion?: number;
  chunkLayer?: 'terrain' | 'resource' | 'resourceTall' | 'snow';
  pointLightActive?: boolean;
  rowPasses?: boolean;
}

export interface GridRenderStats {
  tilesRendered: number;
  tilesCulled: number;
  batchCount: number;
  renderTime: number;
}

interface TerrainChunk {
  vao: WebGLVertexArrayObject | null;
  vbo: WebGLBuffer | null;
  count: number;
  builtVersion: number;
  builtLight: number;
  builtDirty: number;
  lastFrame: number;
}

export class GridRenderer {
  private gl: WebGL2RenderingContext;
  private shaderManager: ShaderManager;
  private characterRenderer: CharacterRenderer;
  private fontAtlas: FontAtlas;
  private debug: boolean;
  private vertexFloats: number;
  private drawnChunks: TerrainChunk[] = [];

  private gridVAO: WebGLVertexArrayObject | null = null;
  private gridVBO: WebGLBuffer | null = null;
  private currentVertexCount: number = 0;

  private static readonly CHUNK_SIZE = 32;
  private static readonly CHUNK_MARGIN = 1;
  private static readonly CHUNK_EVICT_FRAMES = 240;
  private static readonly CHUNK_SWEEP_EVERY = 120;
  private terrainChunks: Map<string, TerrainChunk> = new Map();
  private resourceChunks: Map<string, TerrainChunk> = new Map();
  private resourceTallChunks: Map<string, TerrainChunk> = new Map();
  private snowChunks: Map<string, TerrainChunk> = new Map();
  private terrainFrame = 0;
  chunksRebuiltLastRender = 0;
  private chunkDirty = new Map<string, number>();
  private snowChunkDirty = new Map<string, number>();
  private chunkDirtyCounter = 0;

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
    debug = false,
    rowDepth = false
  ) {
    this.gl = gl;
    this.shaderManager = shaderManager;
    this.characterRenderer = characterRenderer;
    this.fontAtlas = fontAtlas;
    this.debug = debug;
    this.vertexFloats = rowDepth ? ROW_VERTEX_FLOATS : GLYPH_VERTEX_FLOATS;

    this.initializeGridRendering();
  }

  setFontAtlas(atlas: FontAtlas): void {
    this.fontAtlas = atlas;
  }

  renderGrid(grid: GameGrid, options: GridRenderOptions): GridRenderStats {
    const startTime = performance.now();

    if (options.cacheVersion !== undefined) {
      const chunks =
        options.chunkLayer === 'resource'
          ? this.resourceChunks
          : options.chunkLayer === 'resourceTall'
            ? this.resourceTallChunks
            : options.chunkLayer === 'snow'
              ? this.snowChunks
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

    const viewport: Viewport = {
      x: Math.floor(options.viewportX),
      y: Math.floor(options.viewportY),
      width: options.viewportWidth,
      height: options.viewportHeight
    };

    const visibleTiles = options.renderAllTiles
      ? grid.getAllTiles()
      : grid.getVisibleTiles(viewport);

    if (visibleTiles.length > 0) {
      const vertexData = this.generateBatchVertexData(visibleTiles, options);
      this.uploadAndDraw(vertexData, options.rowPasses === true);
    } else {
      this.currentVertexCount = 0;
    }

    const renderTime = performance.now() - startTime;
    this.stats = {
      tilesRendered: visibleTiles.length,
      tilesCulled: this.estimateCulledTiles(grid, viewport),
      batchCount: visibleTiles.length > 0 ? 1 : 0,
      renderTime
    };

    return { ...this.stats };
  }

  markTerrainChunksDirty(tiles: ReadonlyArray<{ x: number; y: number }>): void {
    const CS = GridRenderer.CHUNK_SIZE;
    for (const t of tiles) {
      const key = `${Math.floor(t.x / CS)}:${Math.floor(t.y / CS)}`;
      this.chunkDirty.set(key, ++this.chunkDirtyCounter);
    }
  }

  markSnowChunksDirty(tiles: ReadonlyArray<{ x: number; y: number }>): void {
    const CS = GridRenderer.CHUNK_SIZE;
    for (const t of tiles) {
      const key = `${Math.floor(t.x / CS)}:${Math.floor(t.y / CS)}`;
      this.snowChunkDirty.set(key, ++this.chunkDirtyCounter);
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
    this.chunksRebuiltLastRender = 0;

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

    const dirtyMap = options.chunkLayer === 'snow' ? this.snowChunkDirty : this.chunkDirty;

    let drawnVerts = 0;
    this.drawnChunks.length = 0;
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
          chunks,
          dirtyMap
        );
      }
    }

    if (options.rowPasses) this.drawShadowTexels(() => this.redrawChunks());
    if (frame % GridRenderer.CHUNK_SWEEP_EVERY === 0) this.evictStaleChunks(frame, chunks);
    this.currentVertexCount = drawnVerts;
    return drawnVerts / 6;
  }

  private drawTerrainChunk(
    grid: GameGrid,
    options: GridRenderOptions,
    cx: number,
    cy: number,
    version: number,
    lightVersion: number,
    frame: number,
    chunks: Map<string, TerrainChunk> = this.terrainChunks,
    dirtyMap: Map<string, number> = this.chunkDirty
  ): number {
    const gl = this.gl;
    const CS = GridRenderer.CHUNK_SIZE;
    const key = `${cx}:${cy}`;
    let chunk = chunks.get(key);
    const dirtyStamp = dirtyMap.get(key) ?? 0;

    if (
      !chunk ||
      chunk.builtVersion !== version ||
      chunk.builtLight !== lightVersion ||
      chunk.builtDirty !== dirtyStamp
    ) {
      this.chunksRebuiltLastRender++;
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
        chunk.count = 0;
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
        chunk.count = data.length / this.vertexFloats;
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
      this.drawnChunks.push(chunk);
      return chunk.count;
    }
    return 0;
  }

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

  private redrawChunks(): void {
    const gl = this.gl;
    for (const chunk of this.drawnChunks) {
      gl.bindVertexArray(chunk.vao);
      gl.drawArrays(gl.TRIANGLES, 0, chunk.count);
    }
    gl.bindVertexArray(null);
  }

  private drawShadowTexels(draw: () => void): void {
    const gl = this.gl;
    gl.depthMask(false);
    this.shaderManager.setUniform('tileRenderer', 'u_alphaCut', SHADOW_FLOOR);
    this.shaderManager.setUniform('tileRenderer', 'u_alphaCeil', ALPHA_CUT);
    draw();
    this.shaderManager.setUniform('tileRenderer', 'u_alphaCut', ALPHA_CUT);
    this.shaderManager.setUniform('tileRenderer', 'u_alphaCeil', 0);
    gl.depthMask(true);
  }

  private uploadAndDraw(vertexData: Float32Array, rowPasses = false): void {
    if (!this.gridVAO || !this.gridVBO) {
      console.error('❌ Grid rendering resources not initialized');
      return;
    }
    if (vertexData.length === 0) return;

    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

    if (!this.shaderManager.useProgram('tileRenderer')) {
      console.error('❌ Failed to use tile renderer shader');
      return;
    }

    gl.bindVertexArray(this.gridVAO);

    const vertexCount = vertexData.length / this.vertexFloats;
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    if (rowPasses) this.drawShadowTexels(() => gl.drawArrays(gl.TRIANGLES, 0, vertexCount));

    gl.bindVertexArray(null);

    this.currentVertexCount = vertexCount;

    if (this.debug) {
      checkWebGLError(gl, 'grid batch rendering');
    }
  }

  private generateBatchVertexData(tiles: TileData[], options: GridRenderOptions): Float32Array {
    const vertexFloats = this.vertexFloats;
    const FLOATS_PER_TILE = 6 * vertexFloats;
    const out = new Float32Array(tiles.length * FLOATS_PER_TILE);
    let o = 0;
    const sampler = options.lightSampler;
    const lightTime = options.lightTime ?? 0;
    const litBounds = options.litBounds;
    const noEmitters = sampler !== undefined && litBounds === null;

    for (const tile of tiles) {
      const isSpace = !tile.char || tile.char === ' ';
      const charInfo = isSpace ? null : this.fontAtlas.characters.get(tile.char);
      if (!isSpace && !charInfo) {
        if (this.debug) {
          console.warn(`⚠️ Character '${tile.char}' not found in font atlas`);
        }
      }

      const screenX = tile.position.x * options.tileWidth;
      const screenY = tile.position.y * options.tileHeight;

      const offsetX = tile.animationOffset?.x || 0;
      const offsetY = tile.animationOffset?.y || 0;

      const scale = tile.scale && tile.scale > 0 ? tile.scale : 1;
      const tileW = options.tileWidth;
      const tileH = options.tileHeight;
      const drawW = tileW * scale;
      const drawH = tileH * scale;
      let x1 = screenX + offsetX - (drawW - tileW) / 2;
      let y1 =
        scale >= 1 ? screenY + offsetY - (drawH - tileH) : screenY + offsetY + (tileH - drawH) / 2;
      let x2 = x1 + drawW;
      let y2 = y1 + drawH;

      let u1 = charInfo ? charInfo.x / this.fontAtlas.atlasWidth : 0;
      let v1 = charInfo ? charInfo.y / this.fontAtlas.atlasHeight : 0;
      let u2 = charInfo ? (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth : 0;
      let v2 = charInfo ? (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight : 0;

      const tileColor = [tile.foreground.r, tile.foreground.g, tile.foreground.b];
      const bg = [
        tile.background.r,
        tile.background.g,
        tile.background.b,
        tile.backgroundAlpha ?? 1
      ];
      const fg = tile.detail
        ? tileColor
        : [tileColor[0] * 0.3, tileColor[1] * 0.3, tileColor[2] * 0.3];
      const dt = tile.detail ? [tile.detail.r, tile.detail.g, tile.detail.b] : tileColor;
      let ol = tile.outline ? [tile.outline.r, tile.outline.g, tile.outline.b] : [0, 0, 0];
      let ub = charInfo
        ? [
            charInfo.x / this.fontAtlas.atlasWidth,
            charInfo.y / this.fontAtlas.atlasHeight,
            (charInfo.x + charInfo.width) / this.fontAtlas.atlasWidth,
            (charInfo.y + charInfo.height) / this.fontAtlas.atlasHeight
          ]
        : [0, 0, 0, 0];

      const painted = tile.painted;
      if (painted) {
        paintedQuad(
          painted,
          tile.position.x,
          tile.position.y,
          tileW,
          offsetX,
          offsetY,
          scale,
          tile.rotation === 90 || tile.rotation === 270,
          paintedCorners
        );
        x1 = paintedCorners[0];
        y1 = paintedCorners[1];
        x2 = paintedCorners[2];
        y2 = paintedCorners[3];
        u1 = painted.u1;
        v1 = painted.v1;
        u2 = painted.u2;
        v2 = painted.v2;
        ub = [u1 + PAINTED_UV_SHIFT, v1, u2 + PAINTED_UV_SHIFT, v2];
        ol = NO_OUTLINE;
      }

      let tlU = u1,
        tlV = v1;
      let trU = u2,
        trV = v1;
      let blU = u1,
        blV = v2;
      let brU = u2,
        brV = v2;

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

      const wx = tile.position.x;
      const wy = tile.position.y;
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
        Ltl = sampler(wx, wy, lightTime);
        Ltr = sampler(wx + 1, wy, lightTime);
        Lbl = sampler(wx, wy + 1, lightTime);
        Lbr = sampler(wx + 1, wy + 1, lightTime);
      }

      const charVertices = [
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
        bg[3],
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
        Ltl[2],
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
        bg[3],
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
        Ltr[2],
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
        bg[3],
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
        Lbl[2],

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
        bg[3],
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
        Ltr[2],
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
        bg[3],
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
        Lbr[2],
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
        bg[3],
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
        Lbl[2]
      ];

      if (vertexFloats === GLYPH_VERTEX_FLOATS) out.set(charVertices, o);
      else {
        const row = tile.depthRow ?? tile.position.y + offsetY / tileH;
        const vein = painted?.vein ?? NO_VEIN;
        for (let v = 0; v < 6; v++) {
          const at = o + v * ROW_VERTEX_FLOATS;
          for (let f = 0; f < GLYPH_VERTEX_FLOATS; f++)
            out[at + f] = charVertices[v * GLYPH_VERTEX_FLOATS + f];
          out[at + GLYPH_VERTEX_FLOATS] = row;
          out[at + GLYPH_VERTEX_FLOATS + 1] = vein.x;
          out[at + GLYPH_VERTEX_FLOATS + 2] = vein.y;
          out[at + GLYPH_VERTEX_FLOATS + 3] = tile.position.x;
          out[at + GLYPH_VERTEX_FLOATS + 4] = tile.position.y;
        }
      }
      o += FLOATS_PER_TILE;
    }

    return out;
  }

  private initializeGridRendering(): void {
    const gl = this.gl;

    this.gridVAO = gl.createVertexArray();
    this.gridVBO = gl.createBuffer();
    if (!this.gridVAO || !this.gridVBO) throw new Error('Failed to create grid VAO/VBO');
    this.setupGridAttribs(this.gridVAO, this.gridVBO);

    if (this.debug) {
      console.log('✅ Grid rendering resources initialized');
    }
  }

  private setupGridAttribs(vao: WebGLVertexArrayObject, vbo: WebGLBuffer): void {
    const gl = this.gl;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const stride = this.vertexFloats * 4;
    const attribs: [string, number, number][] = [
      ['a_position', 2, 0],
      ['a_texCoord', 2, 2],
      ['a_foreground', 3, 4],
      ['a_background', 4, 7],
      ['a_detail', 3, 11],
      ['a_outline', 3, 14],
      ['a_uvBounds', 4, 17],
      ['a_light', 3, 21]
    ];
    if (this.vertexFloats === ROW_VERTEX_FLOATS)
      attribs.push(['a_row', 1, GLYPH_VERTEX_FLOATS], ['a_vein', 4, GLYPH_VERTEX_FLOATS + 1]);
    for (const [name, size, offset] of attribs) {
      const loc = this.shaderManager.getAttributeLocation('tileRenderer', name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
      }
    }
    gl.bindVertexArray(null);
  }

  private estimateCulledTiles(grid: GameGrid, viewport: Viewport): number {
    const totalTiles = grid.getAllTiles().length;
    const visibleArea = viewport.width * viewport.height;
    const estimatedVisible = Math.min(totalTiles, visibleArea);
    return Math.max(0, totalTiles - estimatedVisible);
  }

  getStats(): GridRenderStats {
    return { ...this.stats };
  }

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
