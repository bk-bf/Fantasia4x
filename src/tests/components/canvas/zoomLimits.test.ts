import { describe, it, expect } from 'vitest';
import { farZoomTileSize, farZoomShare } from '$lib/components/UI/canvas/zoomLimits';

describe('the farthest zoom', () => {
  it('fits the whole of a medium map', () => {
    expect(farZoomShare(500, 500)).toBe(1);
    expect(farZoomTileSize(1440, 870, 500, 500)).toBeCloseTo(2.88);
  });

  it('stops at 90% of a large map', () => {
    expect(farZoomShare(750, 750)).toBe(0.9);
    expect(farZoomTileSize(1440, 870, 750, 750)).toBeCloseTo(1440 / 750 / 0.9);
  });

  it('stops at 90% of an extra-large map too', () => {
    expect(farZoomShare(1000, 1000)).toBe(0.9);
  });
});
