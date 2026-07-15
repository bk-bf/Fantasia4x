import { describe, it, expect } from 'vitest';
import { COMMANDS } from '$lib/game/sim/commands';
import { advancePawnOrders } from '$lib/game/systems/pawn/pawnHelpers';
import type { GameState, Pawn, PawnOrder } from '$lib/game/core/types';

// DRAFTED-JOB-ORDERS §8/§9: the "manual queue" — a plain order sets the active head (`draftTarget`),
// Shift appends behind it (`manualQueue`), and the head advances through the queue on completion. This
// locks the command gating + the drain helper.

const pawn = (id: string, extra: Partial<Pawn> = {}): Pawn =>
  ({
    id,
    name: id,
    drafted: false,
    isAlive: true,
    position: { x: 0, y: 0 },
    currentState: 'Idle',
    ...extra
  }) as unknown as Pawn;

const stateWith = (pawns: Pawn[], jobs: unknown[] = []): GameState =>
  ({ pawns, jobs }) as unknown as GameState;

const harvest = (jobId: string): PawnOrder => ({ type: 'forceJob', jobId });

describe('setPawnDraftTarget — manual order queue', () => {
  it('a plain order sets the head and leaves the queue empty', () => {
    const out = COMMANDS.setPawnDraftTarget(stateWith([pawn('p1')]), {
      pawnId: 'p1',
      target: harvest('j1')
    });
    const p = out.pawns[0];
    expect(p.draftTarget).toEqual(harvest('j1'));
    expect(p.manualQueue).toBeUndefined();
  });

  it('Shift (append) pushes behind an existing head instead of replacing it', () => {
    let s = stateWith([pawn('p1')]);
    s = COMMANDS.setPawnDraftTarget(s, { pawnId: 'p1', target: harvest('j1') });
    s = COMMANDS.setPawnDraftTarget(s, { pawnId: 'p1', target: harvest('j2'), append: true });
    s = COMMANDS.setPawnDraftTarget(s, { pawnId: 'p1', target: harvest('j3'), append: true });
    const p = s.pawns[0];
    expect(p.draftTarget).toEqual(harvest('j1')); // head unchanged
    expect(p.manualQueue).toEqual([harvest('j2'), harvest('j3')]); // queued in order
  });

  it('append with no head yet becomes the head', () => {
    const out = COMMANDS.setPawnDraftTarget(stateWith([pawn('p1')]), {
      pawnId: 'p1',
      target: harvest('j1'),
      append: true
    });
    const p = out.pawns[0];
    expect(p.draftTarget).toEqual(harvest('j1'));
    expect(p.manualQueue).toBeUndefined();
  });

  it('a plain (non-append) order replaces the head AND clears the pending queue', () => {
    let s = stateWith([pawn('p1')]);
    s = COMMANDS.setPawnDraftTarget(s, { pawnId: 'p1', target: harvest('j1') });
    s = COMMANDS.setPawnDraftTarget(s, { pawnId: 'p1', target: harvest('j2'), append: true });
    s = COMMANDS.setPawnDraftTarget(s, { pawnId: 'p1', target: harvest('j9') }); // plain replace
    const p = s.pawns[0];
    expect(p.draftTarget).toEqual(harvest('j9'));
    expect(p.manualQueue).toBeUndefined();
  });

  it('clearing (target null) drops all orders, idles the pawn, and releases its force-claimed job', () => {
    const s = stateWith(
      [pawn('p1', { draftTarget: harvest('j1'), manualQueue: [harvest('j2')], activeJob: { jobId: 'j1' } as never })],
      [{ id: 'j1', claimedBy: 'p1' }, { id: 'j2', claimedBy: null }]
    );
    const out = COMMANDS.setPawnDraftTarget(s, { pawnId: 'p1', target: null });
    const p = out.pawns[0];
    expect(p.draftTarget).toBeUndefined();
    expect(p.manualQueue).toBeUndefined();
    expect(p.activeJob).toBeUndefined();
    expect(p.currentState).toBe('Idle');
    expect(out.jobs?.find((j) => j.id === 'j1')?.claimedBy).toBeNull(); // released back to the pool
  });
});

describe('advancePawnOrders — drain on completion', () => {
  it('pops the next queued order into the head', () => {
    const p = pawn('p1', { draftTarget: harvest('j1'), manualQueue: [harvest('j2'), harvest('j3')] });
    advancePawnOrders(p);
    expect(p.draftTarget).toEqual(harvest('j2'));
    expect(p.manualQueue).toEqual([harvest('j3')]);
  });

  it('clears both when the queue is empty', () => {
    const p = pawn('p1', { draftTarget: harvest('j1') });
    advancePawnOrders(p);
    expect(p.draftTarget).toBeUndefined();
    expect(p.manualQueue).toBeUndefined();
  });
});
