import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { getScenarioPreset } from '$lib/game/headless/scenarios/presets';

const zoneTiles = (spec: Parameters<typeof buildScenario>[0]) =>
  Object.keys((buildScenario(spec) as { zoneTiles?: Record<string, unknown> }).zoneTiles ?? {})
    .length;

describe('the whole-map stockpile a scenario starts with', () => {
  it('covers every tile by default', () => {
    expect(zoneTiles({ seed: 1, map: { w: 12, h: 10 }, seedEntities: false })).toBe(120);
  });

  it('is left out when wholeMapStockpile is false', () => {
    expect(
      zoneTiles({ seed: 1, map: { w: 12, h: 10 }, seedEntities: false, wholeMapStockpile: false })
    ).toBe(0);
  });

  it('is left out of the large-wilderness preset, so the benchmark map holds no zones', () => {
    expect(getScenarioPreset('large-wilderness')!.spec.wholeMapStockpile).toBe(false);
  });
});
