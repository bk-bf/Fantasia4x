import vertexSource from '../shaders/paintedLight.vert.glsl?raw';
import fragmentSource from '../shaders/paintedVignette.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import { clamp, dith } from '../../pixelArt/noise.js';
import type { GpuDevice, GpuPipeline, GpuUniform, GpuVertexLayout } from '../../gpu/device.js';

const PROGRAM = 'paintedVignette';
export const VIGNETTE_START = 0.62;
export const VIGNETTE_SPAN = 0.8;
export const VIGNETTE_STEPS = 4;
export const VIGNETTE_FULL_TILE_PX = 32;
export const VIGNETTE_GONE_TILE_PX = 16;

export function vignetteAtZoom(tilePx: number): number {
  const t = clamp(
    (tilePx - VIGNETTE_GONE_TILE_PX) / (VIGNETTE_FULL_TILE_PX - VIGNETTE_GONE_TILE_PX),
    0,
    1
  );
  return t * t * (3 - 2 * t);
}

export function vignetteAlpha(
  x: number,
  y: number,
  w: number,
  h: number,
  strength: number
): number {
  const cx = Math.max(0.5, (w - 1) / 2);
  const cy = Math.max(0.5, (h - 1) / 2);
  const v = clamp(
    (Math.hypot((x - cx) / cx, (y - cy) / cy) - VIGNETTE_START) / VIGNETTE_SPAN,
    0,
    1
  );
  const q = Math.min(VIGNETTE_STEPS, Math.floor(v * v * (3 - 2 * v) * VIGNETTE_STEPS + dith(x, y)));
  return q * strength;
}

export interface VignetteFrame {
  canvas: [number, number];
  strength: number;
  tilePx: number;
}

export class PaintedVignette {
  private readonly gpu: GpuDevice;
  private readonly program: GpuPipeline;
  private readonly vao: GpuVertexLayout;
  private readonly uCanvas: GpuUniform | null;
  private readonly uStrength: GpuUniform | null;

  static create(gpu: GpuDevice, shaders: ShaderManager): PaintedVignette | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, fragmentSource);
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[painted vignette] off:', made.error);
      return null;
    }
    return new PaintedVignette(gpu, program);
  }

  private constructor(gpu: GpuDevice, program: GpuPipeline) {
    this.gpu = gpu;
    this.program = program;
    this.vao = gpu.createVertexLayout()!;
    this.uCanvas = gpu.uniform(program, 'u_canvas');
    this.uStrength = gpu.uniform(program, 'u_strength');
  }

  draw(f: VignetteFrame): number {
    const strength = f.strength * vignetteAtZoom(f.tilePx);
    if (strength <= 0) return 0;
    const gpu = this.gpu;
    gpu.setPipeline(this.program);
    gpu.setVec2fv(this.uCanvas, f.canvas);
    gpu.setF32(this.uStrength, strength);
    gpu.setVertexLayout(this.vao);
    gpu.setBlending(true);
    gpu.setBlendFuncSeparate('src-alpha', 'one-minus-src-alpha', 'zero', 'one');
    gpu.draw('triangle-list', 3);
    gpu.setBlending(false);
    gpu.setVertexLayout(null);
    return 1;
  }

  dispose(): void {
    this.gpu.destroyVertexLayout(this.vao);
    this.gpu.destroyPipeline(this.program);
  }
}
