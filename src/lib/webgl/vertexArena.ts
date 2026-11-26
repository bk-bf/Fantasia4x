import { BufferUsage, type GpuBuffer, type GpuDevice } from '../gpu/device.js';

export class VertexArena {
  buffer: GpuBuffer | null = null;
  private capacity = 0;
  private used = 0;
  private readonly retired: GpuBuffer[] = [];

  constructor(
    private readonly gpu: GpuDevice,
    private readonly stride: number
  ) {}

  beginFrame(): void {
    this.used = 0;
    for (const buffer of this.retired) this.gpu.destroyBuffer(buffer);
    this.retired.length = 0;
  }

  push(data: Float32Array): number {
    const bytes = data.byteLength;
    if (!this.buffer || this.used + bytes > this.capacity) {
      if (this.buffer) this.retired.push(this.buffer);
      this.capacity = Math.max(bytes, this.capacity * 2);
      this.buffer = this.gpu.createBuffer({
        size: this.capacity,
        usage: BufferUsage.VERTEX | BufferUsage.COPY_DST
      });
      this.used = 0;
    }
    const first = this.used / this.stride;
    this.gpu.queue.writeBuffer(this.buffer, this.used, data);
    this.used += bytes;
    return first;
  }

  destroy(): void {
    this.beginFrame();
    this.gpu.destroyBuffer(this.buffer);
    this.buffer = null;
  }
}
