import type { Extent, GpuTexture, RenderPassDescriptor } from '../device.js';

export const CANVAS_COLOR = { canvas: 'color' } as unknown as GpuTexture;
export const CANVAS_DEPTH = { canvas: 'depth' } as unknown as GpuTexture;

const NO_COLOR = [0, 0, 0, 0] as const;

export class Webgl2Framebuffers {
  private readonly fbos = new WeakMap<GpuTexture, WebGLFramebuffer>();
  private bound: WebGLFramebuffer | null = null;
  private viewport = '';
  private clearColor: readonly number[] | null = null;
  private clearDepth: number | null = null;
  private clearStencil: number | null = null;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly sizeOf: (texture: GpuTexture) => Extent,
    private readonly allowDepthWrite: () => void
  ) {}

  begin(desc: RenderPassDescriptor): void {
    const gl = this.gl;
    const color = desc.colorAttachments[0];
    const depth = desc.depthStencilAttachment;
    const toCanvas = color.view === CANVAS_COLOR;
    if (depth && (depth.view !== CANVAS_DEPTH || !toCanvas))
      throw new Error('beginRenderPass: only the canvas has a depth attachment');
    const fbo = toCanvas ? null : this.fbo(color.view);
    if (fbo !== this.bound) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      this.bound = fbo;
    }
    const size = toCanvas
      ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight }
      : this.sizeOf(color.view);
    const viewport = `${size.width}x${size.height}`;
    if (viewport !== this.viewport) {
      gl.viewport(0, 0, size.width, size.height);
      this.viewport = viewport;
    }
    let mask = 0;
    if (color.loadOp === 'clear') {
      const value = color.clearValue ?? NO_COLOR;
      if (!this.clearColor || value.some((v, i) => v !== this.clearColor![i])) {
        gl.clearColor(value[0], value[1], value[2], value[3]);
        this.clearColor = [...value];
      }
      mask |= gl.COLOR_BUFFER_BIT;
    }
    if (depth?.depthLoadOp === 'clear') {
      const value = depth.depthClearValue ?? 1;
      if (value !== this.clearDepth) {
        gl.clearDepth(value);
        this.clearDepth = value;
      }
      this.allowDepthWrite();
      mask |= gl.DEPTH_BUFFER_BIT;
    }
    if (depth?.stencilLoadOp === 'clear') {
      const value = depth.stencilClearValue ?? 0;
      if (value !== this.clearStencil) {
        gl.clearStencil(value);
        this.clearStencil = value;
      }
      mask |= gl.STENCIL_BUFFER_BIT;
    }
    if (mask) gl.clear(mask);
  }

  end(desc: RenderPassDescriptor): void {
    const gl = this.gl;
    const toCanvas = desc.colorAttachments[0].view === CANVAS_COLOR;
    const discard: number[] = [];
    if (desc.colorAttachments[0].storeOp === 'discard')
      discard.push(toCanvas ? gl.COLOR : gl.COLOR_ATTACHMENT0);
    if (desc.depthStencilAttachment?.depthStoreOp === 'discard') discard.push(gl.DEPTH);
    if (desc.depthStencilAttachment?.stencilStoreOp === 'discard') discard.push(gl.STENCIL);
    if (discard.length > 0) gl.invalidateFramebuffer(gl.FRAMEBUFFER, discard);
  }

  forget(texture: GpuTexture): void {
    const fbo = this.fbos.get(texture);
    if (!fbo) return;
    if (fbo === this.bound) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.bound = null;
    }
    this.gl.deleteFramebuffer(fbo);
    this.fbos.delete(texture);
  }

  private fbo(texture: GpuTexture): WebGLFramebuffer {
    const gl = this.gl;
    let fbo = this.fbos.get(texture);
    if (fbo) return fbo;
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    this.bound = fbo;
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture as unknown as WebGLTexture,
      0
    );
    this.fbos.set(texture, fbo);
    return fbo;
  }
}
