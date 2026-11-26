declare const handle: unique symbol;
type Handle<K extends string> = { readonly [handle]: K };

export type GpuBuffer = Handle<'buffer'>;
export type GpuTexture = Handle<'texture'>;
export type GpuRenderTarget = Handle<'render-target'>;
export type GpuRenderPipeline = Handle<'render-pipeline'>;
export type GpuShaderModule = Handle<'shader-module'>;
export type GpuUniform = Handle<'uniform'>;
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
  copyExternalImageToTexture(
    source: { source: TexImageSource },
    destination: { texture: GpuTexture },
    size: Extent
  ): void;
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

export type DepthFormat = 'depth24plus';

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

export interface GlslSources extends ShaderSources {
  attributes: Record<string, number>;
}

export interface ColorTargetState {
  format: TextureFormat;
  blend?: BlendState;
}

export interface RenderPipelineDescriptor {
  label: string;
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
      uniforms: Map<string, GpuUniform>;
      modules: CompiledModule[];
    }
  | { ok: false; error: string; modules: CompiledModule[] };

export interface GpuLimits {
  maxVertexAttribs: number;
  maxTextureSize: number;
  maxCombinedTextureImageUnits: number;
}

export interface ClearDescriptor {
  color: boolean;
  depth?: boolean;
  stencil?: boolean;
}

export interface GpuDevice {
  readonly backend: 'webgl2';
  readonly queue: GpuQueue;
  readonly canvasFormat: TextureFormat;
  readonly canvasDepthFormat: DepthFormat | null;

  limits(): GpuLimits;
  checkError(operation: string): boolean;

  createRenderPipeline(desc: RenderPipelineDescriptor): RenderPipelineResult;
  destroyRenderPipeline(pipeline: GpuRenderPipeline): void;
  destroyShaderModule(module: GpuShaderModule): void;
  uniform(pipeline: GpuRenderPipeline, name: string): GpuUniform | null;
  setPipeline(pipeline: GpuRenderPipeline): void;

  setF32(u: GpuUniform | null, x: number): void;
  setI32(u: GpuUniform | null, x: number): void;
  setVec2f(u: GpuUniform | null, x: number, y: number): void;
  setVec2i(u: GpuUniform | null, x: number, y: number): void;
  setVec4f(u: GpuUniform | null, x: number, y: number, z: number, w: number): void;
  setVec2fv(u: GpuUniform | null, v: Iterable<number>): void;
  setVec3fv(u: GpuUniform | null, v: Iterable<number>): void;
  setVec4fv(u: GpuUniform | null, v: Iterable<number>, offset?: number, length?: number): void;
  setMat4fv(u: GpuUniform | null, v: Iterable<number>): void;

  createBuffer(desc: BufferDescriptor): GpuBuffer;
  destroyBuffer(buffer: GpuBuffer | null): void;
  setVertexBuffer(slot: number, buffer: GpuBuffer, offset?: number): void;

  createTexture(desc: TextureDescriptor): GpuTexture;
  destroyTexture(texture: GpuTexture | null): void;
  setTextureSlot(slot: number): void;
  bindTexture(texture: GpuTexture | null): void;
  createSampler(desc: SamplerDescriptor): GpuSampler;
  bindSampler(slot: number, sampler: GpuSampler | null): void;

  createRenderTarget(): GpuRenderTarget;
  destroyRenderTarget(target: GpuRenderTarget | null): void;
  beginRenderPass(target: GpuRenderTarget): void;
  endRenderPass(): void;
  attachColorTexture(target: GpuRenderTarget, texture: GpuTexture): void;
  clear(desc: ClearDescriptor): void;
  setClearColor(r: number, g: number, b: number, a: number): void;
  setViewport(x: number, y: number, width: number, height: number): void;

  setStencil(state: StencilState | null): void;

  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number
  ): void;
}
