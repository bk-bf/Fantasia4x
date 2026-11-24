import vertexSource from '../shaders/peak.vert.glsl?raw';
import fragmentSource from '../shaders/peak.frag.glsl?raw';
import type { GameGrid } from '../game-grid.js';
import type { ShaderManager } from '../shaders.js';
import { BASE_TILE_PX } from '../tile-types.js';
import type { LoadedPaintedTileset } from './loader.js';
import { paintedPieces } from './tileset.js';
import { withRockSurface } from './rockSurface.js';
import { PEAK_CHUNK, PEAK_HMAX, PeakBake, peakWindow, type PeakJob } from './peakBake.js';
import { PEAK_MASS, PEAK_TEXEL, PeakTiles, type TileAt } from './peakTiles.js';
import { LIGHT_FIELD_UNIT } from './lightPass.js';

const PROGRAM = 'peaks';
const ROCK_PIECES = 'rock';
export const PEAK_TILE_UNIT = 5;
const ATLAS_UNIT = 1;
const VEIN_UNIT = 3;
const CHUNK_UNIT = 0;
const MAX_CHUNKS = 48;
const STAGES_PER_FRAME = 2;

interface PeakView {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PeakFrame {
  projection: Float32Array;
  viewOffset: [number, number];
  zoom: [number, number];
  ambient: [number, number, number];
  fieldLit: boolean;
  tone: [number, number];
  rowPx: number;
  rowDepth: number;
}

export type PeakChunks = readonly Chunk[];

interface Chunk {
  x0: number;
  y0: number;
  tex: WebGLTexture | null;
  baked: boolean;
  stale: boolean;
  used: number;
}

export class Peaks {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly bake: PeakBake;
  private readonly painted: LoadedPaintedTileset;
  private readonly tiles = new PeakTiles();
  private readonly tileTex: WebGLTexture;
  private readonly vao: WebGLVertexArrayObject;
  private readonly at: Record<string, WebGLUniformLocation | null>;
  private readonly chunks = new Map<string, Chunk>();
  private terrain: GameGrid | null = null;
  private resource: GameGrid | null = null;
  private pendingAll = true;
  private pending: TileAt[] = [];
  private job: (PeakJob & { key: string }) | null = null;
  private snow = false;
  private frameNo = 0;

  static create(
    gl: WebGL2RenderingContext,
    shaders: ShaderManager,
    painted: LoadedPaintedTileset
  ): Peaks | null {
    const pieces = paintedPieces(ROCK_PIECES);
    if (!painted.top || !pieces) return null;
    const bake = PeakBake.create(gl, shaders, {
      atlas: painted.texture,
      atlasW: painted.tileset.atlasW,
      atlasH: painted.tileset.atlasH,
      tile: painted.tileset.tile,
      lift: painted.top.lift,
      pieces
    });
    if (!bake) return null;
    const made = shaders.createProgram(PROGRAM, vertexSource, withRockSurface(fragmentSource));
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[peaks] off:', made.error);
      bake.dispose();
      return null;
    }
    return new Peaks(gl, program, bake, painted);
  }

  private constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    bake: PeakBake,
    painted: LoadedPaintedTileset
  ) {
    this.gl = gl;
    this.program = program;
    this.bake = bake;
    this.painted = painted;
    this.vao = gl.createVertexArray()!;
    this.tileTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16UI,
      1,
      1,
      0,
      gl.RGBA_INTEGER,
      gl.UNSIGNED_SHORT,
      new Uint16Array(4)
    );
    const names = [
      'u_projection',
      'u_viewOffset',
      'u_zoom',
      'u_atlasScale',
      'u_rect',
      'u_peak',
      'u_chunk',
      'u_paintAtlas',
      'u_rockRamp',
      'u_snowRamp',
      'u_rockLift',
      'u_lightTexture',
      'u_fieldLit',
      'u_ambient',
      'u_saturation',
      'u_brightness',
      'u_rowPx',
      'u_rowDepth',
      'u_peakTileTexture',
      'u_veinTexture'
    ];
    this.at = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
  }

  setGrids(terrain: GameGrid, resource: GameGrid | null, dirty?: readonly TileAt[]): void {
    const fresh = terrain !== this.terrain || resource !== this.resource;
    this.terrain = terrain;
    this.resource = resource;
    if (fresh || !dirty || dirty.length === 0) {
      this.pendingAll = true;
      this.pending = [];
      return;
    }
    if (!this.pendingAll) for (const t of dirty) this.pending.push(t);
  }

  setSnow(on: boolean): void {
    if (on === this.snow) return;
    this.snow = on;
    for (const c of this.chunks.values()) c.stale = true;
  }

  bindTiles(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + PEAK_TILE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.activeTexture(gl.TEXTURE0);
  }

  private uploadTiles(rows?: { y0: number; y1: number }): void {
    const gl = this.gl;
    const { w, h, texels } = this.tiles;
    if (w === 0 || h === 0) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!rows)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16UI,
        w,
        h,
        0,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_SHORT,
        texels
      );
    else
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        rows.y0,
        w,
        rows.y1 - rows.y0,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_SHORT,
        texels.subarray(rows.y0 * w * PEAK_TEXEL, rows.y1 * w * PEAK_TEXEL)
      );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  private sync(): void {
    if (!this.terrain) return;
    if (this.pendingAll) {
      this.tiles.readAll(this.terrain, this.resource);
      this.pendingAll = false;
      this.pending = [];
      for (const c of this.chunks.values()) if (c.tex) this.gl.deleteTexture(c.tex);
      this.chunks.clear();
      this.job = null;
      this.uploadTiles();
      return;
    }
    if (this.pending.length === 0) return;
    const moved = this.tiles.read(this.terrain, this.resource, this.pending);
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const t of this.pending) {
      y0 = Math.min(y0, t.y - 2);
      y1 = Math.max(y1, t.y + 3);
    }
    this.pending = [];
    this.uploadTiles({ y0: Math.max(0, y0), y1: Math.min(this.tiles.h, y1) });
    for (const t of moved) this.staleAround(t);
  }

  private staleAround(t: TileAt): void {
    const tile = this.painted.tileset.tile;
    const lift = this.painted.top!.lift;
    for (const c of this.chunks.values()) {
      const win = peakWindow(c.x0, c.y0, lift);
      const px = t.x * tile;
      const py = t.y * tile;
      if (px + 2 * tile < win.x || px - tile > win.x + win.w) continue;
      if (py + 2 * tile < win.y || py - tile > win.y + win.h) continue;
      c.stale = true;
    }
  }

  private hasRock(x0: number, y0: number): boolean {
    const tile = this.painted.tileset.tile;
    const lift = this.painted.top!.lift;
    const tx0 = Math.max(0, Math.floor(x0 / tile) - 1);
    const tx1 = Math.min(this.tiles.w - 1, Math.floor((x0 + PEAK_CHUNK) / tile) + 1);
    const ty0 = Math.max(0, Math.floor((y0 + lift) / tile) - 1);
    const ty1 = Math.min(
      this.tiles.h - 1,
      Math.floor((y0 + PEAK_CHUNK + lift + PEAK_HMAX) / tile) + 1
    );
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++)
        if (this.tiles.flags[ty * this.tiles.w + tx] & PEAK_MASS) return true;
    return false;
  }

  private visible(view: PeakView): Chunk[] {
    const out: Chunk[] = [];
    const cx0 = Math.floor(view.x0 / PEAK_CHUNK);
    const cy0 = Math.floor(view.y0 / PEAK_CHUNK);
    const cx1 = Math.floor((view.x1 - 1) / PEAK_CHUNK);
    const cy1 = Math.floor((view.y1 - 1) / PEAK_CHUNK);
    const tile = this.painted.tileset.tile;
    const mapW = this.tiles.w * tile;
    const mapH = this.tiles.h * tile;
    for (let cy = Math.max(0, cy0); cy <= cy1; cy++)
      for (let cx = Math.max(0, cx0); cx <= cx1; cx++) {
        const x0 = cx * PEAK_CHUNK;
        const y0 = cy * PEAK_CHUNK;
        if (x0 >= mapW || y0 >= mapH) continue;
        const key = `${cx},${cy}`;
        let c = this.chunks.get(key);
        if (!c) {
          const rock = this.hasRock(x0, y0);
          c = { x0, y0, tex: null, baked: !rock, stale: false, used: 0 };
          this.chunks.set(key, c);
        }
        c.used = this.frameNo;
        out.push(c);
      }
    return out;
  }

  private evict(): void {
    if (this.chunks.size <= MAX_CHUNKS) return;
    const old = [...this.chunks.entries()]
      .filter(([key, c]) => c.used < this.frameNo && key !== this.job?.key)
      .sort((a, b) => a[1].used - b[1].used);
    for (const [key, c] of old.slice(0, this.chunks.size - MAX_CHUNKS)) {
      if (c.tex) this.gl.deleteTexture(c.tex);
      this.chunks.delete(key);
    }
  }

  frame(view: PeakView): Chunk[] {
    this.frameNo++;
    this.sync();
    if (this.tiles.w === 0) return [];
    const shown = this.visible(view);
    if (!this.job) {
      const cx = (view.x0 + view.x1) / 2;
      const cy = (view.y0 + view.y1) / 2;
      const due = shown
        .filter((c) => !c.baked || c.stale)
        .sort((a, b) => Math.hypot(a.x0 - cx, a.y0 - cy) - Math.hypot(b.x0 - cx, b.y0 - cy))[0];
      if (due) {
        if (this.hasRock(due.x0, due.y0)) {
          this.job = {
            key: `${due.x0 / PEAK_CHUNK},${due.y0 / PEAK_CHUNK}`,
            x0: due.x0,
            y0: due.y0,
            stage: 0,
            target: this.bake.chunkTexture(),
            snow: this.snow
          };
          due.stale = false;
        } else {
          if (due.tex) this.gl.deleteTexture(due.tex);
          due.tex = null;
          due.baked = true;
          due.stale = false;
        }
      }
    }
    for (let i = 0; i < STAGES_PER_FRAME && this.job; i++) this.advance();
    this.evict();
    return shown;
  }

  private advance(): void {
    const job = this.job!;
    const tile = this.painted.tileset.tile;
    const done = this.bake.step(job, this.tiles, [this.tiles.w * tile, this.tiles.h * tile]);
    if (!done) return;
    const c = this.chunks.get(job.key);
    if (c) {
      if (c.tex) this.gl.deleteTexture(c.tex);
      c.tex = job.target;
      c.baked = true;
    } else this.gl.deleteTexture(job.target);
    this.job = null;
  }

  draw(shown: readonly Chunk[], f: PeakFrame): number {
    const drawn = shown.filter((c) => c.tex);
    if (drawn.length === 0) return 0;
    const gl = this.gl;
    const top = this.painted.top!;
    const tile = this.painted.tileset.tile;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.at.u_projection, false, f.projection);
    gl.uniform2fv(this.at.u_viewOffset, f.viewOffset);
    gl.uniform2fv(this.at.u_zoom, f.zoom);
    gl.uniform1f(this.at.u_atlasScale, tile / BASE_TILE_PX);
    gl.uniform2f(this.at.u_rockRamp, top.ramp.x, top.ramp.y);
    gl.uniform2f(this.at.u_snowRamp, top.snow.x, top.snow.y);
    gl.uniform1f(this.at.u_rockLift, top.lift);
    gl.uniform1f(this.at.u_fieldLit, f.fieldLit ? 1 : 0);
    gl.uniform3fv(this.at.u_ambient, f.ambient);
    gl.uniform1f(this.at.u_saturation, f.tone[0]);
    gl.uniform1f(this.at.u_brightness, f.tone[1]);
    gl.uniform1f(this.at.u_rowPx, f.rowPx);
    gl.uniform1f(this.at.u_rowDepth, f.rowDepth);
    gl.uniform1i(this.at.u_peak, CHUNK_UNIT);
    gl.uniform1i(this.at.u_paintAtlas, ATLAS_UNIT);
    gl.uniform1i(this.at.u_lightTexture, LIGHT_FIELD_UNIT);
    gl.uniform1i(this.at.u_peakTileTexture, PEAK_TILE_UNIT);
    gl.uniform1i(this.at.u_veinTexture, VEIN_UNIT);
    gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.painted.texture);
    gl.activeTexture(gl.TEXTURE0 + VEIN_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, top.veins);
    this.bindTiles();
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0 + CHUNK_UNIT);
    for (const c of drawn) {
      gl.bindTexture(gl.TEXTURE_2D, c.tex);
      gl.uniform2i(this.at.u_chunk, c.x0, c.y0);
      gl.uniform4f(this.at.u_rect, c.x0, c.y0, c.x0 + PEAK_CHUNK, c.y0 + PEAK_CHUNK);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    gl.bindVertexArray(null);
    return drawn.length;
  }

  dispose(): void {
    const gl = this.gl;
    for (const c of this.chunks.values()) if (c.tex) gl.deleteTexture(c.tex);
    if (this.job) gl.deleteTexture(this.job.target);
    this.chunks.clear();
    gl.deleteTexture(this.tileTex);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    this.bake.dispose();
  }
}
