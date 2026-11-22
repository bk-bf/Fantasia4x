import { describe, it, expect } from 'vitest';
import type { GameState } from '$lib/game/core/types';
import { jobService } from '$lib/game/services/JobService';
import { designationService } from '$lib/game/services/DesignationService';
import { itemService } from '$lib/game/services/ItemService';
import { buildScenario } from '$lib/game/headless/Scenario';

function growScenario(seeds: number): GameState {
  const gs = buildScenario({
    seed: 5,
    map: { w: 16, h: 16 },
    pawns: [{ count: 1 }],
    items: { grain_seed: seeds },
    seedEntities: false
  });
  return designationService.designateRect(2, 2, 4, 2, 'grow', gs);
}

const plantJobs = (gs: GameState) => gs.jobs.filter((j) => j.type === 'plant');

const plantedTiles = (gs: GameState) =>
  gs.worldMap
    .flat()
    .filter(
      (t) => t.growth && Object.keys(t.growth).length > 0 && t.y === 2 && t.x >= 2 && t.x <= 4
    ).length;

describe('plant jobs against the seed stock', () => {
  it('queues no more plant jobs than there are seeds', () => {
    expect(plantJobs(jobService.generateJobs(growScenario(1)))).toHaveLength(1);
    expect(plantJobs(jobService.generateJobs(growScenario(2)))).toHaveLength(2);
    expect(plantJobs(jobService.generateJobs(growScenario(5)))).toHaveLength(3);
  });

  it('keeps no plant job that no seed can fill once the stock runs out', () => {
    let gs = jobService.generateJobs(growScenario(1));
    const first = plantJobs(gs)[0];
    gs = jobService.claimJob(gs.pawns[0].id, first.id, gs);
    gs = jobService.advanceJob(first.id, 999, gs);
    expect(plantedTiles(gs)).toBe(1);
    gs = jobService.generateJobs(gs);
    expect(plantJobs(gs)).toHaveLength(0);
  });

  it('drops unclaimed plant jobs left over from a larger stock', () => {
    let gs = jobService.generateJobs(growScenario(3));
    expect(plantJobs(gs)).toHaveLength(3);
    gs = itemService.consumeItems({ grain_seed: 3 }, gs);
    expect(gs.stockpile?.grain_seed ?? 0).toBe(0);
    gs = jobService.generateJobs(gs);
    expect(plantJobs(gs)).toHaveLength(0);
  });
});
