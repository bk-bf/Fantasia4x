import type {
  BlendState,
  CompareFunction,
  GlslSources,
  GpuDevice,
  PrimitiveTopology,
  StencilFaceState,
  VertexBufferLayout,
  WgslSources
} from '../gpu/device.js';
import type { FramedPipeline } from './frameBindings.js';
import type { GroupBindings } from './passBindings.js';

export interface CanvasPipeline {
  vertex: string;
  fragment: string;
  wgsl?: string;
  attributes?: GlslSources['attributes'];
  buffers?: VertexBufferLayout[];
  topology: PrimitiveTopology;
  blend?: BlendState;
  depthCompare?: CompareFunction;
  depthWrite?: boolean;
  stencil?: StencilFaceState;
  bindings?: readonly GroupBindings[];
}

export function canvasPipeline(gpu: GpuDevice, p: CanvasPipeline): FramedPipeline {
  const depth = gpu.canvas.depthFormat;
  const bindings = p.bindings ?? [];
  return {
    ...(p.wgsl === undefined
      ? {}
      : { wgsl: bindings.reduce<WgslSources>((wgsl, b) => b.wgsl(wgsl), { code: p.wgsl }) }),
    glsl: bindings.reduce<GlslSources>((glsl, b) => b.glsl(glsl), {
      vertex: p.vertex,
      fragment: p.fragment,
      attributes: p.attributes ?? {}
    }),
    layout: bindings.map((b) => b.layout),
    vertex: { buffers: p.buffers ?? [] },
    primitive: { topology: p.topology },
    fragment: { targets: [{ format: gpu.canvas.format, blend: p.blend }] },
    ...(depth
      ? {
          depthStencil: {
            format: depth,
            depthCompare: p.depthCompare ?? 'always',
            depthWriteEnabled: p.depthWrite ?? false,
            ...(p.stencil && depth === 'depth24plus-stencil8'
              ? { stencilFront: p.stencil, stencilBack: p.stencil }
              : {})
          }
        }
      : {})
  };
}
