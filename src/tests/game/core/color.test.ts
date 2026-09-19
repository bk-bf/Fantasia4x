import { describe, it, expect } from 'vitest';
import { hexToRgb01, parseHexRgb01 } from '$lib/game/core/util/color';

describe('color conversion', () => {
  it('parseHexRgb01 scales each channel to 0..1 in R,G,B order', () => {
    expect(parseHexRgb01('#ff0000')).toEqual([1, 0, 0]);
    expect(parseHexRgb01('#00ff00')).toEqual([0, 1, 0]);
    expect(parseHexRgb01('#0000ff')).toEqual([0, 0, 1]);
    expect(parseHexRgb01('336699')).toEqual([0x33 / 255, 0x66 / 255, 0x99 / 255]);
  });

  it('parseHexRgb01 returns null for anything that is not a 6-digit hex string', () => {
    expect(parseHexRgb01('#fff')).toBeNull();
    expect(parseHexRgb01('not-a-color')).toBeNull();
    expect(parseHexRgb01(123456)).toBeNull();
    expect(parseHexRgb01(undefined)).toBeNull();
  });

  it('hexToRgb01 converts a valid hex and ignores the fallback', () => {
    expect(hexToRgb01('#ff8000', [0, 0, 0])).toEqual([1, 0x80 / 255, 0]);
  });

  it('hexToRgb01 returns the given fallback for invalid input', () => {
    expect(hexToRgb01('nope', [0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3]);
    expect(hexToRgb01(undefined, [0.4, 0.5, 0.6])).toEqual([0.4, 0.5, 0.6]);
  });
});
