import { describe, it, expect } from 'vitest';
import { decodePng } from '$lib/webgl/painted/png';
import { encodePng } from './pngFile';

function noise(length: number): Uint8Array {
  const out = new Uint8Array(length);
  let s = 12345;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

describe('reading a painted PNG into bytes', () => {
  it('returns every byte the file stores, through all five row filters and split data chunks', async () => {
    const [width, height] = [7, 10];
    const pixels = noise(width * height * 4);
    const image = await decodePng(encodePng(pixels, width, height, (y) => y % 5));
    expect(image.width).toBe(width);
    expect(image.height).toBe(height);
    expect(Buffer.from(image.data).equals(Buffer.from(pixels))).toBe(true);
  });

  it('keeps colour under zero alpha instead of premultiplying it away', async () => {
    const pixels = new Uint8Array([200, 100, 50, 0, 10, 20, 30, 1]);
    const image = await decodePng(encodePng(pixels, 2, 1, () => 0));
    expect([...image.data]).toEqual([...pixels]);
  });

  it('refuses a format it does not read', async () => {
    const rgb = encodePng(new Uint8Array(4), 1, 1, () => 0, { colour: 2 });
    await expect(decodePng(rgb)).rejects.toThrow('colour type 2');
    const interlaced = encodePng(new Uint8Array(4), 1, 1, () => 0, { interlace: 1 });
    await expect(decodePng(interlaced)).rejects.toThrow('interlace 1');
    await expect(decodePng(new Uint8Array([1, 2, 3]))).rejects.toThrow('not a PNG');
  });
});
