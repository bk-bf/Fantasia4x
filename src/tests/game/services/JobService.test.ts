import { describe, it, expect, vi } from 'vitest';
import { jobService } from '$lib/game/services/JobService';
import { completeCraftOrder } from '$lib/game/services/jobs/craft';
import { generate as generateFetchJobs } from '$lib/game/services/jobs/fetch';
import { rng } from '$lib/game/core/util/rng';
import type { GameState, Job, Pawn } from '$lib/game/core/types';

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

    const avail = jobService.getAvailableJobs(makePawn('pawn-b'), released);
    expect(avail.map((j) => j.id)).toContain('job-1');
  });

  it('a job left claimed by a (now absent) pawn is NOT available to others — the D2 leak', () => {
    const gs = makeState({ jobs: [makeJob({ claimedBy: 'dead-pawn' })] });
    const avail = jobService.getAvailableJobs(makePawn('pawn-b'), gs);
    expect(avail.map((j) => j.id)).not.toContain('job-1');

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
    expect(
      jobService
        .getSubjobsForCategory('construction')
        .map((s) => s.id)
        .sort()
    ).toEqual(['construct', 'deconstruct', 'repair'].sort());
    expect(
      jobService
        .getSubjobsForCategory('hauling')
        .map((s) => s.id)
        .sort()
    ).toEqual(['fetch', 'haul', 'refuel', 'fill'].sort());
    expect(jobService.getSubjobsForCategory('crafting')).toEqual([]);
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
    const gs = makeState({
      jobs: [makeJob({ id: 'j-haul', type: 'haul' }), makeJob({ id: 'j-repair', type: 'repair' })],
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

describe('JobService job choice', () => {
  const assign = (a: {
    laborSettings?: Record<string, number>;
    workPriorities?: Record<string, number>;
  }) =>
    ({
      'pawn-a': { pawnId: 'pawn-a', workPriorities: {}, laborSettings: {}, ...a }
    }) as unknown as GameState['workAssignments'];

  it('puts the nearer of two equal jobs first', () => {
    const gs = makeState({
      jobs: [
        makeJob({ id: 'j-far', targetX: 5, targetY: 0 }),
        makeJob({ id: 'j-near', targetX: 1, targetY: 0 })
      ]
    });
    const order = jobService.getAvailableJobs(makePawn('pawn-a'), gs).map((j) => j.id);
    expect(order).toEqual(['j-near', 'j-far']);
  });

  it('offers no job of a category set to priority 0', () => {
    const gs = makeState({
      jobs: [
        makeJob({ id: 'j-haul', type: 'haul' }),
        makeJob({ id: 'j-build', type: 'construct' })
      ],
      workAssignments: assign({ laborSettings: { hauling: 0 } })
    });
    const ids = jobService.getAvailableJobs(makePawn('pawn-a'), gs).map((j) => j.id);
    expect(ids).toEqual(['j-build']);
  });

  it('clamps a legacy work priority into 0..4', () => {
    const job = makeJob({ type: 'haul' });
    const pawn = makePawn('pawn-a');
    const high = makeState({ workAssignments: assign({ workPriorities: { hauling: 9 } }) });
    const low = makeState({ workAssignments: assign({ workPriorities: { hauling: -3 } }) });
    expect(jobService.getJobLaborLevel(job, pawn, high)).toBe(4);
    expect(jobService.getJobLaborLevel(job, pawn, low)).toBe(0);
  });

  it('drops a light job when the job list is regenerated', () => {
    const gs = makeState({
      jobs: [makeJob({ id: 'j-light', type: 'light' })]
    });
    expect(jobService.generateJobs(gs).jobs.map((j) => j.id)).not.toContain('j-light');
  });
});

describe('JobService advanceJob', () => {
  it('grants the worker skill experience when a job completes', () => {
    const worker = {
      ...makePawn('pawn-a'),
      skills: { construction: 1 },
      skillXp: { construction: 0 }
    } as unknown as Pawn;
    const gs = makeState({
      pawns: [worker],
      jobs: [makeJob({ type: 'repair', buildingId: 'gone', workRequired: 10, claimedBy: 'pawn-a' })]
    });
    const out = jobService.advanceJob('job-1', 10, gs);
    expect(out.jobs).toHaveLength(0);
    expect(out.pawns[0].skillXp!.construction).toBe(10);
  });

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

    expect(gs.craftingQueue).toHaveLength(0);
    expect((gs.droppedItems ?? []).some((d) => d.reservedFor === 'cq-1')).toBe(false);
    const produced = (gs.droppedItems ?? []).find(
      (d) => d.resourceId === 'test_widget' && d.x === 5 && d.y === 5
    );
    expect(produced).toBeDefined();
    expect(produced!.quantity).toBe(3);
  });

  const stagedFor = (orderId: string, over: Record<string, unknown> = {}) =>
    ({
      id: `d-${orderId}`,
      resourceId: 'wood',
      x: 5,
      y: 5,
      quantity: 2,
      stored: true,
      reservedFor: orderId,
      ...over
    }) as any;

  it('opens one craft job at a station even when two orders there are supplied', () => {
    const out = jobService.generateJobs(
      makeState({
        buildings: [station],
        craftingQueue: [order(), order({ id: 'cq-2' })],
        droppedItems: [stagedFor('cq-1'), stagedFor('cq-2')]
      })
    );
    expect(out.jobs.filter((j) => j.type === 'craft').map((j) => j.craftQueueId)).toEqual(['cq-1']);
  });

  it('drops a fetch job whose source is now reserved for another order', () => {
    const fetchJob = makeJob({
      id: 'fetch-d-wood-cq-1',
      type: 'fetch',
      droppedItemId: 'd-wood',
      craftQueueId: 'cq-1',
      buildingId: 'st-1'
    });
    const gs = makeState({
      buildings: [station],
      craftingQueue: [order(), order({ id: 'cq-2' })],
      droppedItems: [stagedFor('cq-2', { id: 'd-wood', x: 2, y: 0 })]
    });
    const jobs = generateFetchJobs([fetchJob], gs);
    expect(jobs.filter((j) => j.craftQueueId === 'cq-1')).toEqual([]);
    expect(jobs.map((j) => j.craftQueueId)).toEqual(['cq-2']);
  });

  it('rolls the fractional unit of a scaled yield', () => {
    const produced = (roll: number) => {
      const spy = vi.spyOn(rng, 'random').mockReturnValue(roll);
      try {
        const gs = makeState({
          buildings: [station],
          craftingQueue: [order()],
          droppedItems: [stagedFor('cq-1')]
        });
        const out = completeCraftOrder(order(), gs, undefined, undefined, 1.5);
        return (out.droppedItems ?? []).find((d) => d.resourceId === 'test_widget')?.quantity;
      } finally {
        spy.mockRestore();
      }
    };
    expect(produced(0)).toBe(2);
    expect(produced(0.9)).toBe(1);
  });

  it('keeps crafted output apart from a stored pile on the station tile', () => {
    const pile = { id: 'pile', resourceId: 'test_widget', x: 5, y: 5, quantity: 4, stored: true };
    const gs = makeState({
      buildings: [station],
      craftingQueue: [order()],
      droppedItems: [stagedFor('cq-1'), pile] as any
    });
    const out = completeCraftOrder(order(), gs);
    const widgets = (out.droppedItems ?? []).filter((d) => d.resourceId === 'test_widget');
    expect(widgets.find((d) => d.id === 'pile')!.quantity).toBe(4);
    expect(widgets.filter((d) => !d.stored).map((d) => d.quantity)).toEqual([1]);
  });
});
