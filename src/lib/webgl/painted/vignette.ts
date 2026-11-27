import vertexSource from '../shaders/paintedLight.vert.glsl?raw';
import fragmentSource from '../shaders/paintedVignette.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import { clamp, dith } from '../../pixelArt/noise.js';
import type { GpuDevice, GpuRenderPass, GpuRenderPipeline, GpuUniform } from '../../gpu/device.js';
import { canvasPipeline } from '../canvasPipeline.js';

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
  private readonly program: GpuRenderPipeline;
  private readonly uCanvas: GpuUniform | null;
  private readonly uStrength: GpuUniform | null;

  static create(gpu: GpuDevice, shaders: ShaderManager): PaintedVignette | null {
    const made = shaders.createPipeline(
      PROGRAM,
      canvasPipeline(gpu, {
        vertex: vertexSource,
        fragment: fragmentSource,
        topology: 'triangle-list',
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
          alpha: { srcFactor: 'zero', dstFactor: 'one' }
        }
      })
    );
    const program = made.pipeline;
    if (!made.success || !program) {
      console.warn('[painted vignette] off:', made.error);
      return null;
    }
    return new PaintedVignette(gpu, program);
  }

  private constructor(gpu: GpuDevice, program: GpuRenderPipeline) {
    this.gpu = gpu;
    this.program = program;
    this.uCanvas = gpu.uniform(program, 'u_canvas');
    this.uStrength = gpu.uniform(program, 'u_strength');
  }

  draw(pass: GpuRenderPass, f: VignetteFrame): number {
    const strength = f.strength * vignetteAtZoom(f.tilePx);
    if (strength <= 0) return 0;
    const gpu = this.gpu;
    pass.setPipeline(this.program);
    gpu.setVec2fv(this.uCanvas, f.canvas);
    gpu.setF32(this.uStrength, strength);
    pass.draw(3);
    return 1;
  }

  dispose(): void {
    this.gpu.destroyRenderPipeline(this.program);
  }
}
