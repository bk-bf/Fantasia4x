import type {
  BufferDescriptor,
  ClearDescriptor,
  StencilState,
  GpuBuffer,
  GpuDevice,
  GpuLimits,
  GpuQueue,
  GpuRenderPipeline,
  GpuRenderTarget,
  GpuSampler,
  GpuShaderModule,
  GpuTexture,
  GpuUniform,
  RenderPipelineDescriptor,
  RenderPipelineResult,
  SamplerDescriptor,
  TextureDescriptor
} from '../device.js';
import { addressMode, filterMode } from './formats.js';
import { Webgl2Pipelines, type Webgl2Pipeline, type Webgl2Uniform } from './pipeline.js';
import { Webgl2State } from './state.js';
import { Webgl2VertexArrays } from './vertexArrays.js';
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
  readonly canvasFormat = 'rgba8unorm' as const;
  readonly canvasDepthFormat: 'depth24plus' | null;

  private readonly textures: Webgl2Textures;
  private readonly buffers: Webgl2Buffers;
  private readonly pipelines: Webgl2Pipelines;
  private readonly state: Webgl2State;
  private readonly vertexArrays: Webgl2VertexArrays;
  private pipeline: Webgl2Pipeline | null = null;
  readonly queue: GpuQueue;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const textures = new Webgl2Textures(gl);
    const buffers = new Webgl2Buffers(gl);
    this.textures = textures;
    this.buffers = buffers;
    this.canvasDepthFormat = gl.getContextAttributes()?.depth === true ? 'depth24plus' : null;
    this.pipelines = new Webgl2Pipelines(gl);
    this.state = new Webgl2State(gl);
    this.vertexArrays = new Webgl2VertexArrays(gl);
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
    return this.pipelines.create(desc);
  }

  destroyRenderPipeline(pipeline: GpuRenderPipeline): void {
    if (this.pipeline === (pipeline as unknown)) this.pipeline = null;
    this.pipelines.destroy(pipeline);
  }

  destroyShaderModule(module: GpuShaderModule): void {
    this.gl.deleteShader(raw<WebGLShader>(module));
  }

  uniform(pipeline: GpuRenderPipeline, name: string): GpuUniform | null {
    const program = this.pipelines.get(pipeline).program;
    const location = this.gl.getUniformLocation(program, name);
    if (location === null) return null;
    const uniform: Webgl2Uniform = { program, location };
    return uniform as unknown as GpuUniform;
  }

  setPipeline(pipeline: GpuRenderPipeline): void {
    this.pipeline = this.pipelines.get(pipeline);
    this.state.apply(this.pipeline);
  }

  private at(u: GpuUniform | null): WebGLUniformLocation | null {
    if (!u) return null;
    const { program, location } = raw<Webgl2Uniform>(u);
    this.state.use(program);
    return location;
  }

  setF32(u: GpuUniform | null, x: number): void {
    this.gl.uniform1f(this.at(u), x);
  }

  setI32(u: GpuUniform | null, x: number): void {
    this.gl.uniform1i(this.at(u), x);
  }

  setVec2f(u: GpuUniform | null, x: number, y: number): void {
    this.gl.uniform2f(this.at(u), x, y);
  }

  setVec2i(u: GpuUniform | null, x: number, y: number): void {
    this.gl.uniform2i(this.at(u), x, y);
  }

  setVec4f(u: GpuUniform | null, x: number, y: number, z: number, w: number): void {
    this.gl.uniform4f(this.at(u), x, y, z, w);
  }

  setVec2fv(u: GpuUniform | null, v: Iterable<number>): void {
    this.gl.uniform2fv(this.at(u), v);
  }

  setVec3fv(u: GpuUniform | null, v: Iterable<number>): void {
    this.gl.uniform3fv(this.at(u), v);
  }

  setVec4fv(u: GpuUniform | null, v: Iterable<number>, offset?: number, length?: number): void {
    if (offset === undefined) this.gl.uniform4fv(this.at(u), v);
    else this.gl.uniform4fv(this.at(u), v, offset, length);
  }

  setMat4fv(u: GpuUniform | null, v: Iterable<number>): void {
    this.gl.uniformMatrix4fv(this.at(u), false, v);
  }

  createBuffer(desc: BufferDescriptor): GpuBuffer {
    return this.buffers.create(desc);
  }

  destroyBuffer(buffer: GpuBuffer | null): void {
    if (!buffer) return;
    this.vertexArrays.forget(raw<WebGLBuffer>(buffer));
    this.buffers.destroy(buffer);
  }

  setVertexBuffer(slot: number, buffer: GpuBuffer, offset = 0): void {
    this.vertexArrays.set(slot, raw<WebGLBuffer>(buffer), offset);
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

  draw(vertexCount: number, instanceCount?: number, firstVertex = 0, firstInstance = 0): void {
    const p = this.pipeline;
    if (!p) throw new Error('draw: no pipeline set');
    if (firstInstance !== 0) throw new Error('draw: WebGL2 has no base instance');
    this.state.use(p.program);
    this.vertexArrays.bind(p);
    if (instanceCount === undefined) this.gl.drawArrays(p.topology, firstVertex, vertexCount);
    else this.gl.drawArraysInstanced(p.topology, firstVertex, vertexCount, instanceCount);
  }
}
