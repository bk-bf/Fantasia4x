import { describe, expect, it } from 'vitest';
import type { GpuDevice } from '$lib/gpu/device';
import { uniformLayout } from '$lib/gpu/uniforms';
import { DrawSlices } from '$lib/webgl/drawSlices';

function device(alignment: number) {
  const writes: { offset: number; data: Uint8Array; size: number }[] = [];
  const buffers: { size: number }[] = [];
  const gpu = {
    limits: () => ({ minUniformBufferOffsetAlignment: alignment }),
    createBindGroupLayout: () => ({}),
    createBindGroup: () => ({}),
    createBuffer: (desc: { size: number }) => {
      buffers.push(desc);
      return desc;
    },
    destroyBuffer: () => {},
    queue: {
      writeBuffer: (_b: unknown, offset: number, data: Uint8Array, _at: number, size: number) =>
        writes.push({ offset, data, size })
    }
  } as unknown as GpuDevice;
  return { gpu, writes, buffers };
}

const DRAW = uniformLayout('D', [{ name: 'u_x', type: 'vec4', precision: 'highp' }]);

describe('draw slices', () => {
  it('stages each draw at its own aligned offset and uploads them in one write', () => {
    const { gpu, writes } = device(256);
    const slices = new DrawSlices(gpu, 'd', DRAW);
    slices.stage(0, { u_x: [1, 2, 3, 4] });
    slices.stage(1, { u_x: [5, 6, 7, 8] });
    slices.upload(2);
    expect(writes).toHaveLength(1);
    expect(writes[0].size).toBe(512);
    const f32 = new Float32Array(writes[0].data.buffer);
    expect([...f32.slice(0, 4)]).toEqual([1, 2, 3, 4]);
    expect([...f32.slice(64, 68)]).toEqual([5, 6, 7, 8]);
    expect(slices.offset(1)).toBe(256);
  });

  it('steps by the device alignment when it is larger than a slice', () => {
    const { gpu } = device(512);
    expect(new DrawSlices(gpu, 'd', DRAW).offset(1)).toBe(512);
  });

  it('grows the buffer and keeps what was staged before', () => {
    const { gpu, writes, buffers } = device(256);
    const slices = new DrawSlices(gpu, 'd', DRAW);
    slices.stage(0, { u_x: [9, 9, 9, 9] });
    for (let i = 1; i < 6; i++) slices.stage(i, { u_x: [i, 0, 0, 0] });
    slices.upload(6);
    expect(buffers.map((b) => b.size)).toEqual([1024, 2048]);
    expect(new Float32Array(writes[0].data.buffer)[0]).toBe(9);
  });
});
