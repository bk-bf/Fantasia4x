import { describe, it, expect } from 'vitest';
import { jobService } from '$lib/game/services/JobService';
import type { GameState, Job, Pawn } from '$lib/game/core/types';

const pawn = { id: 'pawn-a', position: { x: 0, y: 0 } } as unknown as Pawn;

const job = (id: string, type: string, x: number, over: Partial<Job> = {}): Job =>
  ({ id, type, targetX: x, targetY: 0, workRequired: 1, workDone: 0, claimedBy: null, ...over }) as Job;

function order(jobs: Job[], laborSettings: Record<string, number>): string[] {
  const gs = {
    jobs,
    craftingQueue: [],
    designations: {},
    buildings: [],
    droppedItems: [],
    stockpile: {},
    workAssignments: { 'pawn-a': { pawnId: 'pawn-a', workPriorities: {}, laborSettings } }
  } as unknown as GameState;
  return jobService.getAvailableJobs(pawn, gs).map((j) => j.id);
}

describe('getAvailableJobs order', () => {
  it('urgent first, then the higher labour level, then the nearer job', () => {
    const jobs = [
      job('haul-far', 'haul', 9),
      job('build-near', 'construct', 1),
      job('haul-near', 'haul', 2),
      job('build-urgent', 'construct', 8, { urgent: true }),
      job('build-far', 'construct', 7)
    ];
    expect(order(jobs, { hauling: 4, construction: 2 })).toEqual([
      'build-urgent',
      'haul-near',
      'haul-far',
      'build-near',
      'build-far'
    ]);
  });

  it('jobs another pawn holds are left out and equal jobs keep their pool order', () => {
    const jobs = [
      job('b', 'haul', 3),
      job('taken', 'haul', 1, { claimedBy: 'pawn-b' }),
      job('a', 'haul', 3),
      job('mine', 'haul', 5, { claimedBy: 'pawn-a' })
    ];
    expect(order(jobs, {})).toEqual(['b', 'a', 'mine']);
  });
});
