import { describe, it, expect } from 'vitest';
import { researchService } from '$lib/game/services/ResearchService';
import { perTick } from '$lib/game/core/util/time';
import type { GameState } from '$lib/game/core/types';

function researching(id: string, progress: number): GameState {
  const project = researchService.getResearchById(id)!;
  return {
    completedResearch: [],
    availableResearch: [],
    currentToolLevel: 0,
    currentResearch: { ...project, currentProgress: progress }
  } as unknown as GameState;
}

describe('research ticks', () => {
  it('completes on the tick that reaches its research time and raises the tool level', () => {
    const time = researchService.getResearchById('copper_smelting')!.researchTime;
    const s = researchService.processResearchTick(
      researching('copper_smelting', time - perTick(1))
    );
    expect(s.currentResearch).toBeUndefined();
    expect(s.completedResearch).toContain('copper_smelting');
    expect(s.currentToolLevel).toBe(1);
  });

  it('is still running one tick short of its research time', () => {
    const time = researchService.getResearchById('copper_smelting')!.researchTime;
    const s = researchService.processResearchTick(
      researching('copper_smelting', time - 2 * perTick(1))
    );
    expect(s.currentResearch?.currentProgress).toBeCloseTo(time - perTick(1));
    expect(s.completedResearch).toHaveLength(0);
  });
});
