import {
  TextureUsage,
  bytesPerTexel,
  type GpuDevice,
  type GpuTexture,
  type TextureFormat
} from '../gpu/device.js';

const SAMPLED = TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST;

export class SizedTexture {
  texture: GpuTexture;
  width: number;
  height: number;
  version = 0;

  constructor(
    private readonly gpu: GpuDevice,
    readonly format: TextureFormat,
    width = 1,
    height = 1,
    private readonly usage: number = SAMPLED
  ) {
    this.width = width;
    this.height = height;
    this.texture = this.make();
  }

  private make(): GpuTexture {
    return this.gpu.createTexture({
      format: this.format,
      width: this.width,
      height: this.height,
      usage: this.usage
    });
  }

  resize(width: number, height: number, fresh = false): boolean {
    if (!fresh && width === this.width && height === this.height) return false;
    this.gpu.destroyTexture(this.texture);
    this.width = width;
    this.height = height;
    this.texture = this.make();
    this.version++;
    return true;
  }

  write(data: ArrayBufferView, x = 0, y = 0, width = this.width, height = this.height): void {
    this.gpu.queue.writeTexture(
      { texture: this.texture, origin: { x, y } },
      data,
      { bytesPerRow: width * bytesPerTexel(this.format) },
      { width, height }
    );
  }

  destroy(): void {
    this.gpu.destroyTexture(this.texture);
  }
}
