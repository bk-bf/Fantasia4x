import { describe, it, vi } from 'vitest';
import { Webgl2Device } from '$lib/gpu/webgl2/device';
import { GroundRings } from '$lib/webgl/groundRings';
import { ShaderManager } from '$lib/webgl/shaders';
import { quietGl } from './glLimits';
import { expectWgslAtGlslSlots } from './wgslSlots';

describe('the ground ring WGSL', () => {
  it('declares every block at the slot the GLSL binds it to', () => {
    const gpu = new Webgl2Device(quietGl());
    const made = vi.spyOn(gpu, 'createRenderPipeline');
    GroundRings.create(gpu, new ShaderManager(gpu));
    expectWgslAtGlslSlots(made.mock.calls.map(([desc]) => desc));
  });
});
