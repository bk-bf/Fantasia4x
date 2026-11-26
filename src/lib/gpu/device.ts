declare const handle: unique symbol;
type Handle<K extends string> = { readonly [handle]: K };

export type GpuBuffer = Handle<'buffer'>;
export type GpuTexture = Handle<'texture'>;
export type GpuRenderTarget = Handle<'render-target'>;
export type GpuVertexLayout = Handle<'vertex-layout'>;
export type GpuPipeline = Handle<'pipeline'>;
export type GpuShaderModule = Handle<'shader-module'>;
export type GpuUniform = Handle<'uniform'>;

export type TextureFormat =
  | 'rgba8unorm'
  | 'rg8unorm'
  | 'r8unorm'
  | 'r8uint'
  | 'rgba16uint'
  | 'rgba16float'
  | 'rgba32float'
  | 'legacy-rgba'
  | 'legacy-rgb'
  | 'legacy-luminance'
  | 'legacy-alpha';

export type FilterMode = 'nearest' | 'linear';
export type AddressMode = 'clamp-to-edge' | 'repeat' | 'mirror-repeat';

export interface SamplerDescriptor {
  minFilter?: FilterMode;
  magFilter?: FilterMode;
  addressModeU?: AddressMode;
  addressModeV?: AddressMode;
}

export interface TextureExtent {
  format: TextureFormat;
  width: number;
  height: number;
}

export interface TextureRegion extends TextureExtent {
  x: number;
  y: number;
}

export type TextureData = ArrayBufferView | null;

export type BufferUsage = 'static' | 'dynamic';
export type IndexFormat = 'uint16' | 'uint32';

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
}

export interface GpuDevice {
  readonly backend: 'webgl2';

  limits(): GpuLimits;
  maxTextureSize(): number;
  info(): Record<string, string>;
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
  setIndexBuffer(buffer: GpuBuffer | null): void;
  writeIndexBuffer(data: AllowSharedBufferSource, usage: BufferUsage): void;

  createVertexLayout(): GpuVertexLayout;
  destroyVertexLayout(layout: GpuVertexLayout | null): void;
  setVertexLayout(layout: GpuVertexLayout | null): void;
  vertexAttribute(location: number, attribute: VertexAttribute): void;

  createTexture(): GpuTexture;
  destroyTexture(texture: GpuTexture | null): void;
  setTextureSlot(slot: number): void;
  bindTexture(texture: GpuTexture | null): void;
  setSampler(desc: SamplerDescriptor): void;
  writeTexture(extent: TextureExtent, data: TextureData): void;
  writeTextureImage(format: TextureFormat, source: TexImageSource): void;
  writeSubTexture(region: TextureRegion, data: ArrayBufferView): void;
  generateMipmaps(): void;
  setUnpackAlignment(bytes: 1 | 2 | 4 | 8): void;
  setUnpackPremultiplyAlpha(on: boolean): void;
  setUnpackFlipY(on: boolean): void;

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

  draw(topology: PrimitiveTopology, vertexCount: number, firstVertex?: number): void;
  drawInstanced(
    topology: PrimitiveTopology,
    vertexCount: number,
    instanceCount: number,
    firstVertex?: number
  ): void;
  drawIndexed(
    topology: PrimitiveTopology,
    indexCount: number,
    format: IndexFormat,
    firstIndex?: number
  ): void;
}
