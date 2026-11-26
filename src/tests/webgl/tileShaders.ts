import type { GpuDevice } from '$lib/gpu/device';
import { ShaderManager } from '$lib/webgl/shaders';
import { addTilePipelines } from '$lib/webgl/tilePipelines';

export function tileShaders(gpu: GpuDevice, rowDepth: boolean): ShaderManager {
  const shaders = new ShaderManager(gpu);
  const made = addTilePipelines(shaders, { vertex: '', fragment: '' }, gpu.canvasFormat, rowDepth);
  if (!made.success) throw new Error(made.error);
  return shaders;
}
