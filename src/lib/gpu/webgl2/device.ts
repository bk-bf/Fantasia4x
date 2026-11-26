import type {
  BlendFactor,
  BufferUsage,
  ClearDescriptor,
  CompareFunction,
  GpuBuffer,
  GpuDevice,
  GpuLimits,
  GpuPipeline,
  GpuRenderTarget,
  GpuShaderModule,
  GpuTexture,
  GpuUniform,
  GpuVertexLayout,
  IndexFormat,
  PrimitiveTopology,
  RenderPipelineDescriptor,
  RenderPipelineResult,
  SamplerDescriptor,
  TextureData,
  TextureExtent,
  TextureFormat,
  TextureRegion,
  VertexAttribute
} from '../device.js';
import {
  addressMode,
  blendFactor,
  bufferUsage,
  compareFunction,
  filterMode,
  textureFormat,
  topology,
  vertexComponents
} from './formats.js';
import { createRenderPipeline } from './pipeline.js';

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

export class Webgl2Device implements GpuDevice {
  readonly backend = 'webgl2' as const;

  constructor(readonly gl: WebGL2RenderingContext) {}

  limits(): GpuLimits {
    const gl = this.gl;
    return {
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxCombinedTextureImageUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
    };
  }

  maxTextureSize(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
  }

  info(): Record<string, string> {
    const gl = this.gl;
    return {
      vendor: gl.getParameter(gl.VENDOR) || 'Unknown',
      renderer: gl.getParameter(gl.RENDERER) || 'Unknown',
      version: gl.getParameter(gl.VERSION) || 'Unknown',
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || 'Unknown',
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)?.toString() || 'Unknown',
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS)?.toString() || 'Unknown'
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

  createBuffer(): GpuBuffer {
    return this.gl.createBuffer() as unknown as GpuBuffer;
  }

  destroyBuffer(buffer: GpuBuffer | null): void {
    this.gl.deleteBuffer(raw<WebGLBuffer>(buffer));
  }

  setVertexBuffer(buffer: GpuBuffer | null): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, raw<WebGLBuffer>(buffer));
  }

  writeBuffer(data: AllowSharedBufferSource | number, usage: BufferUsage): void {
    const gl = this.gl;
    if (typeof data === 'number') gl.bufferData(gl.ARRAY_BUFFER, data, bufferUsage(gl, usage));
    else gl.bufferData(gl.ARRAY_BUFFER, data, bufferUsage(gl, usage));
  }

  writeSubBuffer(offset: number, data: ArrayBufferView, srcOffset?: number, length?: number): void {
    const gl = this.gl;
    if (srcOffset === undefined) gl.bufferSubData(gl.ARRAY_BUFFER, offset, data);
    else gl.bufferSubData(gl.ARRAY_BUFFER, offset, data, srcOffset, length);
  }

  setIndexBuffer(buffer: GpuBuffer | null): void {
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, raw<WebGLBuffer>(buffer));
  }

  writeIndexBuffer(data: AllowSharedBufferSource, usage: BufferUsage): void {
    const gl = this.gl;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, bufferUsage(gl, usage));
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

  createTexture(): GpuTexture {
    return this.gl.createTexture() as unknown as GpuTexture;
  }

  destroyTexture(texture: GpuTexture | null): void {
    this.gl.deleteTexture(raw<WebGLTexture>(texture));
  }

  setTextureSlot(slot: number): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + slot);
  }

  bindTexture(texture: GpuTexture | null): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, raw<WebGLTexture>(texture));
  }

  setSampler(desc: SamplerDescriptor): void {
    const gl = this.gl;
    if (desc.minFilter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filterMode(gl, desc.minFilter));
    if (desc.magFilter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filterMode(gl, desc.magFilter));
    if (desc.addressModeU)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, addressMode(gl, desc.addressModeU));
    if (desc.addressModeV)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, addressMode(gl, desc.addressModeV));
  }

  writeTexture(extent: TextureExtent, data: TextureData): void {
    const gl = this.gl;
    const f = textureFormat(gl, extent.format);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      f.internalFormat,
      extent.width,
      extent.height,
      0,
      f.format,
      f.type,
      data
    );
  }

  writeTextureImage(format: TextureFormat, source: TexImageSource): void {
    const gl = this.gl;
    const f = textureFormat(gl, format);
    gl.texImage2D(gl.TEXTURE_2D, 0, f.internalFormat, f.format, f.type, source);
  }

  writeSubTexture(region: TextureRegion, data: ArrayBufferView): void {
    const gl = this.gl;
    const f = textureFormat(gl, region.format);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      region.x,
      region.y,
      region.width,
      region.height,
      f.format,
      f.type,
      data
    );
  }

  generateMipmaps(): void {
    this.gl.generateMipmap(this.gl.TEXTURE_2D);
  }

  setUnpackAlignment(bytes: 1 | 2 | 4 | 8): void {
    this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, bytes);
  }

  setUnpackPremultiplyAlpha(on: boolean): void {
    this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, on);
  }

  setUnpackFlipY(on: boolean): void {
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, on);
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
    gl.clear(desc.depth ? gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT : gl.COLOR_BUFFER_BIT);
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

  drawIndexed(t: PrimitiveTopology, indexCount: number, format: IndexFormat, firstIndex = 0): void {
    const gl = this.gl;
    const [type, bytes] = format === 'uint16' ? [gl.UNSIGNED_SHORT, 2] : [gl.UNSIGNED_INT, 4];
    gl.drawElements(topology(gl, t), indexCount, type, firstIndex * bytes);
  }
}
