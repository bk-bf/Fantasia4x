import { describe, it, expect } from 'vitest';
import { researchService } from '$lib/game/services/ResearchService';
import { buildScenario } from '$lib/game/headless/Scenario';
import { initialGameState } from '$lib/game/core/state/initialState';

describe('completing research', () => {
  it('gives the state a new completedResearch array and leaves the previous one alone', () => {
    const prev = buildScenario({ seed: 3, map: { w: 16, h: 16 }, pawns: [{ count: 1 }] });
    const id = researchService
      .getAllResearch()
      .find((r) => !prev.completedResearch.includes(r.id))!.id;
    const before = [...prev.completedResearch];

    const next = researchService.completeResearch(id, prev);

    expect(next.completedResearch).toContain(id);
    expect(next.completedResearch).not.toBe(prev.completedResearch);
    expect(prev.completedResearch).toEqual(before);
  });

  it('in one scenario does not unlock it in the next one', () => {
    buildScenario({
      seed: 1,
      map: { w: 16, h: 16 },
      pawns: [{ count: 1 }],
      researchMaxTier: 2,
      seedEntities: false
    });
    const second = buildScenario({
      seed: 2,
      map: { w: 16, h: 16 },
      pawns: [{ count: 1 }],
      seedEntities: false
    });

    expect(initialGameState.completedResearch).toHaveLength(0);
    expect(second.completedResearch).toHaveLength(0);
  });
});
