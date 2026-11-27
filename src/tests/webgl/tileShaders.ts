import type { GpuCommandEncoder, GpuDevice, GpuRenderPass } from '$lib/gpu/device';
import type { GameGrid } from '$lib/webgl/game-grid';
import type { GridRenderer, GridRenderOptions } from '$lib/webgl/grid-renderer';
import { ShaderManager } from '$lib/webgl/shaders';
import { TileShading } from '$lib/webgl/tileShading';
import { FRAME_GROUP, frameBindings } from '$lib/webgl/frameBindings';

export function tileShaders(gpu: GpuDevice, rowDepth: boolean): TileShading {
  const made = TileShading.create(
    gpu,
    new ShaderManager(gpu),
    { vertex: '', fragment: '' },
    gpu.canvas.format,
    rowDepth ? 'depth24plus' : null
  );
  if ('error' in made) throw new Error(made.error);
  return made;
}

function canvasPassOn(gpu: GpuDevice, encoder: GpuCommandEncoder): GpuRenderPass {
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: gpu.canvas.getCurrentTexture(), loadOp: 'load', storeOp: 'store' }]
  });
  pass.setBindGroup(FRAME_GROUP, frameBindings(gpu).group);
  return pass;
}

export function canvasPass(gpu: GpuDevice): GpuRenderPass {
  return canvasPassOn(gpu, gpu.createCommandEncoder());
}

export function renderGrid(
  renderer: GridRenderer,
  grid: GameGrid,
  options: GridRenderOptions
): void {
  const gpu = (renderer as unknown as { gpu: GpuDevice }).gpu;
  const draw = renderer.prepareGrid(grid, options);
  const encoder = gpu.createCommandEncoder();
  const pass = canvasPassOn(gpu, encoder);
  renderer.encodeGrid(pass, draw);
  pass.end();
  gpu.queue.submit([encoder.finish()]);
}
