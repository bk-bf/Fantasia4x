import type { GameGrid } from './game-grid.js';
import { withOverlays, type TileData, type Viewport } from './tile-types.js';
import type { ShaderManager } from './shaders.js';
import type { FontAtlas } from './types.js';
import { tileQuad } from './drawnSprites.js';
import { tuftTiles } from './painted/tufts.js';
import { VertexArena } from './vertexArena.js';
import { BufferUsage, type GpuBuffer, type GpuDevice, type GpuRenderPass } from '../gpu/device.js';
import {
  GLYPH_VERTEX_FLOATS,
  ROW_VERTEX_FLOATS,
  TILE_PIPELINE,
  type TilePipeline
} from './tilePipelines.js';

const ONE_LIGHT: [number, number, number] = [1, 1, 1];
const ZERO_LIGHT: [number, number, number] = [0, 0, 0];
const NO_OUTLINE = [0, 0, 0];
const PAINTED_UV_SHIFT = 2;
const corners = [0, 0, 0, 0];
const NO_VEIN = { x: -1, y: -1, near: 0 };
export { ALPHA_CUT } from './drawnSprites.js';

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
  chunkLayer?: 'terrain' | 'resource' | 'resourceTall' | 'snow' | 'decor';
  pointLightActive?: boolean;
  rowPasses?: boolean;
  pipeline?: TilePipeline;
}

export interface GridRenderStats {
  tilesRendered: number;
  tilesCulled: number;
  batchCount: number;
  renderTime: number;
}

interface TerrainChunk {
  vbo: GpuBuffer | null;
  size: number;
  count: number;
  builtVersion: number;
  builtLight: number;
  builtDirty: number;
}

interface WarmState {
  cursor: number;
  sweepFor: string | null;
  done: boolean;
}

export class GridRenderer {
  private gpu: GpuDevice;
  private shaderManager: ShaderManager;
  private fontAtlas: FontAtlas;
  private debug: boolean;
  private vertexFloats: number;
  private drawnChunks: TerrainChunk[] = [];

  private arena: VertexArena | null = null;
  private currentVertexCount: number = 0;

  private static readonly CHUNK_SIZE = 32;
  private static readonly CHUNK_MARGIN = 1;
  private static readonly WARM_SCAN_PER_FRAME = 64;
  private terrainChunks: Map<string, TerrainChunk> = new Map();
  private resourceChunks: Map<string, TerrainChunk> = new Map();
  private resourceTallChunks: Map<string, TerrainChunk> = new Map();
  private snowChunks: Map<string, TerrainChunk> = new Map();
  private decorChunks: Map<string, TerrainChunk> = new Map();
  private warmState = new Map<Map<string, TerrainChunk>, WarmState>();
  chunksRebuiltLastRender = 0;
  skipBlendedGround = false;
  skipWaterIce = false;
  private chunkDirty = new Map<string, number>();
  private snowChunkDirty = new Map<string, number>();
  private decorChunkDirty = new Map<string, number>();
  private chunkDirtyCounter = 0;

  private stats: GridRenderStats = {
    tilesRendered: 0,
    tilesCulled: 0,
    batchCount: 0,
    renderTime: 0
  };

  constructor(
    gpu: GpuDevice,
    shaderManager: ShaderManager,
    fontAtlas: FontAtlas,
    debug = false,
    rowDepth = false
  ) {
    this.gpu = gpu;
    this.shaderManager = shaderManager;
    this.fontAtlas = fontAtlas;
    this.debug = debug;
    this.vertexFloats = rowDepth ? ROW_VERTEX_FLOATS : GLYPH_VERTEX_FLOATS;

    this.initializeGridRendering();
  }

  setFontAtlas(atlas: FontAtlas): void {
    this.fontAtlas = atlas;
  }

  renderGrid(pass: GpuRenderPass, grid: GameGrid, options: GridRenderOptions): GridRenderStats {
    const startTime = performance.now();

    if (options.cacheVersion !== undefined) {
      const chunks =
        options.chunkLayer === 'resource'
          ? this.resourceChunks
          : options.chunkLayer === 'resourceTall'
            ? this.resourceTallChunks
            : options.chunkLayer === 'snow'
              ? this.snowChunks
              : options.chunkLayer === 'decor'
                ? this.decorChunks
                : this.terrainChunks;
      const drawnTiles = this.renderTerrainChunked(pass, grid, options, chunks);
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

    const visibleTiles = withOverlays(
      options.renderAllTiles ? grid.getAllTiles() : grid.getVisibleTiles(viewport)
    );

    if (visibleTiles.length > 0) {
      const vertexData = this.generateBatchVertexData(visibleTiles, options);
      this.uploadAndDraw(pass, vertexData, options.rowPasses === true, options.pipeline);
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
    this.markDirty(this.snowChunkDirty, tiles);
  }

  markDecorChunksDirty(tiles: ReadonlyArray<{ x: number; y: number }>): void {
    this.markDirty(this.decorChunkDirty, tiles);
  }

  private markDirty(
    map: Map<string, number>,
    tiles: ReadonlyArray<{ x: number; y: number }>
  ): void {
    const CS = GridRenderer.CHUNK_SIZE;
    for (const t of tiles) {
      const key = `${Math.floor(t.x / CS)}:${Math.floor(t.y / CS)}`;
      map.set(key, ++this.chunkDirtyCounter);
    }
  }

  private renderTerrainChunked(
    pass: GpuRenderPass,
    grid: GameGrid,
    options: GridRenderOptions,
    chunks: Map<string, TerrainChunk> = this.terrainChunks
  ): number {
    const CS = GridRenderer.CHUNK_SIZE;
    const m = GridRenderer.CHUNK_MARGIN;
    const cacheVersion = options.cacheVersion ?? 0;
    const lightVersion = options.lightVersion ?? 0;
    this.chunksRebuiltLastRender = 0;

    const minTX = Math.floor(options.viewportX);
    const minTY = Math.floor(options.viewportY);
    const minCX = Math.floor(minTX / CS) - m;
    const minCY = Math.floor(minTY / CS) - m;
    const maxCX = Math.floor((minTX + options.viewportWidth) / CS) + m;
    const maxCY = Math.floor((minTY + options.viewportHeight) / CS) + m;

    const pipeline = options.pipeline ?? 'terrain';
    if (!this.use(pass, pipeline)) {
      console.error('❌ Failed to use tile renderer shader');
      return 0;
    }

    const dirtyMap =
      options.chunkLayer === 'snow'
        ? this.snowChunkDirty
        : options.chunkLayer === 'decor'
          ? this.decorChunkDirty
          : this.chunkDirty;

    let drawnVerts = 0;
    this.drawnChunks.length = 0;
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        drawnVerts += this.drawTerrainChunk(
          pass,
          grid,
          options,
          cx,
          cy,
          cacheVersion,
          lightVersion,
          chunks,
          dirtyMap
        );
      }
    }

    if (options.rowPasses) this.drawShadows(pass, pipeline, () => this.redrawChunks(pass));
    this.warmOneChunk(grid, options, cacheVersion, lightVersion, chunks, dirtyMap);
    this.currentVertexCount = drawnVerts;
    return drawnVerts / 6;
  }

  private drawTerrainChunk(
    pass: GpuRenderPass,
    grid: GameGrid,
    options: GridRenderOptions,
    cx: number,
    cy: number,
    version: number,
    lightVersion: number,
    chunks: Map<string, TerrainChunk> = this.terrainChunks,
    dirtyMap: Map<string, number> = this.chunkDirty
  ): number {
    const key = `${cx}:${cy}`;
    const dirtyStamp = dirtyMap.get(key) ?? 0;
    let chunk = chunks.get(key);
    if (
      !chunk ||
      chunk.builtVersion !== version ||
      chunk.builtLight !== lightVersion ||
      chunk.builtDirty !== dirtyStamp
    ) {
      this.chunksRebuiltLastRender++;
      chunk = this.buildChunk(grid, options, cx, cy, version, lightVersion, dirtyStamp, chunks);
      if (!chunk) return 0;
    }
    if (chunk.count > 0 && chunk.vbo) {
      pass.setVertexBuffer(0, chunk.vbo);
      pass.draw(chunk.count);
      this.drawnChunks.push(chunk);
      return chunk.count;
    }
    return 0;
  }

  private buildChunk(
    grid: GameGrid,
    options: GridRenderOptions,
    cx: number,
    cy: number,
    version: number,
    lightVersion: number,
    dirtyStamp: number,
    chunks: Map<string, TerrainChunk>
  ): TerrainChunk | undefined {
    const gpu = this.gpu;
    const CS = GridRenderer.CHUNK_SIZE;
    const key = `${cx}:${cy}`;
    let chunk = chunks.get(key);
    const region = grid.getTilesInRegion(cx * CS, cy * CS, CS, CS);
    const tiles =
      chunks === this.decorChunks
        ? region.flatMap(tuftTiles)
        : this.skipBlendedGround && chunks === this.terrainChunks
          ? region.flatMap((t) => (t.ground ? tuftTiles(t) : [t]))
          : this.skipWaterIce && chunks === this.snowChunks
            ? region.filter((t) => t.waterIce === undefined)
            : region;
    if (!chunk) {
      chunk = {
        vbo: null,
        size: 0,
        count: 0,
        builtVersion: version,
        builtLight: lightVersion,
        builtDirty: dirtyStamp
      };
      chunks.set(key, chunk);
    }
    if (tiles.length === 0) {
      chunk.count = 0;
    } else {
      const data = this.generateBatchVertexData(tiles, options);
      if (!chunk.vbo || chunk.size < data.byteLength) {
        gpu.destroyBuffer(chunk.vbo);
        chunk.vbo = gpu.createBuffer({
          size: data.byteLength,
          usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
        });
        chunk.size = data.byteLength;
      }
      gpu.queue.writeBuffer(chunk.vbo, 0, data);
      chunk.count = data.length / this.vertexFloats;
    }
    chunk.builtVersion = version;
    chunk.builtLight = lightVersion;
    chunk.builtDirty = dirtyStamp;
    return chunk;
  }

  private warmOneChunk(
    grid: GameGrid,
    options: GridRenderOptions,
    version: number,
    lightVersion: number,
    chunks: Map<string, TerrainChunk>,
    dirtyMap: Map<string, number>
  ): void {
    const bounds = grid.getBounds();
    if (!bounds) return;
    const CS = GridRenderer.CHUNK_SIZE;
    const cols = Math.floor(bounds.max.x / CS) + 1;
    const rows = Math.floor(bounds.max.y / CS) + 1;
    const total = cols * rows;
    const stamp = `${version}:${lightVersion}:${cols}x${rows}`;
    let state = this.warmState.get(chunks);
    if (!state) this.warmState.set(chunks, (state = { cursor: 0, sweepFor: null, done: false }));
    if (state.sweepFor !== stamp) {
      state.sweepFor = stamp;
      state.cursor = 0;
      state.done = false;
    }
    if (state.done) return;
    for (let scanned = 0; scanned < GridRenderer.WARM_SCAN_PER_FRAME; scanned++) {
      if (state.cursor >= total) {
        state.done = true;
        return;
      }
      const cx = state.cursor % cols;
      const cy = Math.floor(state.cursor / cols);
      state.cursor++;
      const chunk = chunks.get(`${cx}:${cy}`);
      if (chunk && chunk.builtVersion === version && chunk.builtLight === lightVersion) continue;
      const dirtyStamp = dirtyMap.get(`${cx}:${cy}`) ?? 0;
      this.buildChunk(grid, options, cx, cy, version, lightVersion, dirtyStamp, chunks);
      return;
    }
  }

  private redrawChunks(pass: GpuRenderPass): void {
    for (const chunk of this.drawnChunks) {
      if (!chunk.vbo) continue;
      pass.setVertexBuffer(0, chunk.vbo);
      pass.draw(chunk.count);
    }
  }

  private use(pass: GpuRenderPass, pipeline: TilePipeline): boolean {
    const made = this.shaderManager.pipeline(TILE_PIPELINE[pipeline]);
    if (made) pass.setPipeline(made);
    return made !== null;
  }

  private drawShadows(pass: GpuRenderPass, back: TilePipeline, draw: () => void): void {
    this.use(pass, 'shadow');
    this.shaderManager.setUniform('tileRenderer', 'u_shadowPass', 1);
    draw();
    this.shaderManager.setUniform('tileRenderer', 'u_shadowPass', 0);
    this.use(pass, back);
  }

  private uploadAndDraw(
    pass: GpuRenderPass,
    vertexData: Float32Array,
    rowPasses = false,
    pipeline: TilePipeline = 'terrain'
  ): void {
    if (!this.arena) {
      console.error('❌ Grid rendering resources not initialized');
      return;
    }
    if (vertexData.length === 0) return;

    const gpu = this.gpu;

    const first = this.arena.push(vertexData);

    if (!this.use(pass, pipeline)) {
      console.error('❌ Failed to use tile renderer shader');
      return;
    }

    pass.setVertexBuffer(0, this.arena.buffer!);

    const vertexCount = vertexData.length / this.vertexFloats;
    pass.draw(vertexCount, undefined, first);
    if (rowPasses) this.drawShadows(pass, pipeline, () => pass.draw(vertexCount, undefined, first));

    this.currentVertexCount = vertexCount;

    if (this.debug) {
      gpu.checkError('grid batch rendering');
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

      const offsetY = tile.animationOffset?.y || 0;
      const tileH = options.tileHeight;
      tileQuad(tile, options.tileWidth, tileH, corners);
      const [x1, y1, x2, y2] = corners;

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
        const row = tile.position.y + offsetY / tileH;
        const vein = painted?.vein ?? NO_VEIN;
        const sway = tile.rotation ? 0 : (painted?.sway ?? 0);
        const tree = tile.rotation ? 0 : (painted?.tree ?? 0);
        for (let v = 0; v < 6; v++) {
          const at = o + v * ROW_VERTEX_FLOATS;
          for (let f = 0; f < GLYPH_VERTEX_FLOATS; f++)
            out[at + f] = charVertices[v * GLYPH_VERTEX_FLOATS + f];
          out[at + GLYPH_VERTEX_FLOATS] = row;
          out[at + GLYPH_VERTEX_FLOATS + 1] = vein.x;
          out[at + GLYPH_VERTEX_FLOATS + 2] = vein.y;
          out[at + GLYPH_VERTEX_FLOATS + 3] = tile.position.x;
          out[at + GLYPH_VERTEX_FLOATS + 4] = tile.position.y;
          out[at + GLYPH_VERTEX_FLOATS + 5] = vein.near;
          out[at + GLYPH_VERTEX_FLOATS + 6] = sway;
          out[at + GLYPH_VERTEX_FLOATS + 7] = tree;
        }
      }
      o += FLOATS_PER_TILE;
    }

    return out;
  }

  private initializeGridRendering(): void {
    const gpu = this.gpu;

    this.arena = new VertexArena(gpu, this.vertexFloats * 4);

    if (this.debug) {
      console.log('✅ Grid rendering resources initialized');
    }
  }

  private estimateCulledTiles(grid: GameGrid, viewport: Viewport): number {
    const totalTiles = grid.getAllTiles().length;
    const visibleArea = viewport.width * viewport.height;
    const estimatedVisible = Math.min(totalTiles, visibleArea);
    return Math.max(0, totalTiles - estimatedVisible);
  }

  beginFrame(): void {
    this.arena?.beginFrame();
  }

  getStats(): GridRenderStats {
    return { ...this.stats };
  }

  dispose(): void {
    const gpu = this.gpu;

    this.arena?.destroy();
    this.arena = null;

    for (const chunks of [this.terrainChunks, this.decorChunks]) {
      for (const chunk of chunks.values()) if (chunk.vbo) gpu.destroyBuffer(chunk.vbo);
      chunks.clear();
    }

    if (this.debug) {
      console.log('🧹 Grid renderer disposed');
    }
  }
}
