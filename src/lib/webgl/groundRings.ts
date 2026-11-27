import vertexSource from './shaders/groundRing.vert.glsl?raw';
import fragmentSource from './shaders/groundRing.frag.glsl?raw';
import type { ShaderManager } from './shaders.js';
import {
  ALPHA_BLEND,
  type GpuDevice,
  type GpuRenderPass,
  type GpuRenderPipeline,
  type GpuUniform
} from '../gpu/device.js';
import { canvasPipeline } from './canvasPipeline.js';

const PROGRAM = 'groundRing';
const SHADOW_OFFSET = 1;

export interface GroundRing {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RingInk {
  color: readonly [number, number, number];
  shadow: readonly [number, number, number];
  line: number;
}

export class GroundRings {
  private readonly gpu: GpuDevice;
  private readonly program: GpuRenderPipeline;
  private readonly at: Record<string, GpuUniform | null>;

  static create(gpu: GpuDevice, shaders: ShaderManager): GroundRings | null {
    const made = shaders.createPipeline(
      PROGRAM,
      canvasPipeline(gpu, {
        vertex: vertexSource,
        fragment: fragmentSource,
        topology: 'triangle-strip',
        blend: ALPHA_BLEND
      })
    );
    const program = made.pipeline;
    if (!made.success || !program) {
      console.warn('[ground rings] off:', made.error);
      return null;
    }
    return new GroundRings(gpu, program);
  }

  private constructor(gpu: GpuDevice, program: GpuRenderPipeline) {
    this.gpu = gpu;
    this.program = program;
    this.at = Object.fromEntries(
      ['u_canvas', 'u_area', 'u_ring', 'u_line', 'u_offset', 'u_color', 'u_shadow'].map((name) => [
        name,
        gpu.uniform(program, name)
      ])
    );
  }

  draw(
    pass: GpuRenderPass,
    rings: readonly GroundRing[],
    ink: RingInk,
    canvas: [number, number]
  ): number {
    if (rings.length === 0) return 0;
    const gpu = this.gpu;
    pass.setPipeline(this.program);
    gpu.setVec2fv(this.at.u_canvas, canvas);
    gpu.setF32(this.at.u_line, ink.line);
    gpu.setF32(this.at.u_offset, SHADOW_OFFSET);
    gpu.setVec3fv(this.at.u_color, ink.color);
    gpu.setVec3fv(this.at.u_shadow, ink.shadow);
    for (const r of rings) {
      gpu.setVec4f(this.at.u_ring, r.x, r.y, r.w, r.h);
      gpu.setVec4f(this.at.u_area, r.x, r.y, r.w + SHADOW_OFFSET, r.h + SHADOW_OFFSET);
      pass.draw(4);
    }
    return rings.length;
  }

  dispose(): void {
    this.gpu.destroyRenderPipeline(this.program);
  }
}
