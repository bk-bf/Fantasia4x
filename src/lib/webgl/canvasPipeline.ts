import type {
  BlendState,
  CompareFunction,
  GlslSources,
  GpuDevice,
  PrimitiveTopology,
  VertexBufferLayout
} from '../gpu/device.js';
import type { FramedPipeline } from './frameBindings.js';
import type { GroupBindings } from './passBindings.js';

export interface CanvasPipeline {
  vertex: string;
  fragment: string;
  attributes?: GlslSources['attributes'];
  buffers?: VertexBufferLayout[];
  topology: PrimitiveTopology;
  blend?: BlendState;
  depthCompare?: CompareFunction;
  depthWrite?: boolean;
  bindings?: readonly GroupBindings[];
}

export function canvasPipeline(gpu: GpuDevice, p: CanvasPipeline): FramedPipeline {
  const depth = gpu.canvas.depthFormat;
  return {
    glsl: (p.bindings ?? []).reduce<GlslSources>((glsl, b) => b.glsl(glsl), {
      vertex: p.vertex,
      fragment: p.fragment,
      attributes: p.attributes ?? {}
    }),
    layout: (p.bindings ?? []).map((b) => b.layout),
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
