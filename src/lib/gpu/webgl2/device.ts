import type {
  BufferDescriptor,
  StencilState,
  GpuBuffer,
  GpuCanvas,
  GpuCommandBuffer,
  GpuCommandEncoder,
  GpuDevice,
  GpuLimits,
  GpuQueue,
  GpuRenderPass,
  GpuRenderPipeline,
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
import { CANVAS_COLOR, CANVAS_DEPTH, Webgl2Framebuffers } from './passes.js';
import { Webgl2Validator } from './validate.js';
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
  readonly canvas: GpuCanvas;

  private readonly textures: Webgl2Textures;
  private readonly buffers: Webgl2Buffers;
  private readonly pipelines: Webgl2Pipelines;
  private readonly state: Webgl2State;
  private readonly vertexArrays: Webgl2VertexArrays;
  private readonly framebuffers: Webgl2Framebuffers;
  private pipeline: Webgl2Pipeline | null = null;
  private readonly validator: Webgl2Validator | null;
  readonly queue: GpuQueue;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    options: { validate?: boolean } = {}
  ) {
    const validator = (options.validate ?? import.meta.env.DEV) ? new Webgl2Validator() : null;
    this.validator = validator;
    const textures = new Webgl2Textures(gl);
    const buffers = new Webgl2Buffers(
      gl,
      validator ? (b, s, e) => validator.write(b, s, e) : undefined
    );
    this.textures = textures;
    this.buffers = buffers;
    const attributes = gl.getContextAttributes();
    const depthFormat =
      attributes?.depth !== true
        ? null
        : attributes.stencil === true
          ? 'depth24plus-stencil8'
          : 'depth24plus';
    this.canvas = {
      format: 'rgba8unorm',
      depthFormat,
      resize: (width, height) => {
        gl.canvas.width = width;
        gl.canvas.height = height;
      },
      getCurrentTexture: () => CANVAS_COLOR,
      getDepthTexture: () => (depthFormat ? CANVAS_DEPTH : null)
    };
    this.pipelines = new Webgl2Pipelines(gl);
    const state = new Webgl2State(gl);
    this.state = state;
    this.vertexArrays = new Webgl2VertexArrays(gl);
    this.framebuffers = new Webgl2Framebuffers(
      gl,
      (texture) => textures.size(texture),
      () => state.allowDepthWrite()
    );
    this.queue = {
      writeBuffer: (buffer, offset, data, dataOffset, size) =>
        buffers.write(buffer, offset, data, dataOffset, size),
      writeTexture: (dst, data, layout, size) =>
        textures.write(dst.texture, dst.origin ?? { x: 0, y: 0 }, data, layout.bytesPerRow, size),
      copyExternalImageToTexture: (src, dst) => textures.copyImage(src.source, dst.texture),
      submit: () => validator?.reset()
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

  private setPipeline(pipeline: GpuRenderPipeline): void {
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

  createTexture(desc: TextureDescriptor): GpuTexture {
    return this.textures.create(desc);
  }

  destroyTexture(texture: GpuTexture | null): void {
    if (!texture) return;
    this.framebuffers.forget(texture);
    this.textures.destroy(texture);
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

  createCommandEncoder(): GpuCommandEncoder {
    this.validator?.reset();
    let open = false;
    return {
      beginRenderPass: (desc): GpuRenderPass => {
        if (open) throw new Error('beginRenderPass: the encoder already has an open pass');
        open = true;
        this.framebuffers.begin(desc);
        let ended = false;
        const live = () => {
          if (ended) throw new Error('render pass used after end');
        };
        return {
          setPipeline: (pipeline) => {
            live();
            this.setPipeline(pipeline);
          },
          setVertexBuffer: (slot, buffer, offset = 0) => {
            live();
            this.vertexArrays.set(slot, raw<WebGLBuffer>(buffer), offset);
          },
          draw: (vertexCount, instanceCount, firstVertex, firstInstance) => {
            live();
            this.draw(vertexCount, instanceCount, firstVertex, firstInstance);
          },
          end: () => {
            live();
            ended = true;
            open = false;
            this.framebuffers.end(desc);
          }
        };
      },
      finish: () => {
        if (open) throw new Error('finish: a render pass is still open');
        return {} as GpuCommandBuffer;
      }
    };
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

  private draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex = 0,
    firstInstance = 0
  ): void {
    const p = this.pipeline;
    if (!p) throw new Error('draw: no pipeline set');
    if (firstInstance !== 0) throw new Error('draw: WebGL2 has no base instance');
    this.state.use(p.program);
    this.vertexArrays.bind(p);
    this.validator?.draw(
      p,
      this.vertexArrays.bound,
      [firstVertex, firstVertex + vertexCount],
      [firstInstance, firstInstance + (instanceCount ?? 1)]
    );
    if (instanceCount === undefined) this.gl.drawArrays(p.topology, firstVertex, vertexCount);
    else this.gl.drawArraysInstanced(p.topology, firstVertex, vertexCount, instanceCount);
  }
}
