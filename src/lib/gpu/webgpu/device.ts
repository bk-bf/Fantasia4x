import type {
  BindGroupDescriptor,
  BindGroupLayoutDescriptor,
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
import { CANVAS_COLOR, CANVAS_DEPTH, WebgpuCanvas, type WebgpuCanvasTarget } from './canvas.js';
import { bufferUsage, layoutEntry, textureUsage } from './formats.js';
import { WebgpuPipelines } from './pipeline.js';

const raw = <T>(h: unknown): T => h as T;

export class WebgpuDevice implements GpuDevice {
  readonly backend = 'webgpu' as const;
  readonly canvas: WebgpuCanvas;
  readonly queue: GpuQueue;
  private readonly pipelines: WebgpuPipelines;
  private readonly views = new WeakMap<GPUTexture, GPUTextureView>();

  constructor(
    private readonly device: GPUDevice,
    target: WebgpuCanvasTarget
  ) {
    this.canvas = new WebgpuCanvas(device, target);
    this.pipelines = new WebgpuPipelines(device);
    const queue = device.queue;
    this.queue = {
      writeBuffer: (buffer, offset, data, dataOffset, size) =>
        queue.writeBuffer(
          raw<GPUBuffer>(buffer),
          offset,
          raw<GPUAllowSharedBufferSource>(data),
          dataOffset,
          size
        ),
      writeTexture: (dst, data, layout, size) =>
        queue.writeTexture(
          { texture: raw<GPUTexture>(dst.texture), origin: dst.origin ?? { x: 0, y: 0 } },
          raw<GPUAllowSharedBufferSource>(data),
          { bytesPerRow: layout.bytesPerRow, rowsPerImage: size.height },
          size
        ),
      submit: (buffers) => queue.submit(raw<GPUCommandBuffer[]>(buffers))
    };
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
      minUniformBufferOffsetAlignment: l.minUniformBufferOffsetAlignment
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

  createBindGroupLayout(desc: BindGroupLayoutDescriptor): GpuBindGroupLayout {
    return raw<GpuBindGroupLayout>(
      this.device.createBindGroupLayout({ label: desc.label, entries: desc.entries.map(layoutEntry) })
    );
  }

  private resource(r: BindingResource): GPUBindingResource {
    if ('buffer' in r) return { buffer: raw<GPUBuffer>(r.buffer), offset: r.offset, size: r.size };
    return this.views.get(raw<GPUTexture>(r)) ?? raw<GPUSampler>(r);
  }

  createBindGroup(desc: BindGroupDescriptor): GpuBindGroup {
    return raw<GpuBindGroup>(
      this.device.createBindGroup({
        label: desc.label,
        layout: raw<GPUBindGroupLayout>(desc.layout),
        entries: desc.entries.map((e) => ({ binding: e.binding, resource: this.resource(e.resource) }))
      })
    );
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
        const live = () => {
          if (ended) throw new Error('render pass used after end');
        };
        return {
          setPipeline: (p) => {
            live();
            pipeline = p;
            draws = this.pipelines.draws(p);
            if (draws) pass.setPipeline(raw<GPURenderPipeline>(p));
          },
          setBindGroup: (index, group, offsets) => {
            live();
            pass.setBindGroup(index, raw<GPUBindGroup>(group), offsets ?? []);
          },
          setVertexBuffer: (slot, buffer, offset = 0) => {
            live();
            pass.setVertexBuffer(slot, raw<GPUBuffer>(buffer), offset);
          },
          setStencilReference: (reference) => {
            live();
            pass.setStencilReference(reference);
          },
          draw: (vertexCount, instanceCount, firstVertex = 0, firstInstance = 0) => {
            live();
            if (!pipeline) throw new Error('draw: no pipeline set');
            if (draws) pass.draw(vertexCount, instanceCount ?? 1, firstVertex, firstInstance);
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
