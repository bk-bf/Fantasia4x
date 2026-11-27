import { describe, expect, it, vi } from 'vitest';
import { Webgl2Device } from '$lib/gpu/webgl2/device';
import { createTileRendererShaders } from '$lib/webgl/shaders';
import { TILE_ATTRIBUTES } from '$lib/webgl/tilePipelines';
import { quietGl } from './glLimits';
import { expectWgslAtGlslSlots } from './wgslSlots';

describe('the tile renderer WGSL', () => {
  for (const painted of [false, true])
    for (const rowDepth of [false, true])
      it(`binds every block, texture and attribute where the GLSL does, painted ${painted}, row depth ${rowDepth}`, async () => {
        const gpu = new Webgl2Device(quietGl());
        const made = vi.spyOn(gpu, 'createRenderPipeline');
        await createTileRendererShaders(gpu, false, painted, rowDepth);
        const descs = made.mock.calls.map(([desc]) => desc);
        expectWgslAtGlslSlots(descs);
        for (const desc of descs) {
          const code = desc.wgsl!.code;
          expect(code).toContain(`const PAINTED = ${painted};`);
          for (const { shaderLocation } of desc.vertex.buffers[0].attributes) {
            const name = Object.keys(TILE_ATTRIBUTES).find((n) => TILE_ATTRIBUTES[n] === shaderLocation);
            expect(code).toContain(`@location(${shaderLocation}) ${name}:`);
          }
          expect(code.includes('fn vs(glyph: GlyphIn, row: RowIn)')).toBe(rowDepth);
        }
      });
});
