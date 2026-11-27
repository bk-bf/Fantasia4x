import { expect } from 'vitest';
import type { RenderPipelineDescriptor } from '$lib/gpu/device';
import { wgslInstance } from '$lib/gpu/uniforms';

export function expectWgslAtGlslSlots(descs: readonly RenderPipelineDescriptor[]): void {
  expect(descs.length).toBeGreaterThan(0);
  for (const { glsl, wgsl } of descs) {
    const code = wgsl!.code;
    for (const [name, { slot }] of Object.entries(glsl.blocks ?? {}))
      expect(code).toContain(
        `@group(${slot[0]}) @binding(${slot[1]}) var<uniform> ${wgslInstance(name)}: ${name};`
      );
    for (const [name, { texture }] of Object.entries(glsl.textures ?? {}))
      expect(code).toContain(`@group(${texture[0]}) @binding(${texture[1]}) var ${name}: texture_2d<`);
    expect(code).toMatch(/@vertex\s+fn vs\(/);
    expect(code).toMatch(/@fragment\s+fn fs\(/);
  }
}
