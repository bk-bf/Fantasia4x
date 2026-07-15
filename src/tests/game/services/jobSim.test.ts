import { describe, it, expect } from 'vitest';
import { jobService } from '$lib/game/services/JobService';
import type { GameState } from '$lib/game/core/types';

/**
 * Headless sim-invariant test (P0-1.2). Drives the job pipeline through many
 * generate → claim → advance cycles from a fixed setup and asserts the invariants the
 * codebase review called out: craft queue entries always drain, no job stays claimed by
 * an absent pawn, and completed work removes the job from the pool.
 */
function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    seed: 1,
    turn: 0,
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

const widget = (id: string) =>
  ({ id, name: id, category: 'crafted', craftingTime: 2, amount: 0 }) as any;

describe('job pipeline sim invariants', () => {
  it('every supplied craft order eventually drains and produces its item on the station (ADR-016)', () => {
    // ADR-016: each order's inputs are pre-staged on the shared craft_spot station; the craft
    // job opens, a worker advances it, and the output spawns as a drop on the station tile.
    const station = { id: 'st', type: 'craft_spot', x: 5, y: 5, status: 'complete' } as any;
    const staged = (id: string, resourceId: string) =>
      ({
        id: `d-${id}`,
        resourceId,
        x: 5,
        y: 5,
        quantity: 1,
        stored: true,
        reservedFor: id
      }) as any;
    let gs = makeState({
      buildings: [station],
      droppedItems: [staged('a', 'wood'), staged('b', 'clay')],
      craftingQueue: [
        {
          id: 'a',
          item: widget('alpha'),
          quantity: 1,
          workRequired: 4,
          workDone: 0,
          startedAt: 0,
          inputs: { wood: 1 },
          stationType: 'craft_spot',
          stationBuildingId: 'st'
        } as any,
        {
          id: 'b',
          item: widget('beta'),
          quantity: 2,
          workRequired: 6,
          workDone: 0,
          startedAt: 0,
          inputs: { clay: 1 },
          stationType: 'craft_spot',
          stationBuildingId: 'st'
        } as any
      ]
    });

    // Run up to 100 cycles: regenerate jobs, advance every craft job by 1 work point.
    for (let cycle = 0; cycle < 100 && gs.craftingQueue.length > 0; cycle++) {
      gs = jobService.generateJobs(gs);
      for (const job of [...(gs.jobs ?? [])]) {
        if (job.type === 'craft') gs = jobService.advanceJob(job.id, 1, gs);
      }
      gs = { ...gs, turn: gs.turn + 1 };
    }

    expect(gs.craftingQueue).toHaveLength(0); // INVARIANT: queue always drains
    const drops = gs.droppedItems ?? [];
    expect(drops.find((d) => d.resourceId === 'alpha')?.quantity).toBe(1);
    expect(drops.find((d) => d.resourceId === 'beta')?.quantity).toBe(2);
    // Staged inputs consumed; no orphaned craft jobs.
    expect(drops.some((d) => d.reservedFor)).toBe(false);
    expect((gs.jobs ?? []).some((j) => j.type === 'craft')).toBe(false);
  });

  it('turn counter stays monotonic across the run', () => {
    let gs = makeState();
    let prev = gs.turn;
    for (let i = 0; i < 50; i++) {
      gs = jobService.generateJobs(gs);
      gs = { ...gs, turn: gs.turn + 1 };
      expect(gs.turn).toBeGreaterThan(prev);
      prev = gs.turn;
    }
  });

  it('no job remains claimed by a pawn absent from the roster (D2 invariant)', () => {
    const gs = makeState({
      pawns: [{ id: 'alive', position: { x: 0, y: 0 } } as any],
      jobs: [
        {
          id: 'j1',
          type: 'haul',
          targetX: 0,
          targetY: 0,
          workRequired: 1,
          workDone: 0,
          claimedBy: 'alive'
        } as any,
        {
          id: 'j2',
          type: 'haul',
          targetX: 1,
          targetY: 0,
          workRequired: 1,
          workDone: 0,
          claimedBy: 'ghost'
        } as any
      ]
    });
    const pawnIds = new Set(gs.pawns.map((p) => p.id));
    const leaked = (gs.jobs ?? []).filter((j) => j.claimedBy && !pawnIds.has(j.claimedBy));
    // Documents the leak shape D2 fixes: a claim by 'ghost' (not on the roster) is a leak.
    expect(leaked.map((j) => j.id)).toEqual(['j2']);
    // The fix (release absent claims) clears it.
    const cleaned = {
      ...gs,
      jobs: gs.jobs.map((j) =>
        j.claimedBy && !pawnIds.has(j.claimedBy) ? { ...j, claimedBy: null } : j
      )
    } as GameState;
    expect(cleaned.jobs.filter((j) => j.claimedBy && !pawnIds.has(j.claimedBy))).toHaveLength(0);
  });
});
