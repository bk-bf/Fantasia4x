import { describe, it, expect } from 'vitest';
import { resolveAmbient } from '$lib/audio/manifest';

describe('resolveAmbient calm fallback', () => {
  it('sets a resting forest bed for windy daytime weather with no other calm rule', () => {
    const layers = resolveAmbient({ weatherType: 'gale', isNight: false, intensity: 0 });
    expect(layers.forest).toBe(0.15);
  });

  it('takes the night-crickets branch instead of the fallback when it is night', () => {
    const layers = resolveAmbient({ weatherType: 'gale', isNight: true, intensity: 0 });
    expect(layers['night-crickets']).toBe(0.45);
    expect(layers.forest).toBeUndefined();
  });

  it('gives clear daytime weather birds and forest, not the fallback', () => {
    const layers = resolveAmbient({ weatherType: 'clear', isNight: false, intensity: 0 });
    expect(layers['birds-day']).toBe(0.4);
    expect(layers.forest).toBe(0.2);
  });
});
