declare const handle: unique symbol;
type Handle<K extends string> = { readonly [handle]: K };

export type GpuBuffer = Handle<'buffer'>;
export type GpuTexture = Handle<'texture'>;
export type GpuCommandBuffer = Handle<'command-buffer'>;
export type GpuBindGroupLayout = Handle<'bind-group-layout'>;
export type GpuBindGroup = Handle<'bind-group'>;

export const ShaderStage = { VERTEX: 1, FRAGMENT: 2 } as const;

export type BindGroupLayoutEntry =
  | {
      binding: number;
      visibility: number;
      buffer: { hasDynamicOffset?: boolean; minBindingSize: number };
    }
  | {
      binding: number;
      visibility: number;
      texture: { sampleType: 'float' | 'unfilterable-float' | 'uint' };
    }
  | { binding: number; visibility: number; sampler: { type: 'filtering' | 'non-filtering' } };

export interface BindGroupLayoutDescriptor {
  label?: string;
  entries: BindGroupLayoutEntry[];
}

export interface BufferBinding {
  buffer: GpuBuffer;
  offset?: number;
  size: number;
}

export type BindingResource = BufferBinding | GpuTexture | GpuSampler;

export interface BindGroupDescriptor {
  label?: string;
  layout: GpuBindGroupLayout;
  entries: { binding: number; resource: BindingResource }[];
}
export type GpuRenderPipeline = Handle<'render-pipeline'>;
export type GpuShaderModule = Handle<'shader-module'>;
export type GpuSampler = Handle<'sampler'>;

export type TextureFormat =
  | 'rgba8unorm'
  | 'rg8unorm'
  | 'r8unorm'
  | 'r8uint'
  | 'rgba16uint'
  | 'rgba16float'
  | 'rgba32float';

export type FilterMode = 'nearest' | 'linear';
export type AddressMode = 'clamp-to-edge' | 'repeat' | 'mirror-repeat';

export interface SamplerDescriptor {
  minFilter: FilterMode;
  magFilter: FilterMode;
  addressModeU: AddressMode;
  addressModeV: AddressMode;
}

export const TextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 } as const;

export interface TextureDescriptor {
  label?: string;
  format: TextureFormat;
  width: number;
  height: number;
  usage: number;
}

export function bytesPerTexel(format: TextureFormat): number {
  switch (format) {
    case 'r8unorm':
    case 'r8uint':
      return 1;
    case 'rg8unorm':
      return 2;
    case 'rgba8unorm':
      return 4;
    case 'rgba16uint':
    case 'rgba16float':
      return 8;
    case 'rgba32float':
      return 16;
  }
}

export function halfFloats(values: ArrayLike<number>): Uint16Array {
  return new Uint16Array(Float16Array.from(values).buffer);
}

export interface TextureCopyDestination {
  texture: GpuTexture;
  origin?: { x: number; y: number };
}

export interface Extent {
  width: number;
  height: number;
}

export interface GpuQueue {
  writeBuffer(
    buffer: GpuBuffer,
    offset: number,
    data: ArrayBufferView,
    dataOffset?: number,
    size?: number
  ): void;
  writeTexture(
    destination: TextureCopyDestination,
    data: ArrayBufferView,
    layout: { bytesPerRow: number },
    size: Extent
  ): void;
  submit(buffers: GpuCommandBuffer[]): void;
}

export const BufferUsage = { VERTEX: 1, UNIFORM: 2, COPY_DST: 4 } as const;

export interface BufferDescriptor {
  label?: string;
  size: number;
  usage: number;
}

export type VertexFormat = 'float32' | 'float32x2' | 'float32x3' | 'float32x4';
export type VertexStepMode = 'vertex' | 'instance';

export interface VertexAttribute {
  shaderLocation: number;
  format: VertexFormat;
  offset: number;
}

export interface VertexBufferLayout {
  arrayStride: number;
  stepMode: VertexStepMode;
  attributes: VertexAttribute[];
}

export const FLOAT32_FORMATS: readonly VertexFormat[] = [
  'float32',
  'float32x2',
  'float32x3',
  'float32x4'
];

export type PrimitiveTopology = 'triangle-list' | 'triangle-strip';

export type BlendFactor = 'zero' | 'one' | 'src' | 'src-alpha' | 'one-minus-src-alpha';

export interface BlendComponent {
  srcFactor: BlendFactor;
  dstFactor: BlendFactor;
}

export interface BlendState {
  color: BlendComponent;
  alpha: BlendComponent;
}

export const ALPHA_BLEND: BlendState = {
  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }
};

export type CompareFunction = 'always' | 'less' | 'less-equal';

export type DepthFormat = 'depth24plus' | 'depth24plus-stencil8';

export interface DepthStencilState {
  format: DepthFormat;
  depthWriteEnabled: boolean;
  depthCompare: CompareFunction;
}

export interface StencilState {
  compare: 'always' | 'not-equal';
  reference: number;
  write: boolean;
}

export interface ShaderSources {
  vertex: string;
  fragment: string;
}

export type BindingSlot = readonly [group: number, binding: number];

export interface GlslBlock {
  slot: BindingSlot;
  offsets: Readonly<Record<string, number>>;
}

export interface GlslTexture {
  texture: BindingSlot;
  sampler?: BindingSlot;
}

export interface GlslSources extends ShaderSources {
  attributes: Record<string, number>;
  blocks?: Record<string, GlslBlock>;
  textures?: Record<string, GlslTexture>;
}

export interface ColorTargetState {
  format: TextureFormat;
  blend?: BlendState;
}

export interface RenderPipelineDescriptor {
  label: string;
  layout: GpuBindGroupLayout[];
  glsl: GlslSources;
  wgsl?: ShaderSources;
  vertex: { buffers: VertexBufferLayout[] };
  primitive: { topology: PrimitiveTopology };
  fragment: { targets: [ColorTargetState] };
  depthStencil?: DepthStencilState;
  debug?: boolean;
}

export interface CompiledModule {
  label: string;
  module: GpuShaderModule;
}

export type RenderPipelineResult =
  | {
      ok: true;
      pipeline: GpuRenderPipeline;
      modules: CompiledModule[];
    }
  | { ok: false; error: string; modules: CompiledModule[] };

export interface GpuLimits {
  maxVertexAttribs: number;
  maxTextureSize: number;
  maxCombinedTextureImageUnits: number;
  minUniformBufferOffsetAlignment: number;
}

export type LoadOp = 'load' | 'clear';
export type StoreOp = 'store' | 'discard';

export interface RenderPassColorAttachment {
  view: GpuTexture;
  loadOp: LoadOp;
  storeOp: StoreOp;
  clearValue?: readonly [number, number, number, number];
}

export interface RenderPassDepthStencilAttachment {
  view: GpuTexture;
  depthLoadOp: LoadOp;
  depthStoreOp: StoreOp;
  depthClearValue?: number;
  stencilLoadOp?: LoadOp;
  stencilStoreOp?: StoreOp;
  stencilClearValue?: number;
}

export interface RenderPassDescriptor {
  label?: string;
  colorAttachments: [RenderPassColorAttachment];
  depthStencilAttachment?: RenderPassDepthStencilAttachment;
}

export interface GpuRenderPass {
  setPipeline(pipeline: GpuRenderPipeline): void;
  setBindGroup(index: number, group: GpuBindGroup, dynamicOffsets?: readonly number[]): void;
  setVertexBuffer(slot: number, buffer: GpuBuffer, offset?: number): void;
  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number
  ): void;
  end(): void;
}

export interface GpuCommandEncoder {
  beginRenderPass(desc: RenderPassDescriptor): GpuRenderPass;
  finish(): GpuCommandBuffer;
}

export interface GpuCanvas {
  readonly format: TextureFormat;
  readonly depthFormat: DepthFormat | null;
  resize(width: number, height: number): void;
  getCurrentTexture(): GpuTexture;
  getDepthTexture(): GpuTexture | null;
}

export interface GpuDevice {
  readonly backend: 'webgl2';
  readonly queue: GpuQueue;
  readonly canvas: GpuCanvas;

  limits(): GpuLimits;
  checkError(operation: string): boolean;

  createRenderPipeline(desc: RenderPipelineDescriptor): RenderPipelineResult;
  destroyRenderPipeline(pipeline: GpuRenderPipeline): void;
  destroyShaderModule(module: GpuShaderModule): void;

  createBuffer(desc: BufferDescriptor): GpuBuffer;
  destroyBuffer(buffer: GpuBuffer | null): void;

  createTexture(desc: TextureDescriptor): GpuTexture;
  destroyTexture(texture: GpuTexture | null): void;
  createSampler(desc: SamplerDescriptor): GpuSampler;

  createBindGroupLayout(desc: BindGroupLayoutDescriptor): GpuBindGroupLayout;
  createBindGroup(desc: BindGroupDescriptor): GpuBindGroup;
  createCommandEncoder(): GpuCommandEncoder;
  setStencil(state: StencilState | null): void;
}
