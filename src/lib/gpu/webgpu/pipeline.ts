import {
  WGSL_FRAGMENT_ENTRY,
  WGSL_VERTEX_ENTRY,
  type BindGroupLayoutEntry,
  type GpuBindGroupLayout,
  type GpuRenderPipeline,
  type GpuShaderModule,
  type RenderPipelineDescriptor,
  type RenderPipelineResult,
  type VertexBufferLayout
} from '../device.js';
import { blendState, depthStencilState, vertexBuffers } from './formats.js';
import { pipelineLayoutError, type BindingLimits } from './limits.js';

interface Built {
  label: string;
  pipeline: GPURenderPipeline | null;
  failed: boolean;
  buffers: readonly VertexBufferLayout[];
}

function reportCompilation(label: string, code: string, module: GPUShaderModule): void {
  void module.getCompilationInfo().then((info) => {
    const errors = info.messages.filter((m) => m.type === 'error');
    if (errors.length === 0) return;
    const lines = code.split('\n');
    console.group(`❌ WGSL compilation failed: ${label}`);
    for (const m of errors)
      console.error(`${m.lineNum}:${m.linePos} ${m.message}\n${lines[m.lineNum - 1] ?? ''}`);
    console.groupEnd();
  });
}

export class WebgpuPipelines {
  private readonly modules = new Map<string, GPUShaderModule>();
  private readonly built = new WeakMap<GpuRenderPipeline, Built>();

  constructor(
    private readonly device: GPUDevice,
    private readonly limits: BindingLimits,
    private readonly entriesOf: (layout: GpuBindGroupLayout) => readonly BindGroupLayoutEntry[]
  ) {}

  private module(label: string, code: string): GPUShaderModule {
    let module = this.modules.get(code);
    if (!module) {
      module = this.device.createShaderModule({ label, code });
      reportCompilation(label, code, module);
      this.modules.set(code, module);
    }
    return module;
  }

  create(desc: RenderPipelineDescriptor): RenderPipelineResult {
    if (!desc.wgsl) return { ok: false, error: `${desc.label} carries no WGSL`, modules: [] };
    const over = pipelineLayoutError(desc.layout.map(this.entriesOf), this.limits);
    if (over) return { ok: false, error: `${desc.label}: ${over}`, modules: [] };
    const device = this.device;
    const module = this.module(desc.label, desc.wgsl.code);
    const target = desc.fragment.targets[0];
    const handle = { label: desc.label } as unknown as GpuRenderPipeline;
    const built: Built = {
      label: desc.label,
      pipeline: null,
      failed: false,
      buffers: desc.vertex.buffers
    };
    this.built.set(handle, built);
    device
      .createRenderPipelineAsync({
        label: desc.label,
        layout: device.createPipelineLayout({
          label: desc.label,
          bindGroupLayouts: desc.layout as unknown as GPUBindGroupLayout[]
        }),
        vertex: {
          module,
          entryPoint: WGSL_VERTEX_ENTRY,
          buffers: vertexBuffers(desc.vertex.buffers)
        },
        fragment: {
          module,
          entryPoint: WGSL_FRAGMENT_ENTRY,
          targets: [{ format: target.format, blend: blendState(target.blend) }]
        },
        primitive: { topology: desc.primitive.topology },
        depthStencil: depthStencilState(desc.depthStencil)
      })
      .then(
        (pipeline) => {
          if (!built.failed) built.pipeline = pipeline;
        },
        (error: unknown) => {
          built.failed = true;
          console.error(
            `❌ WebGPU pipeline ${desc.label} is invalid and will not draw: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      );
    return {
      ok: true,
      pipeline: handle,
      modules: [{ label: desc.label, module: module as unknown as GpuShaderModule }]
    };
  }

  private of(pipeline: GpuRenderPipeline): Built {
    const built = this.built.get(pipeline);
    if (!built) throw new Error('not a pipeline this device created');
    return built;
  }

  ready(pipeline: GpuRenderPipeline): GPURenderPipeline | null {
    return this.of(pipeline).pipeline;
  }

  buffers(pipeline: GpuRenderPipeline): readonly VertexBufferLayout[] {
    return this.of(pipeline).buffers;
  }

  retire(pipeline: GpuRenderPipeline): void {
    const built = this.of(pipeline);
    built.failed = true;
    built.pipeline = null;
  }

  forget(module: GpuShaderModule): void {
    for (const [code, m] of this.modules)
      if (m === (module as unknown as GPUShaderModule)) this.modules.delete(code);
  }
}
