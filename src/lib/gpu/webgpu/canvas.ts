import type { DepthFormat, GpuCanvas, GpuTexture, TextureFormat } from '../device.js';

export const CANVAS_COLOR = { canvas: 'color' } as unknown as GpuTexture;
export const CANVAS_DEPTH = { canvas: 'depth' } as unknown as GpuTexture;

export interface WebgpuCanvasTarget {
  canvas: { width: number; height: number };
  context: () => GPUCanvasContext;
  format: TextureFormat;
  depthFormat: DepthFormat | null;
}

export class WebgpuCanvas implements GpuCanvas {
  readonly format: TextureFormat;
  readonly depthFormat: DepthFormat | null;
  private readonly target: WebgpuCanvasTarget;
  private depth: GPUTexture | null = null;
  private depthView: GPUTextureView | null = null;
  private context: GPUCanvasContext | null = null;

  constructor(
    private readonly device: GPUDevice,
    target: WebgpuCanvasTarget
  ) {
    this.target = target;
    this.format = target.format;
    this.depthFormat = target.depthFormat;
  }

  resize(width: number, height: number): void {
    this.target.canvas.width = width;
    this.target.canvas.height = height;
  }

  getCurrentTexture(): GpuTexture {
    return CANVAS_COLOR;
  }

  getDepthTexture(): GpuTexture | null {
    return this.depthFormat ? CANVAS_DEPTH : null;
  }

  colorView(): GPUTextureView {
    this.context ??= this.target.context();
    return this.context.getCurrentTexture().createView();
  }

  depthTextureView(): GPUTextureView {
    const format = this.depthFormat;
    if (!format) throw new Error('beginRenderPass: the canvas has no depth attachment');
    const { width, height } = this.target.canvas;
    if (!this.depth || this.depth.width !== width || this.depth.height !== height) {
      this.depth?.destroy();
      this.depth = this.device.createTexture({
        label: 'canvas depth',
        size: { width, height },
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.depthView = this.depth.createView();
    }
    return this.depthView!;
  }

  destroy(): void {
    this.depth?.destroy();
    this.depth = null;
    this.context?.unconfigure();
    this.context = null;
  }
}
