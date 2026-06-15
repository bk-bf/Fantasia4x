import { describe, it, expect } from 'vitest';
import { jobService } from './JobService';
import type { GameState, WorldTile } from '../core/types';

/**
 * Regression for the O(1) Set dedup in `_syncHarvestJobs` (replacing the O(designations × jobs)
 * `jobs.some(...)` scan — ~8% of worker CPU). Behaviour must be unchanged: exactly one harvest job
 * per designated (x,y,resourceId) with resources present, and re-running generation must NOT create
 * duplicates.
 */
function tile(over: Partial<WorldTile>): WorldTile {
  return {
    x: 0,
    y: 0,
    walkable: true,
    subType: 'grass',
    resources: {} as Record<string, number>,
    ...over
  } as WorldTile;
}

function stateWith(worldMap: WorldTile[][], designations: Record<string, string>): GameState {
  return {
    jobs: [],
    worldMap,
    designations,
    buildings: [],
    droppedItems: [],
    craftingQueue: []
  } as unknown as GameState;
}

describe('_syncHarvestJobs dedup (Set index)', () => {
  it('creates exactly one harvest job per designated resource tile', () => {
    const wm = [[tile({ x: 0, y: 0 }), tile({ x: 1, y: 0, resources: { test_wood: 5 } })]];
    const out = jobService.generateJobs(stateWith(wm, { '1,0': 'harvest' }));
    const harvest = (out.jobs ?? []).filter((j) => j.type === 'harvest');
    expect(harvest).toHaveLength(1);
    expect(harvest[0]).toMatchObject({ targetX: 1, targetY: 0, resourceId: 'test_wood' });
  });

  it('does NOT duplicate an existing harvest job on a second generation pass', () => {
    const wm = [[tile({ x: 0, y: 0 }), tile({ x: 1, y: 0, resources: { test_wood: 5 } })]];
    const once = jobService.generateJobs(stateWith(wm, { '1,0': 'harvest' }));
    const twice = jobService.generateJobs({ ...once, worldMap: wm });
    expect((twice.jobs ?? []).filter((j) => j.type === 'harvest')).toHaveLength(1);
  });

  it('drops the harvest job once the resource is depleted', () => {
    const wm = [[tile({ x: 0, y: 0 }), tile({ x: 1, y: 0, resources: { test_wood: 5 } })]];
    const once = jobService.generateJobs(stateWith(wm, { '1,0': 'harvest' }));
    expect((once.jobs ?? []).filter((j) => j.type === 'harvest')).toHaveLength(1);
    // deplete the tile and re-run → the stale harvest job is filtered out
    const depleted = [[tile({ x: 0, y: 0 }), tile({ x: 1, y: 0, resources: { test_wood: 0 } })]];
    const after = jobService.generateJobs({ ...once, worldMap: depleted });
    expect((after.jobs ?? []).filter((j) => j.type === 'harvest')).toHaveLength(0);
  });
});
