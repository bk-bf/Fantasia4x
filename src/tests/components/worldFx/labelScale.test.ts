import { describe, expect, it } from 'vitest';
import { LABEL_HIDE_BELOW, labelScale } from '$lib/components/UI/canvas/worldFx/layer';

describe('floater and bubble size', () => {
  it('follows the map in whole pixels, as the mockup does', () => {
    expect(labelScale(2, 100)).toBe(2);
    expect(labelScale(1.5, 100)).toBe(2);
    expect(labelScale(1, 100)).toBe(1);
    expect(labelScale(2, 50)).toBe(1);
    expect(labelScale(2, 150)).toBe(3);
    expect(labelScale(2, 200)).toBe(4);
  });

  it('shrinks as the camera zooms out and is hidden once the map is too small', () => {
    const zooms = [2, 1.5, 1, 0.75, 0.5, 0.25];
    const sizes = zooms.map((k) => labelScale(k, 100));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(labelScale(LABEL_HIDE_BELOW - 0.01, 100)).toBe(0);
    expect(labelScale(0.25, 200)).toBe(0);
  });
});
