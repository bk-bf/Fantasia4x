import type { GpuSwitch } from './passes.js';
import type { WgslRule } from './shaders.js';

export type GpuChoice =
  | { backend: 'webgpu'; device: GPUDevice; adapter: string; forced: boolean }
  | { backend: 'webgl2'; reason: string };

type AdapterInfo = GPUAdapterInfo & { isFallbackAdapter?: boolean };

export function describeAdapter(info: AdapterInfo): string {
  return [info.vendor, info.architecture, info.device, info.description]
    .filter((part) => part)
    .join(' · ');
}

export async function chooseGpu(gpu: GPU | undefined, forced: GpuSwitch): Promise<GpuChoice> {
  const webgl2 = (reason: string): GpuChoice => ({ backend: 'webgl2', reason });
  if (forced === 'webgl2') return webgl2('?gpu=webgl2');
  if (!gpu) return webgl2('this browser has no navigator.gpu');
  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!adapter) return webgl2('requestAdapter found no WebGPU adapter');
  const info = adapter.info as AdapterInfo;
  const fallback =
    info.isFallbackAdapter ?? (adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter;
  if (fallback) return webgl2(`the only WebGPU adapter is a software fallback (${describeAdapter(info)})`);
  const device = await adapter.requestDevice().catch(() => null);
  if (!device) return webgl2(`requestDevice failed on ${describeAdapter(info)}`);
  return { backend: 'webgpu', device, adapter: describeAdapter(info), forced: forced === 'webgpu' };
}

export function wgslRule(choice: GpuChoice, glslOnlySkipped: boolean): WgslRule {
  if (choice.backend === 'webgpu') return choice.forced ? 'skip' : 'require';
  return glslOnlySkipped ? 'skip' : 'any';
}
