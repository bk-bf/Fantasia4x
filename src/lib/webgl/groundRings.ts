import vertexSource from './shaders/groundRing.vert.glsl?raw';
import fragmentSource from './shaders/groundRing.frag.glsl?raw';
import wgslSource from './shaders/groundRing.wgsl?raw';
import type { ShaderManager } from './shaders.js';
import {
  ALPHA_BLEND,
  type GpuDevice,
  type GpuRenderPass,
  type GpuRenderPipeline
} from '../gpu/device.js';
import { uniformLayout } from '../gpu/uniforms.js';
import { canvasPipeline } from './canvasPipeline.js';
import { PASS_GROUP, PassBindings } from './passBindings.js';
import { DRAW_GROUP, DrawSlices } from './drawSlices.js';

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

export interface RingSet {
  list: readonly GroundRing[];
  ink: RingInk;
}

const RING_FRAME = uniformLayout('RingFrame', [
  { name: 'u_color', type: 'vec3', precision: 'highp' },
  { name: 'u_line', type: 'float', precision: 'highp' },
  { name: 'u_shadow', type: 'vec3', precision: 'highp' },
  { name: 'u_offset', type: 'float', precision: 'highp' }
]);

const RING_DRAW = uniformLayout('RingDraw', [
  { name: 'u_ring', type: 'vec4', precision: 'highp' },
  { name: 'u_area', type: 'vec4', precision: 'highp' }
]);

export class GroundRings {
  private count = 0;

  static create(gpu: GpuDevice, shaders: ShaderManager): GroundRings | null {
    const frame = new PassBindings(gpu, PROGRAM, [RING_FRAME]);
    const draws = new DrawSlices(gpu, PROGRAM, RING_DRAW);
    const made = shaders.createPipeline(
      PROGRAM,
      canvasPipeline(gpu, {
        vertex: vertexSource,
        fragment: fragmentSource,
        wgsl: wgslSource,
        topology: 'triangle-strip',
        blend: ALPHA_BLEND,
        bindings: [frame, draws]
      })
    );
    const program = made.pipeline;
    if (!made.success || !program) {
      frame.destroy();
      draws.destroy();
      console.warn('[ground rings] off:', made.error);
      return null;
    }
    return new GroundRings(gpu, program, frame, draws);
  }

  private constructor(
    private readonly gpu: GpuDevice,
    private readonly program: GpuRenderPipeline,
    private readonly frame: PassBindings,
    private readonly draws: DrawSlices
  ) {}

  prepare(set: RingSet | null): void {
    this.count = set?.list.length ?? 0;
    if (!set || this.count === 0) return;
    const { list: rings, ink } = set;
    this.frame.set('u_line', ink.line);
    this.frame.set('u_offset', SHADOW_OFFSET);
    this.frame.set('u_color', ink.color);
    this.frame.set('u_shadow', ink.shadow);
    this.frame.upload();
    rings.forEach((r, i) =>
      this.draws.stage(i, {
        u_ring: [r.x, r.y, r.w, r.h],
        u_area: [r.x, r.y, r.w + SHADOW_OFFSET, r.h + SHADOW_OFFSET]
      })
    );
    this.draws.upload(this.count);
  }

  encode(pass: GpuRenderPass): number {
    if (this.count === 0) return 0;
    pass.setPipeline(this.program);
    pass.setBindGroup(PASS_GROUP, this.frame.group());
    for (let i = 0; i < this.count; i++) {
      pass.setBindGroup(DRAW_GROUP, this.draws.group, [this.draws.offset(i)]);
      pass.draw(4);
    }
    return this.count;
  }

  dispose(): void {
    this.gpu.destroyRenderPipeline(this.program);
    this.frame.destroy();
    this.draws.destroy();
  }
}
