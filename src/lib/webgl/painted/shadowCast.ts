import vertexSource from '../shaders/paintedLight.vert.glsl?raw';
import fragmentSource from '../shaders/paintedShadow.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import type { GameGrid, GridUpdateEvent } from '../game-grid.js';
import type { TileRect } from './lightGrade.js';
import type {
  GpuDevice,
  GpuPipeline,
  GpuTexture,
  GpuUniform,
  GpuVertexLayout
} from '../../gpu/device.js';

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
  private readonly gpu: GpuDevice;
  private readonly program: GpuPipeline;
  private readonly vao: GpuVertexLayout;
  private readonly texture: GpuTexture;
  private readonly at: Record<string, GpuUniform | null>;
  private heights = new Uint8Array(0);
  private builtKey = '';
  private builtRect: TileRect | null = null;
  private builtAt = 0;
  private casts = false;
  private changes = 0;
  private watched: (GameGrid | null)[] = [];
  private unwatch: (() => void)[] = [];

  static create(gpu: GpuDevice, shaders: ShaderManager): PaintedShadowCast | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, fragmentSource);
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[painted shadows] cast off:', made.error);
      return null;
    }
    return new PaintedShadowCast(gpu, program);
  }

  private constructor(gpu: GpuDevice, program: GpuPipeline) {
    this.gpu = gpu;
    this.program = program;
    this.vao = gpu.createVertexLayout()!;
    this.texture = gpu.createTexture()!;
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
    this.at = Object.fromEntries(names.map((n) => [n, gpu.uniform(program, n)]));
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
    const gpu = this.gpu;
    gpu.setTextureSlot(CAST_UNIT);
    gpu.bindTexture(this.texture);
    gpu.setUnpackAlignment(1);
    gpu.writeTexture({ format: 'r8unorm', width: rect.w, height: rect.h }, this.heights);
    gpu.setUnpackAlignment(4);
    gpu.setTextureSlot(0);
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
    const gpu = this.gpu;
    gpu.setPipeline(this.program);
    gpu.setTextureSlot(CAST_UNIT);
    gpu.bindTexture(this.texture);
    gpu.setTextureSlot(0);
    gpu.setVec2fv(this.at.u_canvas, f.canvas);
    gpu.setVec2fv(this.at.u_viewOffset, f.viewOffset);
    gpu.setVec2fv(this.at.u_zoom, f.zoom);
    gpu.setF32(this.at.u_artPerBase, f.artPerBase);
    gpu.setF32(this.at.u_tileArt, f.artTile);
    gpu.setI32(this.at.u_heights, CAST_UNIT);
    gpu.setVec2i(this.at.u_origin, rect.x, rect.y);
    gpu.setVec3fv(this.at.u_shade, SHADOW_SHADE);
    gpu.setF32(this.at.u_depth, SHADOW_DEPTH);
    gpu.setVertexLayout(this.vao);
    gpu.draw('triangle-list', 3);
    gpu.setVertexLayout(null);
    return 1;
  }

  dispose(): void {
    for (const off of this.unwatch) off();
    this.unwatch = [];
    this.gpu.destroyTexture(this.texture);
    this.gpu.destroyVertexLayout(this.vao);
    this.gpu.destroyPipeline(this.program);
  }
}
