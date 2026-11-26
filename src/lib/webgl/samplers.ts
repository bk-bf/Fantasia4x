import type { GpuDevice, GpuSampler } from '../gpu/device.js';

export interface FrameSamplers {
  nearest: GpuSampler;
  linear: GpuSampler;
}

const made = new WeakMap<GpuDevice, FrameSamplers>();

export function samplersOf(gpu: GpuDevice): FrameSamplers {
  let samplers = made.get(gpu);
  if (!samplers) {
    const clamp = { addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' } as const;
    samplers = {
      nearest: gpu.createSampler({ minFilter: 'nearest', magFilter: 'nearest', ...clamp }),
      linear: gpu.createSampler({ minFilter: 'linear', magFilter: 'linear', ...clamp })
    };
    made.set(gpu, samplers);
  }
  return samplers;
}
