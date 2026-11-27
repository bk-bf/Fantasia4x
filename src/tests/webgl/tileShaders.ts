import type { GpuDevice, GpuRenderPass } from '$lib/gpu/device';
import { ShaderManager } from '$lib/webgl/shaders';
import { addTilePipelines } from '$lib/webgl/tilePipelines';

export function tileShaders(gpu: GpuDevice, rowDepth: boolean): ShaderManager {
  const shaders = new ShaderManager(gpu);
  const made = addTilePipelines(shaders, { vertex: '', fragment: '' }, gpu.canvas.format, rowDepth);
  if (!made.success) throw new Error(made.error);
  return shaders;
}

export function canvasPass(gpu: GpuDevice): GpuRenderPass {
  return gpu.createCommandEncoder().beginRenderPass({
    colorAttachments: [{ view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }]
  });
}

export function passOf(renderer: { renderGrid: unknown }): GpuRenderPass {
  return canvasPass((renderer as unknown as { gpu: GpuDevice }).gpu);
}
