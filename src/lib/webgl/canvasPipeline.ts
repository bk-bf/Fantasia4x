import type {
  BlendState,
  CompareFunction,
  GlslSources,
  GpuDevice,
  PrimitiveTopology,
  RenderPipelineDescriptor,
  VertexBufferLayout
} from '../gpu/device.js';

export interface CanvasPipeline {
  vertex: string;
  fragment: string;
  attributes?: GlslSources['attributes'];
  buffers?: VertexBufferLayout[];
  topology: PrimitiveTopology;
  blend?: BlendState;
  depthCompare?: CompareFunction;
  depthWrite?: boolean;
}

export function canvasPipeline(
  gpu: GpuDevice,
  p: CanvasPipeline
): Omit<RenderPipelineDescriptor, 'label' | 'debug'> {
  const depth = gpu.canvas.depthFormat;
  return {
    glsl: { vertex: p.vertex, fragment: p.fragment, attributes: p.attributes ?? {} },
    vertex: { buffers: p.buffers ?? [] },
    primitive: { topology: p.topology },
    fragment: { targets: [{ format: gpu.canvas.format, blend: p.blend }] },
    ...(depth
      ? {
          depthStencil: {
            format: depth,
            depthCompare: p.depthCompare ?? 'always',
            depthWriteEnabled: p.depthWrite ?? false
          }
        }
      : {})
  };
}
