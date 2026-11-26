import vertexSource from './shaders/groundRing.vert.glsl?raw';
import fragmentSource from './shaders/groundRing.frag.glsl?raw';
import type { ShaderManager } from './shaders.js';
import type { GpuDevice, GpuPipeline, GpuUniform, GpuVertexLayout } from '../gpu/device.js';

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
  private readonly program: GpuPipeline;
  private readonly vao: GpuVertexLayout;
  private readonly at: Record<string, GpuUniform | null>;

  static create(gpu: GpuDevice, shaders: ShaderManager): GroundRings | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, fragmentSource);
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[ground rings] off:', made.error);
      return null;
    }
    return new GroundRings(gpu, program);
  }

  private constructor(gpu: GpuDevice, program: GpuPipeline) {
    this.gpu = gpu;
    this.program = program;
    this.vao = gpu.createVertexLayout()!;
    this.at = Object.fromEntries(
      ['u_canvas', 'u_area', 'u_ring', 'u_line', 'u_offset', 'u_color', 'u_shadow'].map((name) => [
        name,
        gpu.uniform(program, name)
      ])
    );
  }

  draw(rings: readonly GroundRing[], ink: RingInk, canvas: [number, number]): number {
    if (rings.length === 0) return 0;
    const gpu = this.gpu;
    const depth = gpu.depthTestEnabled();
    gpu.setDepthTest(false);
    gpu.setPipeline(this.program);
    gpu.setVertexLayout(this.vao);
    gpu.setVec2fv(this.at.u_canvas, canvas);
    gpu.setF32(this.at.u_line, ink.line);
    gpu.setF32(this.at.u_offset, SHADOW_OFFSET);
    gpu.setVec3fv(this.at.u_color, ink.color);
    gpu.setVec3fv(this.at.u_shadow, ink.shadow);
    for (const r of rings) {
      gpu.setVec4f(this.at.u_ring, r.x, r.y, r.w, r.h);
      gpu.setVec4f(this.at.u_area, r.x, r.y, r.w + SHADOW_OFFSET, r.h + SHADOW_OFFSET);
      gpu.draw('triangle-strip', 4);
    }
    gpu.setVertexLayout(null);
    if (depth) gpu.setDepthTest(true);
    return rings.length;
  }

  dispose(): void {
    this.gpu.destroyVertexLayout(this.vao);
    this.gpu.destroyPipeline(this.program);
  }
}
