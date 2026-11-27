import {
  WGSL_FRAGMENT_ENTRY,
  WGSL_VERTEX_ENTRY,
  type GpuRenderPipeline,
  type GpuShaderModule,
  type RenderPipelineDescriptor,
  type RenderPipelineResult
} from '../device.js';
import { blendState, depthStencilState, vertexBuffers } from './formats.js';

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
  private readonly skipped = new WeakSet<GPURenderPipeline>();

  constructor(private readonly device: GPUDevice) {}

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
    const device = this.device;
    device.pushErrorScope('validation');
    const module = this.module(desc.label, desc.wgsl.code);
    const target = desc.fragment.targets[0];
    const pipeline = device.createRenderPipeline({
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
    });
    void device.popErrorScope().then((error) => {
      if (!error) return;
      this.skipped.add(pipeline);
      console.error(`❌ WebGPU pipeline ${desc.label} is invalid and will not draw: ${error.message}`);
    });
    return {
      ok: true,
      pipeline: pipeline as unknown as GpuRenderPipeline,
      modules: [{ label: desc.label, module: module as unknown as GpuShaderModule }]
    };
  }

  draws(pipeline: GpuRenderPipeline): boolean {
    return !this.skipped.has(pipeline as unknown as GPURenderPipeline);
  }

  retire(pipeline: GpuRenderPipeline): void {
    this.skipped.add(pipeline as unknown as GPURenderPipeline);
  }

  forget(module: GpuShaderModule): void {
    for (const [code, m] of this.modules)
      if (m === (module as unknown as GPUShaderModule)) this.modules.delete(code);
  }
}
