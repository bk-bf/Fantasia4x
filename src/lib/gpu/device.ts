declare const handle: unique symbol;
type Handle<K extends string> = { readonly [handle]: K };

export type GpuBuffer = Handle<'buffer'>;
export type GpuTexture = Handle<'texture'>;
export type GpuRenderTarget = Handle<'render-target'>;
export type GpuVertexLayout = Handle<'vertex-layout'>;
export type GpuPipeline = Handle<'pipeline'>;
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

export interface TextureCopyDestination {
  texture: GpuTexture;
  origin?: { x: number; y: number };
}

export interface Extent {
  width: number;
  height: number;
}

export interface GpuQueue {
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

export type BufferUsage = 'static' | 'dynamic';

export type VertexFormat = 'float32' | 'float32x2' | 'float32x3' | 'float32x4';
export type VertexStepMode = 'vertex' | 'instance';

export interface VertexAttribute {
  format: VertexFormat;
  stride: number;
  offset: number;
  stepMode?: VertexStepMode;
}

export const FLOAT32_FORMATS: readonly VertexFormat[] = [
  'float32',
  'float32x2',
  'float32x3',
  'float32x4'
];

export type PrimitiveTopology = 'triangle-list' | 'triangle-strip';

export type BlendFactor = 'zero' | 'one' | 'src' | 'src-alpha' | 'one-minus-src-alpha';

export type CompareFunction = 'less' | 'less-equal';

export interface StencilState {
  compare: 'always' | 'not-equal';
  reference: number;
  write: boolean;
}

export interface ShaderSources {
  vertex: string;
  fragment: string;
}

export interface RenderPipelineDescriptor {
  label: string;
  glsl: ShaderSources;
  wgsl?: ShaderSources;
  debug?: boolean;
}

export interface CompiledModule {
  label: string;
  module: GpuShaderModule;
}

export type RenderPipelineResult =
  | {
      ok: true;
      pipeline: GpuPipeline;
      uniforms: Map<string, GpuUniform>;
      attributes: Map<string, number>;
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

  limits(): GpuLimits;
  checkError(operation: string): boolean;

  createRenderPipeline(desc: RenderPipelineDescriptor): RenderPipelineResult;
  destroyPipeline(pipeline: GpuPipeline): void;
  destroyShaderModule(module: GpuShaderModule): void;
  uniform(pipeline: GpuPipeline, name: string): GpuUniform | null;
  attribute(pipeline: GpuPipeline, name: string): number;
  setPipeline(pipeline: GpuPipeline | null): void;

  setF32(u: GpuUniform | null, x: number): void;
  setI32(u: GpuUniform | null, x: number): void;
  setVec2f(u: GpuUniform | null, x: number, y: number): void;
  setVec2i(u: GpuUniform | null, x: number, y: number): void;
  setVec4f(u: GpuUniform | null, x: number, y: number, z: number, w: number): void;
  setVec2fv(u: GpuUniform | null, v: Iterable<number>): void;
  setVec3fv(u: GpuUniform | null, v: Iterable<number>): void;
  setVec4fv(u: GpuUniform | null, v: Iterable<number>, offset?: number, length?: number): void;
  setMat4fv(u: GpuUniform | null, v: Iterable<number>): void;

  createBuffer(): GpuBuffer;
  destroyBuffer(buffer: GpuBuffer | null): void;
  setVertexBuffer(buffer: GpuBuffer | null): void;
  writeBuffer(data: AllowSharedBufferSource | number, usage: BufferUsage): void;
  writeSubBuffer(offset: number, data: ArrayBufferView, srcOffset?: number, length?: number): void;

  createVertexLayout(): GpuVertexLayout;
  destroyVertexLayout(layout: GpuVertexLayout | null): void;
  setVertexLayout(layout: GpuVertexLayout | null): void;
  vertexAttribute(location: number, attribute: VertexAttribute): void;

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

  setBlending(on: boolean): void;
  setBlendFunc(src: BlendFactor, dst: BlendFactor): void;
  setBlendFuncSeparate(
    srcColor: BlendFactor,
    dstColor: BlendFactor,
    srcAlpha: BlendFactor,
    dstAlpha: BlendFactor
  ): void;
  setDepthTest(on: boolean): void;
  depthTestEnabled(): boolean;
  setDepthCompare(compare: CompareFunction): void;
  setStencil(state: StencilState | null): void;

  draw(topology: PrimitiveTopology, vertexCount: number, firstVertex?: number): void;
  drawInstanced(
    topology: PrimitiveTopology,
    vertexCount: number,
    instanceCount: number,
    firstVertex?: number
  ): void;
}
