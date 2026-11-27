import {
  BufferUsage,
  ShaderStage,
  type BindingSlot,
  type GlslSources,
  type GpuBindGroup,
  type GpuBindGroupLayout,
  type GpuBuffer,
  type GpuDevice,
  type RenderPipelineDescriptor
} from '../gpu/device.js';
import { UniformBlock, uniformLayout, withBlocks } from '../gpu/uniforms.js';
import { samplersOf } from './samplers.js';

export const VIEW = uniformLayout('View', [
  { name: 'u_projection', type: 'mat4', precision: 'highp' },
  { name: 'u_canvas', type: 'vec2', precision: 'highp' },
  { name: 'u_viewOffset', type: 'vec2', precision: 'highp' },
  { name: 'u_zoom', type: 'vec2', precision: 'highp' }
]);

export const FRAME_GROUP = 0;
export const NEAREST_SAMPLER: BindingSlot = [FRAME_GROUP, 1];
export const LINEAR_SAMPLER: BindingSlot = [FRAME_GROUP, 2];

export interface FrameBindings {
  layout: GpuBindGroupLayout;
  group: GpuBindGroup;
  view: UniformBlock;
  buffer: GpuBuffer;
}

export type FramedPipeline = Omit<RenderPipelineDescriptor, 'label' | 'debug' | 'layout'> & {
  layout?: GpuBindGroupLayout[];
};

const made = new WeakMap<GpuDevice, FrameBindings>();

export function frameBindings(gpu: GpuDevice): FrameBindings {
  let frame = made.get(gpu);
  if (frame) return frame;
  const layout = gpu.createBindGroupLayout({
    label: 'frame',
    entries: [
      {
        binding: 0,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        buffer: { minBindingSize: VIEW.size }
      },
      { binding: 1, visibility: ShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
      { binding: 2, visibility: ShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
    ]
  });
  const buffer = gpu.createBuffer({
    label: 'view',
    size: VIEW.size,
    usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST
  });
  const samplers = samplersOf(gpu);
  const group = gpu.createBindGroup({
    label: 'frame',
    layout,
    entries: [
      { binding: 0, resource: { buffer, size: VIEW.size } },
      { binding: 1, resource: samplers.nearest },
      { binding: 2, resource: samplers.linear }
    ]
  });
  frame = { layout, group, view: new UniformBlock(VIEW), buffer };
  made.set(gpu, frame);
  return frame;
}

function withView(glsl: GlslSources): GlslSources {
  return {
    ...glsl,
    vertex: withBlocks(glsl.vertex, [VIEW]),
    fragment: withBlocks(glsl.fragment, [VIEW]),
    blocks: { ...glsl.blocks, View: { slot: [FRAME_GROUP, 0], offsets: VIEW.offsets } }
  };
}

export function framed(
  gpu: GpuDevice,
  desc: FramedPipeline
): Omit<RenderPipelineDescriptor, 'label' | 'debug'> {
  return {
    ...desc,
    glsl: withView(desc.glsl),
    layout: [frameBindings(gpu).layout, ...(desc.layout ?? [])]
  };
}
