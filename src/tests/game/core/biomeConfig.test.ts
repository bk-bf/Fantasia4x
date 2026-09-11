import { describe, it, expect, afterEach } from 'vitest';
import { applyBiomeShares, getBiomeConfig, resetBiomeConfig } from '$lib/game/core/defs/terrains';

describe('getBiomeConfig / applyBiomeShares', () => {
  afterEach(() => {
    resetBiomeConfig();
  });

  it('returns density-ordered bands whose shares normalize to 1 after applyBiomeShares', () => {
    const before = getBiomeConfig();
    const ids = before.map((b) => b.id);
    const [firstId, secondId] = ids;

    const weights: Record<string, number> = {};
    weights[firstId] = 3;
    weights[secondId] = 1;
    applyBiomeShares(weights);

    const after = getBiomeConfig();
    expect(after.map((b) => b.id)).toEqual(ids);
    expect(after[0].share).toBeCloseTo(0.75);
    expect(after[1].share).toBeCloseTo(0.25);
    const total = after.reduce((s, b) => s + b.share, 0);
    expect(total).toBeCloseTo(1);

    resetBiomeConfig();
    expect(getBiomeConfig()).toEqual(before);
  });

  it('splits shares evenly across every biome when all weights are zero', () => {
    const ids = getBiomeConfig().map((b) => b.id);
    applyBiomeShares({});
    const after = getBiomeConfig();
    for (const entry of after) {
      expect(entry.share).toBeCloseTo(1 / ids.length);
    }
    const total = after.reduce((s, b) => s + b.share, 0);
    expect(total).toBeCloseTo(1);
  });

  it('clamps a negative share to zero instead of shrinking the run', () => {
    const ids = getBiomeConfig().map((b) => b.id);
    const [firstId, secondId] = ids;
    const weights: Record<string, number> = {};
    weights[firstId] = -3;
    weights[secondId] = 1;
    applyBiomeShares(weights);

    const after = getBiomeConfig();
    expect(after[0].share).toBeCloseTo(0);
    expect(after[1].share).toBeCloseTo(1);
    const total = after.reduce((s, b) => s + b.share, 0);
    expect(total).toBeCloseTo(1);
  });
});
