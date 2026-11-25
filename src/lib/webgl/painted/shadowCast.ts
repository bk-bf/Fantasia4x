import vertexSource from '../shaders/paintedLight.vert.glsl?raw';
import fragmentSource from '../shaders/paintedShadow.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import type { GameGrid, GridUpdateEvent } from '../game-grid.js';
import type { TileRect } from './lightGrade.js';

const PROGRAM = 'paintedShadow';
export const CAST_UNIT = 8;
export const SHADOW_SHADE: [number, number, number] = [0.56, 0.56, 0.68];
export const SHADOW_DEPTH = 0.75;
export const MIN_SHADOW_TILE_PX = 6;
export const SHADOW_REFRESH_MS = 250;

export function rebuildDue(
  built: { rect: TileRect | null; at: number },
  rect: TileRect,
  now: number
): boolean {
  const r = built.rect;
  const moved = !r || r.x !== rect.x || r.y !== rect.y || r.w !== rect.w || r.h !== rect.h;
  return moved || now - built.at >= SHADOW_REFRESH_MS;
}

export interface CastFrame {
  canvas: [number, number];
  viewOffset: [number, number];
  zoom: [number, number];
  artPerBase: number;
  artTile: number;
  view: TileRect;
  casters: readonly (GameGrid | null)[];
}

export function castHeights(
  casters: readonly (GameGrid | null)[],
  view: TileRect,
  out: Uint8Array
): boolean {
  let any = false;
  for (let j = 0; j < view.h; j++)
    for (let i = 0; i < view.w; i++) {
      let h = 0;
      for (const grid of casters) {
        const cast = grid?.getTile(view.x + i, view.y + j)?.painted?.cast ?? 0;
        if (cast > h) h = cast;
      }
      out[j * view.w + i] = h;
      if (h > 0) any = true;
    }
  return any;
}

export class PaintedShadowCast {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly texture: WebGLTexture;
  private readonly at: Record<string, WebGLUniformLocation | null>;
  private heights = new Uint8Array(0);
  private builtKey = '';
  private builtRect: TileRect | null = null;
  private builtAt = 0;
  private casts = false;
  private changes = 0;
  private watched: (GameGrid | null)[] = [];
  private unwatch: (() => void)[] = [];

  static create(gl: WebGL2RenderingContext, shaders: ShaderManager): PaintedShadowCast | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, fragmentSource);
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[painted shadows] cast off:', made.error);
      return null;
    }
    return new PaintedShadowCast(gl, program);
  }

  private constructor(gl: WebGL2RenderingContext, program: WebGLProgram) {
    this.gl = gl;
    this.program = program;
    this.vao = gl.createVertexArray()!;
    this.texture = gl.createTexture()!;
    const names = [
      'u_canvas',
      'u_viewOffset',
      'u_zoom',
      'u_artPerBase',
      'u_tileArt',
      'u_heights',
      'u_origin',
      'u_shade',
      'u_depth'
    ];
    this.at = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
  }

  private watch(casters: readonly (GameGrid | null)[]): void {
    if (casters.length === this.watched.length && casters.every((g, i) => g === this.watched[i]))
      return;
    for (const off of this.unwatch) off();
    this.watched = [...casters];
    this.unwatch = casters.flatMap((g) =>
      g
        ? [
            g.subscribe((e) => {
              if (this.touchesCast(e)) this.changes++;
            })
          ]
        : []
    );
    this.changes++;
  }

  private touchesCast(event: GridUpdateEvent): boolean {
    const r = this.builtRect;
    if (event.type === 'clear' || !r) return true;
    for (const t of event.tiles) {
      const p = t.position;
      if (!p) return true;
      const i = p.x - r.x;
      const j = p.y - r.y;
      if (i < 0 || j < 0 || i >= r.w || j >= r.h) continue;
      if ((t.painted?.cast ?? 0) > 0 || this.heights[j * r.w + i] > 0) return true;
    }
    return false;
  }

  private rebuild(f: CastFrame, rect: TileRect): void {
    const key = `${rect.x},${rect.y},${rect.w},${rect.h},${this.changes}`;
    if (key === this.builtKey) return;
    const now = performance.now();
    if (!rebuildDue({ rect: this.builtRect, at: this.builtAt }, rect, now)) return;
    this.builtKey = key;
    this.builtRect = rect;
    this.builtAt = now;
    if (this.heights.length !== rect.w * rect.h) this.heights = new Uint8Array(rect.w * rect.h);
    this.casts = castHeights(f.casters, rect, this.heights);
    if (!this.casts) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + CAST_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      rect.w,
      rect.h,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      this.heights
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }

  draw(f: CastFrame): number {
    this.watch(f.casters);
    if (f.canvas[0] / f.view.w < MIN_SHADOW_TILE_PX) return 0;
    const rect = {
      x: Math.floor(f.view.x) - 1,
      y: Math.floor(f.view.y) - 1,
      w: Math.ceil(f.view.w) + 2,
      h: Math.ceil(f.view.h) + 2
    };
    this.rebuild(f, rect);
    if (!this.casts) return 0;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0 + CAST_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2fv(this.at.u_canvas, f.canvas);
    gl.uniform2fv(this.at.u_viewOffset, f.viewOffset);
    gl.uniform2fv(this.at.u_zoom, f.zoom);
    gl.uniform1f(this.at.u_artPerBase, f.artPerBase);
    gl.uniform1f(this.at.u_tileArt, f.artTile);
    gl.uniform1i(this.at.u_heights, CAST_UNIT);
    gl.uniform2i(this.at.u_origin, rect.x, rect.y);
    gl.uniform3fv(this.at.u_shade, SHADOW_SHADE);
    gl.uniform1f(this.at.u_depth, SHADOW_DEPTH);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    return 1;
  }

  dispose(): void {
    for (const off of this.unwatch) off();
    this.unwatch = [];
    this.gl.deleteTexture(this.texture);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
