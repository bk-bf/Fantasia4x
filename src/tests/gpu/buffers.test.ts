import { describe, expect, it } from 'vitest';
import { Webgl2Buffers } from '../../lib/gpu/webgl2/buffers.js';
import { BufferUsage } from '../../lib/gpu/device.js';

function recordingGl() {
  const constants = {
    ARRAY_BUFFER: 0x8892,
    UNIFORM_BUFFER: 0x8a11,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8
  };
  const calls: unknown[][] = [];
  const gl = new Proxy(constants, {
    get: (target, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key as keyof typeof target];
      return (...args: unknown[]) => {
        calls.push([key, ...args]);
        return {};
      };
    }
  });
  return { buffers: new Webgl2Buffers(gl as unknown as WebGL2RenderingContext), calls };
}

describe('webgl2 buffers', () => {
  it('allocates the size it is given on the target its usage names', () => {
    const { buffers, calls } = recordingGl();
    buffers.create({ size: 64, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    buffers.create({ size: 256, usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST });
    expect(calls.filter((c) => c[0] === 'bufferData')).toEqual([
      ['bufferData', 0x8892, 64, 0x88e4],
      ['bufferData', 0x8a11, 256, 0x88e8]
    ]);
  });

  it('replaces the whole store only for a write that covers all of it', () => {
    const { buffers, calls } = recordingGl();
    const buffer = buffers.create({ size: 16, usage: BufferUsage.VERTEX });
    calls.length = 0;
    const whole = new Float32Array(4);
    const half = new Float32Array(2);
    buffers.write(buffer, 0, whole);
    buffers.write(buffer, 0, half);
    buffers.write(buffer, 8, half);
    buffers.write(buffer, 0, whole, 1, 2);
    expect(calls.filter((c) => c[0] !== 'bindBuffer')).toEqual([
      ['bufferData', 0x8892, whole, 0x88e4, 0, 4],
      ['bufferSubData', 0x8892, 0, half, 0, 2],
      ['bufferSubData', 0x8892, 8, half, 0, 2],
      ['bufferSubData', 0x8892, 0, whole, 1, 2]
    ]);
  });

  it('refuses a write past the end of the buffer', () => {
    const { buffers } = recordingGl();
    const buffer = buffers.create({ size: 8, usage: BufferUsage.VERTEX });
    expect(() => buffers.write(buffer, 4, new Float32Array(2))).toThrow(/overrun/);
  });
});
