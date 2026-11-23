import { describe, expect, it } from 'vitest';
import { HIDE_BELOW_TILE_PX, labelScale } from '$lib/components/UI/canvas/worldFx/layer';
import { ART_TILE } from '$lib/components/UI/canvas/worldFx/figure';

const atTile = (px: number) => px / ART_TILE;

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
    const zooms = [64, 48, 32, 24, 21, 16, 8].map(atTile);
    const sizes = zooms.map((k) => labelScale(k, 100));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(labelScale(atTile(HIDE_BELOW_TILE_PX), 100)).toBeGreaterThan(0);
    expect(labelScale(atTile(HIDE_BELOW_TILE_PX - 1), 100)).toBe(0);
  });

  it('hides at the same zoom whatever the size setting', () => {
    for (const pct of [50, 100, 150, 200]) {
      expect(labelScale(atTile(20), pct)).toBe(0);
      expect(labelScale(atTile(22), pct)).toBeGreaterThan(0);
    }
  });
});
