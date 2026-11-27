import {
  BufferUsage,
  ShaderStage,
  type GlslSources,
  type GpuBindGroup,
  type GpuBindGroupLayout,
  type GpuBuffer,
  type GpuDevice
} from '../gpu/device.js';
import { UniformBlock, type UniformLayout } from '../gpu/uniforms.js';
import { blockSources, type GroupBindings } from './passBindings.js';

export const DRAW_GROUP = 2;
const SLICE = 256;

export class DrawSlices implements GroupBindings {
  readonly layout: GpuBindGroupLayout;
  readonly stride: number;
  private readonly block: UniformBlock;
  private staged = new Uint8Array(0);
  private buffer: GpuBuffer | null = null;
  private made: GpuBindGroup | null = null;
  private capacity = 0;

  constructor(
    private readonly gpu: GpuDevice,
    private readonly label: string,
    readonly uniforms: UniformLayout
  ) {
    this.stride = Math.max(SLICE, gpu.limits().minUniformBufferOffsetAlignment || 0);
    if (uniforms.size > this.stride)
      throw new Error(`${label}: a ${uniforms.size}-byte block does not fit one slice`);
    this.block = new UniformBlock(uniforms);
    this.layout = gpu.createBindGroupLayout({
      label,
      entries: [
        {
          binding: 0,
          visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
          buffer: { hasDynamicOffset: true, minBindingSize: uniforms.size }
        }
      ]
    });
  }

  glsl(sources: GlslSources): GlslSources {
    return blockSources(sources, this.uniforms, [DRAW_GROUP, 0]);
  }

  private reserve(count: number): void {
    if (count <= this.capacity) return;
    const capacity = Math.max(count, this.capacity * 2, 4);
    const staged = new Uint8Array(capacity * this.stride);
    staged.set(this.staged);
    this.staged = staged;
    this.gpu.destroyBuffer(this.buffer);
    this.buffer = this.gpu.createBuffer({
      label: this.label,
      size: capacity * this.stride,
      usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST
    });
    this.made = this.gpu.createBindGroup({
      label: this.label,
      layout: this.layout,
      entries: [{ binding: 0, resource: { buffer: this.buffer, size: this.uniforms.size } }]
    });
    this.capacity = capacity;
  }

  stage(index: number, values: Readonly<Record<string, number | ArrayLike<number>>>): void {
    this.reserve(index + 1);
    for (const [name, value] of Object.entries(values)) this.block.set(name, value);
    this.staged.set(this.block.bytes, index * this.stride);
  }

  upload(count: number): void {
    if (count === 0 || !this.buffer) return;
    this.gpu.queue.writeBuffer(this.buffer, 0, this.staged, 0, count * this.stride);
  }

  get group(): GpuBindGroup {
    if (!this.made) throw new Error(`${this.label}: nothing staged`);
    return this.made;
  }

  offset(index: number): number {
    return index * this.stride;
  }

  destroy(): void {
    this.gpu.destroyBuffer(this.buffer);
  }
}
