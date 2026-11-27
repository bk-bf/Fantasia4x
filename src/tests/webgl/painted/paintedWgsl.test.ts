import { describe, it, vi } from 'vitest';
import type { GpuDevice } from '$lib/gpu/device';
import { Webgl2Device } from '$lib/gpu/webgl2/device';
import { ShaderManager } from '$lib/webgl/shaders';
import type { LoadedPaintedTileset } from '$lib/webgl/painted/loader';
import { PaintedVignette } from '$lib/webgl/painted/vignette';
import { PaintedLightPass } from '$lib/webgl/painted/lightPass';
import { PaintedShadowCast } from '$lib/webgl/painted/shadowCast';
import { FallingLeaves } from '$lib/webgl/painted/leaves';
import { Tiers } from '$lib/webgl/painted/tiers';
import { quietGl } from '../glLimits';
import { expectWgslAtGlslSlots } from '../wgslSlots';

const passes: Record<string, (gpu: GpuDevice, shaders: ShaderManager) => unknown> = {
  vignette: (gpu, shaders) => PaintedVignette.create(gpu, shaders),
  'light field': (gpu, shaders) => PaintedLightPass.create(gpu, shaders),
  'shadow cast': (gpu, shaders) => PaintedShadowCast.create(gpu, shaders),
  leaf: (gpu, shaders) => FallingLeaves.create(gpu, shaders),
  'rock tier': (gpu, shaders) => Tiers.create(gpu, shaders, {} as LoadedPaintedTileset)
};

describe('the painted passes in WGSL', () => {
  for (const [name, create] of Object.entries(passes))
    it(`declares every ${name} block and texture at the slot the GLSL binds it to`, () => {
      const gpu = new Webgl2Device(quietGl());
      const made = vi.spyOn(gpu, 'createRenderPipeline');
      create(gpu, new ShaderManager(gpu));
      expectWgslAtGlslSlots(made.mock.calls.map(([desc]) => desc));
    });
});
