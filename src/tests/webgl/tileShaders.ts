import type { GpuDevice, GpuRenderPass } from '$lib/gpu/device';
import { ShaderManager } from '$lib/webgl/shaders';
import { TileShading } from '$lib/webgl/tileShading';
import { FRAME_GROUP, frameBindings } from '$lib/webgl/frameBindings';

export function tileShaders(gpu: GpuDevice, rowDepth: boolean): TileShading {
  const made = TileShading.create(
    gpu,
    new ShaderManager(gpu),
    { vertex: '', fragment: '' },
    gpu.canvas.format,
    rowDepth
  );
  if ('error' in made) throw new Error(made.error);
  return made;
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
