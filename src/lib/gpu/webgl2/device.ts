import type {
  BlendFactor,
  BufferDescriptor,
  ClearDescriptor,
  CompareFunction,
  StencilState,
  GpuBuffer,
  GpuDevice,
  GpuLimits,
  GpuQueue,
  GpuPipeline,
  GpuRenderTarget,
  GpuSampler,
  GpuShaderModule,
  GpuTexture,
  GpuUniform,
  GpuVertexLayout,
  PrimitiveTopology,
  RenderPipelineDescriptor,
  RenderPipelineResult,
  SamplerDescriptor,
  TextureDescriptor,
  VertexAttribute
} from '../device.js';
import {
  addressMode,
  blendFactor,
  compareFunction,
  filterMode,
  topology,
  vertexComponents
} from './formats.js';
import { createRenderPipeline } from './pipeline.js';
import { Webgl2Buffers } from './buffers.js';
import { Webgl2Textures } from './textures.js';

const raw = <T>(h: unknown): T => h as T;

function errorName(gl: WebGL2RenderingContext, error: number): string {
  switch (error) {
    case gl.NO_ERROR:
      return 'NO_ERROR';
    case gl.INVALID_ENUM:
      return 'INVALID_ENUM';
    case gl.INVALID_VALUE:
      return 'INVALID_VALUE';
    case gl.INVALID_OPERATION:
      return 'INVALID_OPERATION';
    case gl.INVALID_FRAMEBUFFER_OPERATION:
      return 'INVALID_FRAMEBUFFER_OPERATION';
    case gl.OUT_OF_MEMORY:
      return 'OUT_OF_MEMORY';
    case gl.CONTEXT_LOST_WEBGL:
      return 'CONTEXT_LOST_WEBGL';
    default:
      return `UNKNOWN_ERROR_${error}`;
  }
}

const STENCIL_MASK = 0xff;

export class Webgl2Device implements GpuDevice {
  readonly backend = 'webgl2' as const;

  private readonly textures: Webgl2Textures;
  private readonly buffers: Webgl2Buffers;
  readonly queue: GpuQueue;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const textures = new Webgl2Textures(gl);
    const buffers = new Webgl2Buffers(gl);
    this.textures = textures;
    this.buffers = buffers;
    this.queue = {
      writeBuffer: (buffer, offset, data, dataOffset, size) =>
        buffers.write(buffer, offset, data, dataOffset, size),
      writeTexture: (dst, data, layout, size) =>
        textures.write(dst.texture, dst.origin ?? { x: 0, y: 0 }, data, layout.bytesPerRow, size),
      copyExternalImageToTexture: (src, dst) => textures.copyImage(src.source, dst.texture)
    };
  }

  static rawContextForInstrumentation(device: Webgl2Device): WebGL2RenderingContext {
    return device.gl;
  }

  limits(): GpuLimits {
    const gl = this.gl;
    return {
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
    };
  }

  checkError(operation: string): boolean {
    const gl = this.gl;
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error(`WebGL Error during ${operation}: ${errorName(gl, error)} (${error})`);
      return true;
    }
    return false;
  }

  createRenderPipeline(desc: RenderPipelineDescriptor): RenderPipelineResult {
    return createRenderPipeline(this.gl, desc);
  }

  destroyPipeline(pipeline: GpuPipeline): void {
    this.gl.deleteProgram(raw<WebGLProgram>(pipeline));
  }

  destroyShaderModule(module: GpuShaderModule): void {
    this.gl.deleteShader(raw<WebGLShader>(module));
  }

  uniform(pipeline: GpuPipeline, name: string): GpuUniform | null {
    return this.gl.getUniformLocation(
      raw<WebGLProgram>(pipeline),
      name
    ) as unknown as GpuUniform | null;
  }

  attribute(pipeline: GpuPipeline, name: string): number {
    return this.gl.getAttribLocation(raw<WebGLProgram>(pipeline), name);
  }

  setPipeline(pipeline: GpuPipeline | null): void {
    this.gl.useProgram(raw<WebGLProgram>(pipeline));
  }

  setF32(u: GpuUniform | null, x: number): void {
    this.gl.uniform1f(raw<WebGLUniformLocation>(u), x);
  }

  setI32(u: GpuUniform | null, x: number): void {
    this.gl.uniform1i(raw<WebGLUniformLocation>(u), x);
  }

  setVec2f(u: GpuUniform | null, x: number, y: number): void {
    this.gl.uniform2f(raw<WebGLUniformLocation>(u), x, y);
  }

  setVec2i(u: GpuUniform | null, x: number, y: number): void {
    this.gl.uniform2i(raw<WebGLUniformLocation>(u), x, y);
  }

  setVec4f(u: GpuUniform | null, x: number, y: number, z: number, w: number): void {
    this.gl.uniform4f(raw<WebGLUniformLocation>(u), x, y, z, w);
  }

  setVec2fv(u: GpuUniform | null, v: Iterable<number>): void {
    this.gl.uniform2fv(raw<WebGLUniformLocation>(u), v);
  }

  setVec3fv(u: GpuUniform | null, v: Iterable<number>): void {
    this.gl.uniform3fv(raw<WebGLUniformLocation>(u), v);
  }

  setVec4fv(u: GpuUniform | null, v: Iterable<number>, offset?: number, length?: number): void {
    if (offset === undefined) this.gl.uniform4fv(raw<WebGLUniformLocation>(u), v);
    else this.gl.uniform4fv(raw<WebGLUniformLocation>(u), v, offset, length);
  }

  setMat4fv(u: GpuUniform | null, v: Iterable<number>): void {
    this.gl.uniformMatrix4fv(raw<WebGLUniformLocation>(u), false, v);
  }

  createBuffer(desc: BufferDescriptor): GpuBuffer {
    return this.buffers.create(desc);
  }

  destroyBuffer(buffer: GpuBuffer | null): void {
    if (buffer) this.buffers.destroy(buffer);
  }

  setVertexBuffer(buffer: GpuBuffer | null): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, raw<WebGLBuffer>(buffer));
  }

  createVertexLayout(): GpuVertexLayout {
    return this.gl.createVertexArray() as unknown as GpuVertexLayout;
  }

  destroyVertexLayout(layout: GpuVertexLayout | null): void {
    this.gl.deleteVertexArray(raw<WebGLVertexArrayObject>(layout));
  }

  setVertexLayout(layout: GpuVertexLayout | null): void {
    this.gl.bindVertexArray(raw<WebGLVertexArrayObject>(layout));
  }

  vertexAttribute(location: number, a: VertexAttribute): void {
    const gl = this.gl;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(
      location,
      vertexComponents(a.format),
      gl.FLOAT,
      false,
      a.stride,
      a.offset
    );
    if (a.stepMode === 'instance') gl.vertexAttribDivisor(location, 1);
  }

  createTexture(desc: TextureDescriptor): GpuTexture {
    return this.textures.create(desc);
  }

  destroyTexture(texture: GpuTexture | null): void {
    if (texture) this.textures.destroy(texture);
  }

  setTextureSlot(slot: number): void {
    this.textures.slot = slot;
    this.gl.activeTexture(this.gl.TEXTURE0 + slot);
  }

  bindTexture(texture: GpuTexture | null): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, raw<WebGLTexture>(texture));
  }

  createSampler(desc: SamplerDescriptor): GpuSampler {
    const gl = this.gl;
    const sampler = gl.createSampler();
    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, filterMode(gl, desc.minFilter));
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, filterMode(gl, desc.magFilter));
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, addressMode(gl, desc.addressModeU));
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, addressMode(gl, desc.addressModeV));
    return sampler as unknown as GpuSampler;
  }

  bindSampler(slot: number, sampler: GpuSampler | null): void {
    this.gl.bindSampler(slot, raw<WebGLSampler | null>(sampler));
  }

  createRenderTarget(): GpuRenderTarget {
    return this.gl.createFramebuffer() as unknown as GpuRenderTarget;
  }

  destroyRenderTarget(target: GpuRenderTarget | null): void {
    this.gl.deleteFramebuffer(raw<WebGLFramebuffer>(target));
  }

  beginRenderPass(target: GpuRenderTarget): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, raw<WebGLFramebuffer>(target));
  }

  endRenderPass(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  attachColorTexture(target: GpuRenderTarget, texture: GpuTexture): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, raw<WebGLFramebuffer>(target));
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      raw<WebGLTexture>(texture),
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  clear(desc: ClearDescriptor): void {
    const gl = this.gl;
    const mask =
      (desc.color ? gl.COLOR_BUFFER_BIT : 0) |
      (desc.depth ? gl.DEPTH_BUFFER_BIT : 0) |
      (desc.stencil ? gl.STENCIL_BUFFER_BIT : 0);
    if (mask) gl.clear(mask);
  }

  setClearColor(r: number, g: number, b: number, a: number): void {
    this.gl.clearColor(r, g, b, a);
  }

  setViewport(x: number, y: number, width: number, height: number): void {
    this.gl.viewport(x, y, width, height);
  }

  setBlending(on: boolean): void {
    if (on) this.gl.enable(this.gl.BLEND);
    else this.gl.disable(this.gl.BLEND);
  }

  setBlendFunc(src: BlendFactor, dst: BlendFactor): void {
    const gl = this.gl;
    gl.blendFunc(blendFactor(gl, src), blendFactor(gl, dst));
  }

  setBlendFuncSeparate(
    srcColor: BlendFactor,
    dstColor: BlendFactor,
    srcAlpha: BlendFactor,
    dstAlpha: BlendFactor
  ): void {
    const gl = this.gl;
    gl.blendFuncSeparate(
      blendFactor(gl, srcColor),
      blendFactor(gl, dstColor),
      blendFactor(gl, srcAlpha),
      blendFactor(gl, dstAlpha)
    );
  }

  setDepthTest(on: boolean): void {
    if (on) this.gl.enable(this.gl.DEPTH_TEST);
    else this.gl.disable(this.gl.DEPTH_TEST);
  }

  depthTestEnabled(): boolean {
    return this.gl.isEnabled(this.gl.DEPTH_TEST);
  }

  setDepthCompare(compare: CompareFunction): void {
    this.gl.depthFunc(compareFunction(this.gl, compare));
  }

  setStencil(state: StencilState | null): void {
    const gl = this.gl;
    if (!state) {
      gl.disable(gl.STENCIL_TEST);
      return;
    }
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(
      state.compare === 'always' ? gl.ALWAYS : gl.NOTEQUAL,
      state.reference,
      STENCIL_MASK
    );
    gl.stencilOp(gl.KEEP, gl.KEEP, state.write ? gl.REPLACE : gl.KEEP);
  }

  draw(t: PrimitiveTopology, vertexCount: number, firstVertex = 0): void {
    this.gl.drawArrays(topology(this.gl, t), firstVertex, vertexCount);
  }

  drawInstanced(
    t: PrimitiveTopology,
    vertexCount: number,
    instanceCount: number,
    firstVertex = 0
  ): void {
    this.gl.drawArraysInstanced(topology(this.gl, t), firstVertex, vertexCount, instanceCount);
  }
}
