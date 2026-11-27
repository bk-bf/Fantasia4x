import { describe, expect, it } from 'vitest';
import { UniformBlock, glslBlock, uniformLayout, withBlocks } from '../../lib/gpu/uniforms.js';
import type { GpuBuffer, GpuQueue } from '../../lib/gpu/device.js';
import { VIEW } from '../../lib/webgl/frameBindings.js';

function queue() {
  const writes: { offset: number; bytes: number[] }[] = [];
  const q = {
    writeBuffer: (_b: GpuBuffer, offset: number, data: Uint8Array) =>
      writes.push({ offset, bytes: [...data] })
  } as unknown as GpuQueue;
  return { q, writes };
}

describe('std140 uniform layouts', () => {
  it('puts the view block where WGSL puts the same struct', () => {
    expect(VIEW.offsets).toEqual({ u_projection: 0, u_canvas: 64, u_viewOffset: 72, u_zoom: 80 });
    expect(VIEW.size).toBe(96);
  });

  it('packs a scalar into the tail of a vec3 and rounds the block to 16 bytes', () => {
    const layout = uniformLayout('B', [
      { name: 'a', type: 'vec3', precision: 'highp' },
      { name: 'b', type: 'float', precision: 'highp' },
      { name: 'c', type: 'vec2', precision: 'mediump' },
      { name: 'd', type: 'ivec4', precision: 'highp', count: 2 },
      { name: 'e', type: 'int', precision: 'highp' }
    ]);
    expect(layout.offsets).toEqual({ a: 0, b: 12, c: 16, d: 32, e: 64 });
    expect(layout.size).toBe(80);
  });

  it('refuses a scalar array, whose std140 stride WGSL cannot match', () => {
    expect(() =>
      uniformLayout('B', [{ name: 'a', type: 'float', precision: 'highp', count: 4 }])
    ).toThrow(/WGSL/);
  });

  it('declares each member with its precision, after the version line', () => {
    const layout = uniformLayout('B', [
      { name: 'a', type: 'vec4', precision: 'mediump', count: 3 },
      { name: 'b', type: 'float', precision: 'highp' }
    ]);
    expect(glslBlock(layout)).toBe(
      'layout(std140) uniform B {\n  mediump vec4 a[3];\n  highp float b;\n};\n'
    );
    expect(withBlocks('#version 300 es\nvoid main() {}\n', [layout])).toBe(
      '#version 300 es\n' + glslBlock(layout) + 'void main() {}\n'
    );
  });
});

describe('a uniform block', () => {
  it('writes vec3 array elements on a 16-byte stride and integers as integers', () => {
    const layout = uniformLayout('B', [
      { name: 'a', type: 'vec3', precision: 'highp', count: 2 },
      { name: 'n', type: 'int', precision: 'highp' }
    ]);
    const block = new UniformBlock(layout);
    block.set('a', [1, 2, 3, 4, 5, 6]);
    block.set('n', 7.9);
    const f32 = new Float32Array(block.bytes.buffer);
    expect([...f32.slice(0, 8)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0]);
    expect(new Int32Array(block.bytes.buffer)[8]).toBe(7);
  });

  it('uploads only after a value changes', () => {
    const block = new UniformBlock(VIEW);
    const { q, writes } = queue();
    const buffer = {} as GpuBuffer;
    block.set('u_zoom', [2, 2]);
    block.upload(q, buffer, 256);
    block.set('u_zoom', [2, 2]);
    block.upload(q, buffer, 256);
    expect(writes.map((w) => w.offset)).toEqual([256]);
    block.set('u_zoom', [3, 2]);
    block.upload(q, buffer, 256);
    expect(writes).toHaveLength(2);
    expect(writes[0].bytes).toHaveLength(VIEW.size);
  });

  it('refuses a member the layout does not have', () => {
    expect(() => new UniformBlock(VIEW).set('u_nope', 1)).toThrow(/no member u_nope/);
  });
});
