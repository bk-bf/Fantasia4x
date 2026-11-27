import type {
  BindGroupDescriptor,
  BindGroupLayoutDescriptor,
  BindGroupLayoutEntry,
  BindingResource,
  BufferDescriptor,
  GpuBindGroup,
  GpuBindGroupLayout,
  GpuBuffer,
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
  RenderPassDescriptor,
  RenderPipelineDescriptor,
  RenderPipelineResult,
  SamplerDescriptor,
  TextureDescriptor
} from '../device.js';
import { WriteValidator, type DrawnSlot } from '../validate.js';
import { CANVAS_COLOR, CANVAS_DEPTH, WebgpuCanvas, type WebgpuCanvasTarget } from './canvas.js';
import { bufferUsage, layoutEntry, textureUsage } from './formats.js';
import { bindingError, type BindingLimits } from './limits.js';
import { WebgpuPipelines } from './pipeline.js';

const raw = <T>(h: unknown): T => h as T;

interface GroupReads {
  buffers: { buffer: GPUBuffer; offset: number; size: number; dynamic: boolean }[];
  textures: GpuTexture[];
}

interface BoundGroup {
  reads: GroupReads;
  offsets: readonly number[];
}

function byteLength(data: ArrayBufferView, dataOffset = 0, size?: number): number {
  const element = 'BYTES_PER_ELEMENT' in data ? Number(data.BYTES_PER_ELEMENT) : 1;
  return (size ?? data.byteLength / element - dataOffset) * element;
}

export class WebgpuDevice implements GpuDevice {
  readonly backend = 'webgpu' as const;
  readonly canvas: WebgpuCanvas;
  readonly queue: GpuQueue;
  private readonly pipelines: WebgpuPipelines;
  private readonly views = new WeakMap<GPUTexture, GPUTextureView>();
  private readonly layouts = new WeakMap<GpuBindGroupLayout, readonly BindGroupLayoutEntry[]>();
  private readonly groups = new WeakMap<GpuBindGroup, GroupReads>();
  private readonly validator: WriteValidator<GPUBuffer> | null;
  private readonly bindingLimits: BindingLimits;

  constructor(
    private readonly device: GPUDevice,
    target: WebgpuCanvasTarget,
    options: { validate?: boolean } = {}
  ) {
    this.canvas = new WebgpuCanvas(device, target);
    const l = device.limits;
    this.bindingLimits = {
      maxBindGroups: l.maxBindGroups,
      maxBindingsPerBindGroup: l.maxBindingsPerBindGroup,
      maxSampledTexturesPerShaderStage: l.maxSampledTexturesPerShaderStage,
      maxUniformBuffersPerShaderStage: l.maxUniformBuffersPerShaderStage
    };
    this.pipelines = new WebgpuPipelines(device, this.bindingLimits, (layout) =>
      this.entriesOf(layout)
    );
    const validator =
      (options.validate ?? import.meta.env.MODE === 'test')
        ? new WriteValidator<GPUBuffer>()
        : null;
    this.validator = validator;
    const queue = device.queue;
    this.queue = {
      writeBuffer: (buffer, offset, data, dataOffset, size) => {
        const bytes = byteLength(data, dataOffset, size);
        if (offset % 4 !== 0 || bytes % 4 !== 0)
          throw new Error(
            `writeBuffer: WebGPU writes whole 4-byte words, not ${bytes} bytes at offset ${offset}`
          );
        validator?.write(raw<GPUBuffer>(buffer), offset, offset + bytes);
        queue.writeBuffer(
          raw<GPUBuffer>(buffer),
          offset,
          raw<GPUAllowSharedBufferSource>(data),
          dataOffset,
          size
        );
      },
      writeTexture: (dst, data, layout, size) => {
        validator?.writeTexture(dst.texture);
        queue.writeTexture(
          { texture: raw<GPUTexture>(dst.texture), origin: dst.origin ?? { x: 0, y: 0 } },
          raw<GPUAllowSharedBufferSource>(data),
          { bytesPerRow: layout.bytesPerRow, rowsPerImage: size.height },
          size
        );
      },
      submit: (buffers) => {
        queue.submit(raw<GPUCommandBuffer[]>(buffers));
        validator?.reset();
      }
    };
  }

  private entriesOf(layout: GpuBindGroupLayout): readonly BindGroupLayoutEntry[] {
    const entries = this.layouts.get(layout);
    if (!entries) throw new Error('not a bind group layout this device created');
    return entries;
  }

  static rawDeviceForInstrumentation(device: WebgpuDevice): GPUDevice {
    return device.device;
  }

  limits(): GpuLimits {
    const l = this.device.limits;
    return {
      maxVertexAttribs: l.maxVertexAttributes,
      maxTextureSize: l.maxTextureDimension2D,
      maxCombinedTextureImageUnits: l.maxSampledTexturesPerShaderStage,
      minUniformBufferOffsetAlignment: l.minUniformBufferOffsetAlignment,
      ...this.bindingLimits
    };
  }

  checkError(): boolean {
    return false;
  }

  createRenderPipeline(desc: RenderPipelineDescriptor): RenderPipelineResult {
    return this.pipelines.create(desc);
  }

  destroyRenderPipeline(pipeline: GpuRenderPipeline): void {
    this.pipelines.retire(pipeline);
  }

  destroyShaderModule(module: GpuShaderModule): void {
    this.pipelines.forget(module);
  }

  createBuffer(desc: BufferDescriptor): GpuBuffer {
    return raw<GpuBuffer>(
      this.device.createBuffer({
        label: desc.label,
        size: Math.ceil(desc.size / 4) * 4,
        usage: bufferUsage(desc.usage)
      })
    );
  }

  destroyBuffer(buffer: GpuBuffer | null): void {
    raw<GPUBuffer | null>(buffer)?.destroy();
  }

  createTexture(desc: TextureDescriptor): GpuTexture {
    const texture = this.device.createTexture({
      label: desc.label,
      size: { width: desc.width, height: desc.height },
      format: desc.format,
      usage: textureUsage(desc.usage)
    });
    this.views.set(texture, texture.createView());
    return raw<GpuTexture>(texture);
  }

  destroyTexture(texture: GpuTexture | null): void {
    raw<GPUTexture | null>(texture)?.destroy();
  }

  createSampler(desc: SamplerDescriptor): GpuSampler {
    return raw<GpuSampler>(this.device.createSampler(desc));
  }

  private refuseBinding(op: string, label: string | undefined, binding: number): void {
    const error = bindingError(binding, this.bindingLimits);
    if (error) throw new Error(`${op} ${label ?? ''}: ${error}`);
  }

  createBindGroupLayout(desc: BindGroupLayoutDescriptor): GpuBindGroupLayout {
    for (const e of desc.entries) this.refuseBinding('createBindGroupLayout', desc.label, e.binding);
    const layout = raw<GpuBindGroupLayout>(
      this.device.createBindGroupLayout({ label: desc.label, entries: desc.entries.map(layoutEntry) })
    );
    this.layouts.set(layout, desc.entries);
    return layout;
  }

  private resource(r: BindingResource): GPUBindingResource {
    if ('buffer' in r) return { buffer: raw<GPUBuffer>(r.buffer), offset: r.offset, size: r.size };
    return this.views.get(raw<GPUTexture>(r)) ?? raw<GPUSampler>(r);
  }

  createBindGroup(desc: BindGroupDescriptor): GpuBindGroup {
    for (const e of desc.entries) this.refuseBinding('createBindGroup', desc.label, e.binding);
    const layout = this.entriesOf(desc.layout);
    const group = raw<GpuBindGroup>(
      this.device.createBindGroup({
        label: desc.label,
        layout: raw<GPUBindGroupLayout>(desc.layout),
        entries: desc.entries.map((e) => ({ binding: e.binding, resource: this.resource(e.resource) }))
      })
    );
    const reads: GroupReads = { buffers: [], textures: [] };
    for (const e of [...desc.entries].sort((a, b) => a.binding - b.binding)) {
      const r = e.resource;
      const entry = layout.find((l) => l.binding === e.binding);
      if ('buffer' in r)
        reads.buffers.push({
          buffer: raw<GPUBuffer>(r.buffer),
          offset: r.offset ?? 0,
          size: r.size,
          dynamic: entry !== undefined && 'buffer' in entry && entry.buffer.hasDynamicOffset === true
        });
      else if (this.views.has(raw<GPUTexture>(r))) reads.textures.push(raw<GpuTexture>(r));
    }
    this.groups.set(group, reads);
    return group;
  }

  private readDraw(
    pipeline: GpuRenderPipeline,
    bound: readonly (BoundGroup | undefined)[],
    slots: readonly (DrawnSlot<GPUBuffer> | undefined)[],
    vertices: readonly [number, number],
    instances: readonly [number, number]
  ): void {
    const validator = this.validator;
    if (!validator) return;
    for (const group of bound) {
      if (!group) continue;
      let dynamic = 0;
      for (const b of group.reads.buffers) {
        const start = b.offset + (b.dynamic ? (group.offsets[dynamic++] ?? 0) : 0);
        validator.readBuffer(b.buffer, start, start + b.size);
      }
      for (const t of group.reads.textures) validator.sample(t);
    }
    validator.draw(this.pipelines.buffers(pipeline), slots, vertices, instances);
  }

  private view(texture: GpuTexture): GPUTextureView {
    if (texture === CANVAS_COLOR) return this.canvas.colorView();
    if (texture === CANVAS_DEPTH) return this.canvas.depthTextureView();
    const view = this.views.get(raw<GPUTexture>(texture));
    if (!view) throw new Error('beginRenderPass: not a texture this device created');
    return view;
  }

  private passDescriptor(desc: RenderPassDescriptor): GPURenderPassDescriptor {
    const color = desc.colorAttachments[0];
    const depth = desc.depthStencilAttachment;
    const stencil = this.canvas.depthFormat === 'depth24plus-stencil8';
    const [r, g, b, a] = color.clearValue ?? [0, 0, 0, 0];
    return {
      label: desc.label,
      colorAttachments: [
        {
          view: this.view(color.view),
          loadOp: color.loadOp,
          storeOp: color.storeOp,
          clearValue: { r, g, b, a }
        }
      ],
      ...(depth
        ? {
            depthStencilAttachment: {
              view: this.view(depth.view),
              depthLoadOp: depth.depthLoadOp,
              depthStoreOp: depth.depthStoreOp,
              depthClearValue: depth.depthClearValue ?? 1,
              ...(stencil
                ? {
                    stencilLoadOp: depth.stencilLoadOp ?? 'load',
                    stencilStoreOp: depth.stencilStoreOp ?? 'store',
                    stencilClearValue: depth.stencilClearValue ?? 0
                  }
                : {})
            }
          }
        : {})
    };
  }

  createCommandEncoder(): GpuCommandEncoder {
    const encoder = this.device.createCommandEncoder();
    let open = false;
    return {
      beginRenderPass: (desc): GpuRenderPass => {
        if (open) throw new Error('beginRenderPass: the encoder already has an open pass');
        open = true;
        const pass = encoder.beginRenderPass(this.passDescriptor(desc));
        let pipeline: GpuRenderPipeline | null = null;
        let draws = false;
        let ended = false;
        const bound: (BoundGroup | undefined)[] = [];
        const slots: (DrawnSlot<GPUBuffer> | undefined)[] = [];
        const live = () => {
          if (ended) throw new Error('render pass used after end');
        };
        return {
          setPipeline: (p) => {
            live();
            pipeline = p;
            const ready = this.pipelines.ready(p);
            draws = ready !== null;
            if (ready) pass.setPipeline(ready);
          },
          setBindGroup: (index, group, offsets) => {
            live();
            const reads = this.groups.get(group);
            if (!reads) throw new Error('setBindGroup: not a bind group this device created');
            bound[index] = { reads, offsets: offsets ?? [] };
            pass.setBindGroup(index, raw<GPUBindGroup>(group), offsets ?? []);
          },
          setVertexBuffer: (slot, buffer, offset = 0) => {
            live();
            slots[slot] = { buffer: raw<GPUBuffer>(buffer), offset };
            pass.setVertexBuffer(slot, raw<GPUBuffer>(buffer), offset);
          },
          setStencilReference: (reference) => {
            live();
            pass.setStencilReference(reference);
          },
          draw: (vertexCount, instanceCount, firstVertex = 0, firstInstance = 0) => {
            live();
            if (!pipeline) throw new Error('draw: no pipeline set');
            if (!draws) return;
            const instances = instanceCount ?? 1;
            this.readDraw(
              pipeline,
              bound,
              slots,
              [firstVertex, firstVertex + vertexCount],
              [firstInstance, firstInstance + instances]
            );
            pass.draw(vertexCount, instances, firstVertex, firstInstance);
          },
          end: () => {
            live();
            ended = true;
            open = false;
            pass.end();
          }
        };
      },
      finish: () => {
        if (open) throw new Error('finish: a render pass is still open');
        return raw<GpuCommandBuffer>(encoder.finish());
      }
    };
  }

  destroy(): void {
    this.canvas.destroy();
    this.device.destroy();
  }
}
