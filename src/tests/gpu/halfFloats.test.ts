import { describe, it, expect } from 'vitest';
import { halfFloats } from '$lib/gpu/device';

describe('half floats for an rgba16float upload', () => {
  it('packs the values a light field holds to their nearest half, ties to even', () => {
    expect(Array.from(halfFloats([0, 1, 0.5, 2, -1]))).toEqual([
      0x0000, 0x3c00, 0x3800, 0x4000, 0xbc00
    ]);
    expect(halfFloats([1 + 2 ** -11])[0]).toBe(0x3c00);
    expect(halfFloats([1 + 3 * 2 ** -11])[0]).toBe(0x3c02);
    expect(halfFloats([0.1])[0]).toBe(0x2e66);
  });

  it('keeps one half per value, four to a texel', () => {
    expect(halfFloats(new Float32Array(12))).toHaveLength(12);
  });
});
