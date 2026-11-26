import { BufferUsage, type BufferDescriptor, type GpuBuffer } from '../device.js';

interface BufferInfo {
  target: number;
  size: number;
  hint: number;
}

export class Webgl2Buffers {
  private readonly info = new WeakMap<WebGLBuffer, BufferInfo>();

  constructor(private readonly gl: WebGL2RenderingContext) {}

  create(desc: BufferDescriptor): GpuBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    const uniform = (desc.usage & BufferUsage.UNIFORM) !== 0;
    const info = {
      target: uniform ? gl.UNIFORM_BUFFER : gl.ARRAY_BUFFER,
      size: desc.size,
      hint: uniform ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW
    };
    gl.bindBuffer(info.target, buffer);
    gl.bufferData(info.target, desc.size, info.hint);
    this.info.set(buffer, info);
    return buffer as unknown as GpuBuffer;
  }

  write(
    buffer: GpuBuffer,
    offset: number,
    data: ArrayBufferView,
    dataOffset = 0,
    size?: number
  ): void {
    const gl = this.gl;
    const buf = buffer as unknown as WebGLBuffer;
    const info = this.info.get(buf);
    if (!info) throw new Error('writeBuffer: not a buffer this device created');
    const per = 'BYTES_PER_ELEMENT' in data ? Number(data.BYTES_PER_ELEMENT) : 1;
    const elements = size ?? data.byteLength / per - dataOffset;
    if (offset + elements * per > info.size)
      throw new Error(`writeBuffer: ${elements * per} bytes at ${offset} overrun ${info.size}`);
    gl.bindBuffer(info.target, buf);
    if (offset === 0 && elements * per === info.size)
      gl.bufferData(info.target, data, info.hint, dataOffset, elements);
    else gl.bufferSubData(info.target, offset, data, dataOffset, elements);
  }

  destroy(buffer: GpuBuffer): void {
    const buf = buffer as unknown as WebGLBuffer;
    this.gl.deleteBuffer(buf);
    this.info.delete(buf);
  }
}
