import type { GpuDevice, GpuRenderPass } from '$lib/gpu/device';
import { ShaderManager } from '$lib/webgl/shaders';
import { addTilePipelines } from '$lib/webgl/tilePipelines';
import { FRAME_GROUP, frameBindings } from '$lib/webgl/frameBindings';

export function tileShaders(gpu: GpuDevice, rowDepth: boolean): ShaderManager {
  const shaders = new ShaderManager(gpu);
  const made = addTilePipelines(shaders, { vertex: '', fragment: '' }, gpu.canvas.format, rowDepth);
  if (!made.success) throw new Error(made.error);
  return shaders;
}

export function canvasPass(gpu: GpuDevice): GpuRenderPass {
  const pass = gpu.createCommandEncoder().beginRenderPass({
    colorAttachments: [{ view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }]
  });
  pass.setBindGroup(FRAME_GROUP, frameBindings(gpu).group);
  return pass;
}

export function passOf(renderer: { renderGrid: unknown }): GpuRenderPass {
  return canvasPass((renderer as unknown as { gpu: GpuDevice }).gpu);
}
