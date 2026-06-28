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

describe('JobService subjobs (Work-tab fine-tuning)', () => {
  function withLabor(laborSettings: Record<string, number>) {
    return {
      'pawn-a': { pawnId: 'pawn-a', workPriorities: {}, laborSettings }
    } as unknown as GameState['workAssignments'];
  }

  it('exposes subjobs only for categories that aggregate multiple job types', () => {
    expect(jobService.getSubjobsForCategory('construction').map((s) => s.id).sort()).toEqual(
      ['construct', 'deconstruct', 'refuel', 'repair'].sort()
    );
    expect(jobService.getSubjobsForCategory('hauling').map((s) => s.id).sort()).toEqual(
      ['fetch', 'haul'].sort()
    );
    expect(jobService.getSubjobsForCategory('crafting')).toEqual([]); // 1:1, nothing to expand
  });

  it('ranks a higher subjob ahead of its sibling WITHIN the same parent category', () => {
    const gs = makeState({
      jobs: [
        makeJob({ id: 'j-build', type: 'construct' }),
        makeJob({ id: 'j-repair', type: 'repair' })
      ],
      workAssignments: withLabor({ construction: 2, repair: 4 })
    });
    const order = jobService.getAvailableJobs(makePawn('pawn-a'), gs).map((j) => j.id);
    expect(order.indexOf('j-repair')).toBeLessThan(order.indexOf('j-build'));
  });

  it('a subjob level NEVER lifts a job above a different category (cross-category guard)', () => {
    // construction=normal with repair=urgent; hauling=high. The haul must still outrank the repair —
    // repair's high subjob only matters among construction jobs.
    const gs = makeState({
      jobs: [
        makeJob({ id: 'j-haul', type: 'haul' }),
        makeJob({ id: 'j-repair', type: 'repair' })
      ],
      workAssignments: withLabor({ construction: 2, repair: 4, hauling: 3 })
    });
    const order = jobService.getAvailableJobs(makePawn('pawn-a'), gs).map((j) => j.id);
    expect(order.indexOf('j-haul')).toBeLessThan(order.indexOf('j-repair'));
  });

  it('a subjob set to 0 is excluded while its parent category stays enabled', () => {
    const gs = makeState({
      jobs: [
        makeJob({ id: 'j-build', type: 'construct' }),
        makeJob({ id: 'j-repair', type: 'repair' })
      ],
      workAssignments: withLabor({ construction: 2, repair: 0 })
    });
    const ids = jobService.getAvailableJobs(makePawn('pawn-a'), gs).map((j) => j.id);
    expect(ids).toContain('j-build');
    expect(ids).not.toContain('j-repair');
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

describe('JobService reserve-and-fetch crafting (ADR-016)', () => {
  const craftItem = {
    id: 'test_widget',
    name: 'Test Widget',
    category: 'crafted',
    craftingTime: 2,
    amount: 0
  } as any;

  const station = { id: 'st-1', type: 'craft_spot', x: 5, y: 5, status: 'complete' } as any;

  function order(over: Record<string, any> = {}) {
    return {
      id: 'cq-1',
      item: craftItem,
      quantity: 1,
      workRequired: 10,
      workDone: 0,
      startedAt: 0,
      inputs: { wood: 2 },
      stationType: 'craft_spot',
      stationBuildingId: 'st-1',
      ...over
    } as any;
  }

  it('emits a fetch job (not a craft job) while inputs are still in the stockpile', () => {
    // Reserved input sits on a stockpile tile (2,0), NOT the station tile (5,5).
    const reserved = {
      id: 'd-wood',
      resourceId: 'wood',
      x: 2,
      y: 0,
      quantity: 2,
      stored: true,
      reservedFor: 'cq-1'
    } as any;
    const out = jobService.generateJobs(
      makeState({ buildings: [station], craftingQueue: [order()], droppedItems: [reserved] })
    );
    const fetchJob = out.jobs.find((j) => j.type === 'fetch');
    expect(fetchJob).toBeDefined();
    expect(fetchJob!.droppedItemId).toBe('d-wood');
    expect(fetchJob!.stationX).toBe(5);
    expect(fetchJob!.stationY).toBe(5);
    // No craft job yet — inputs are not staged on the station.
    expect(out.jobs.find((j) => j.type === 'craft')).toBeUndefined();
  });

  it('opens a craft job at the station tile once inputs are staged there', () => {
    const staged = {
      id: 'd-wood',
      resourceId: 'wood',
      x: 5,
      y: 5,
      quantity: 2,
      stored: true,
      reservedFor: 'cq-1'
    } as any;
    const out = jobService.generateJobs(
      makeState({ buildings: [station], craftingQueue: [order()], droppedItems: [staged] })
    );
    const craftJob = out.jobs.find((j) => j.type === 'craft');
    expect(craftJob).toBeDefined();
    expect(craftJob!.craftQueueId).toBe('cq-1');
    expect(craftJob!.workRequired).toBe(10);
    expect(craftJob!.targetX).toBe(5);
    expect(craftJob!.targetY).toBe(5);
    // No fetch job — everything is already staged.
    expect(out.jobs.find((j) => j.type === 'fetch')).toBeUndefined();
  });

  it('completing the craft destroys staged inputs, drains the queue, and drops output on the station', () => {
    const staged = {
      id: 'd-wood',
      resourceId: 'wood',
      x: 5,
      y: 5,
      quantity: 2,
      stored: true,
      reservedFor: 'cq-1'
    } as any;
    let gs = makeState({
      buildings: [station],
      craftingQueue: [order({ quantity: 3 })],
      droppedItems: [staged]
    });
    gs = jobService.generateJobs(gs);
    const craftJob = gs.jobs.find((j) => j.type === 'craft')!;

    gs = jobService.advanceJob(craftJob.id, 10, gs);

    expect(gs.craftingQueue).toHaveLength(0); // queue drained
    // Staged input consumed — no reservedFor drop survives.
    expect((gs.droppedItems ?? []).some((d) => d.reservedFor === 'cq-1')).toBe(false);
    // Output is a physical drop ON the station tile (qty = 1 output × quantity 3).
    const produced = (gs.droppedItems ?? []).find(
      (d) => d.resourceId === 'test_widget' && d.x === 5 && d.y === 5
    );
    expect(produced).toBeDefined();
    expect(produced!.quantity).toBe(3);
  });
});
