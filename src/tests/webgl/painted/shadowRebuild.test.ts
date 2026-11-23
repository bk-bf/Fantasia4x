import { describe, it, expect } from 'vitest';
import { rebuildDue, SHADOW_REFRESH_MS } from '$lib/webgl/painted/shadowCast';

const rect = { x: 10, y: 20, w: 240, h: 145 };

describe('rebuildDue', () => {
  it('rebuilds the first time', () => {
    expect(rebuildDue({ rect: null, at: 0 }, rect, 5)).toBe(true);
  });

  it('holds a rebuild for an unchanged view inside the refresh window', () => {
    expect(rebuildDue({ rect, at: 1000 }, { ...rect }, 1000 + SHADOW_REFRESH_MS - 1)).toBe(false);
  });

  it('rebuilds an unchanged view once the refresh window has passed', () => {
    expect(rebuildDue({ rect, at: 1000 }, { ...rect }, 1000 + SHADOW_REFRESH_MS)).toBe(true);
  });

  it('rebuilds at once when the view moves or resizes', () => {
    expect(rebuildDue({ rect, at: 1000 }, { ...rect, x: 11 }, 1001)).toBe(true);
    expect(rebuildDue({ rect, at: 1000 }, { ...rect, w: 200 }, 1001)).toBe(true);
  });
});
