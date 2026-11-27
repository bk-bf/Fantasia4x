import { describe, it, vi } from 'vitest';
import { Webgl2Device } from '$lib/gpu/webgl2/device';
import { ShaderManager } from '$lib/webgl/shaders';
import { PaintedVignette } from '$lib/webgl/painted/vignette';
import { PaintedLightPass } from '$lib/webgl/painted/lightPass';
import { PaintedShadowCast } from '$lib/webgl/painted/shadowCast';
import { FallingLeaves } from '$lib/webgl/painted/leaves';
import { quietGl } from '../glLimits';
import { expectWgslAtGlslSlots } from '../wgslSlots';

const passes = {
  vignette: PaintedVignette,
  'light field': PaintedLightPass,
  'shadow cast': PaintedShadowCast,
  leaf: FallingLeaves
};

describe('the painted passes in WGSL', () => {
  for (const [name, pass] of Object.entries(passes))
    it(`declares every ${name} block and texture at the slot the GLSL binds it to`, () => {
      const gpu = new Webgl2Device(quietGl());
      const made = vi.spyOn(gpu, 'createRenderPipeline');
      pass.create(gpu, new ShaderManager(gpu));
      expectWgslAtGlslSlots(made.mock.calls.map(([desc]) => desc));
    });
});
