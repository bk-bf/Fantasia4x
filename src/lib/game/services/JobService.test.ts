import { describe, it, expect } from 'vitest';
import { jobService } from './JobService';
import type { GameState, Job, Pawn } from '../core/types';

/** Build a minimal GameState carrying only the fields the job pipeline touches. */
function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    jobs: [],
    craftingQueue: [],
    designations: {},
    buildings: [],
    droppedItems: [],
    worldMap: [],
    item: [],
    pawns: [],
    stockpile: {},
    stockpileZones: [],
    workAssignments: {},
    ...partial
  } as unknown as GameState;
}

function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: 'haul',
    targetX: 0,
    targetY: 0,
    workRequired: 10,
    workDone: 0,
    claimedBy: null,
    ...over
  } as Job;
}

function makePawn(id: string): Pawn {
  return { id, position: { x: 0, y: 0 } } as unknown as Pawn;
}

describe('JobService claim / release', () => {
  it('claimJob sets claimedBy for an unclaimed job', () => {
    const gs = makeState({ jobs: [makeJob()] });
    const out = jobService.claimJob('pawn-a', 'job-1', gs);
    expect(out.jobs[0].claimedBy).toBe('pawn-a');
  });

  it('claimJob will not steal a job already claimed by another pawn', () => {
    const gs = makeState({ jobs: [makeJob({ claimedBy: 'pawn-a' })] });
    const out = jobService.claimJob('pawn-b', 'job-1', gs);
    expect(out.jobs[0].claimedBy).toBe('pawn-a');
  });

  it('releaseJob clears the claim so another pawn can take it', () => {
    const gs = makeState({ jobs: [makeJob({ claimedBy: 'pawn-a' })] });
    const released = jobService.releaseJob('pawn-a', 'job-1', gs);
    expect(released.jobs[0].claimedBy).toBeNull();

    // After release, a living pawn sees it as available again.
    const avail = jobService.getAvailableJobs(makePawn('pawn-b'), released);
    expect(avail.map((j) => j.id)).toContain('job-1');
  });

  it('a job left claimed by a (now absent) pawn is NOT available to others — the D2 leak', () => {
    // Regression guard: a claim that is never released blocks every other pawn.
    // killPawn (PawnStateMachine) and the drafted-skip path must reset claimedBy to null;
    // this test documents the failure mode that fix prevents.
    const gs = makeState({ jobs: [makeJob({ claimedBy: 'dead-pawn' })] });
    const avail = jobService.getAvailableJobs(makePawn('pawn-b'), gs);
    expect(avail.map((j) => j.id)).not.toContain('job-1');

    // Releasing the dead pawn's claim (what killPawn now does) makes it workable again.
    const fixed = {
      ...gs,
      jobs: gs.jobs.map((j) => (j.claimedBy === 'dead-pawn' ? { ...j, claimedBy: null } : j))
    } as GameState;
    expect(jobService.getAvailableJobs(makePawn('pawn-b'), fixed).map((j) => j.id)).toContain(
      'job-1'
    );
  });
});

describe('JobService advanceJob', () => {
  it('accumulates work without completing below the threshold', () => {
    const gs = makeState({ jobs: [makeJob({ workRequired: 10, workDone: 0 })] });
    const out = jobService.advanceJob('job-1', 4, gs);
    expect(out.jobs[0].workDone).toBe(4);
    expect(out.jobs).toHaveLength(1);
  });

  it('completes and removes the job once workDone >= workRequired', () => {
    const gs = makeState({ jobs: [makeJob({ type: 'haul', workRequired: 10, workDone: 8 })] });
    const out = jobService.advanceJob('job-1', 5, gs);
    expect(out.jobs.find((j) => j.id === 'job-1')).toBeUndefined();
  });
});

describe('JobService craft round-trip (D1 regression)', () => {
  const craftItem = {
    id: 'test_widget',
    name: 'Test Widget',
    category: 'crafted',
    craftingTime: 2,
    amount: 0
  } as any;

  it('generateJobs creates a craft job for a Phase 5d queue entry (with id)', () => {
    const gs = makeState({
      craftingQueue: [
        {
          id: 'cq-1',
          item: craftItem,
          quantity: 1,
          workRequired: 10,
          workDone: 0,
          startedAt: 0,
          materialsReserved: true
        } as any
      ]
    });
    const out = jobService.generateJobs(gs);
    const craftJob = out.jobs.find((j) => j.type === 'craft');
    expect(craftJob).toBeDefined();
    expect(craftJob!.craftQueueId).toBe('cq-1');
    expect(craftJob!.workRequired).toBe(10);
  });

  it('does NOT create a craft job for a legacy entry without id', () => {
    const gs = makeState({
      craftingQueue: [{ item: craftItem, quantity: 1, startedAt: 0 } as any]
    });
    const out = jobService.generateJobs(gs);
    expect(out.jobs.find((j) => j.type === 'craft')).toBeUndefined();
  });

  it('completing the craft job produces the item and drains the queue', () => {
    let gs = makeState({
      craftingQueue: [
        {
          id: 'cq-1',
          item: craftItem,
          quantity: 3,
          workRequired: 10,
          workDone: 0,
          startedAt: 0,
          materialsReserved: true
        } as any
      ]
    });
    gs = jobService.generateJobs(gs);
    const craftJob = gs.jobs.find((j) => j.type === 'craft')!;

    // Pawn works it to completion.
    gs = jobService.advanceJob(craftJob.id, 10, gs);

    expect(gs.craftingQueue).toHaveLength(0); // queue drained
    const produced = gs.item.find((i) => i.id === 'test_widget');
    expect(produced).toBeDefined();
    expect(produced!.amount).toBe(3);
  });
});
