import { describe, it, expect } from 'vitest';
import { COMMANDS } from '$lib/game/sim/commands';
import { PAWN_STATE } from '$lib/game/systems/pawn/pawnStates';
import type { GameState, Pawn } from '$lib/game/core/types';

function pawn(extra: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Sleeper',
    currentState: PAWN_STATE.SLEEPING,
    activeJob: { type: 'need', targetState: PAWN_STATE.SLEEPING, turnsInState: 5 },
    isMoving: false,
    path: [],
    state: { isSleeping: true },
    ...extra
  } as unknown as Pawn;
}

const stateWith = (p: Pawn): GameState => ({ pawns: [p] }) as unknown as GameState;

describe('setPawnRestPolicy — "no rest" wakes a resting pawn immediately', () => {
  it('rolls a sleeping pawn straight to Idle when set to never', () => {
    const out = COMMANDS.setPawnRestPolicy(stateWith(pawn()), {
      pawnId: 'p1',
      policy: 'never'
    });
    const p = out.pawns[0];
    expect(p.restPolicy).toBe('never');
    expect(p.currentState).toBe(PAWN_STATE.IDLE);
    expect(p.activeJob).toBeUndefined();
    expect(p.state?.isSleeping).toBe(false);
  });

  it('also turns back a pawn walking to bed (en route to sleep)', () => {
    const enRoute = pawn({
      currentState: PAWN_STATE.MOVING_TO_NEED,
      isMoving: true,
      path: [{ x: 1, y: 1 }] as never,
      state: { isSleeping: false } as never
    });
    const out = COMMANDS.setPawnRestPolicy(stateWith(enRoute), { pawnId: 'p1', policy: 'never' });
    const p = out.pawns[0];
    expect(p.currentState).toBe(PAWN_STATE.IDLE);
    expect(p.activeJob).toBeUndefined();
    expect(p.isMoving).toBe(false);
    expect(p.path).toEqual([]);
  });

  it('does NOT wake a sleeping pawn for the other policies', () => {
    for (const policy of ['shelter', 'always']) {
      const out = COMMANDS.setPawnRestPolicy(stateWith(pawn()), { pawnId: 'p1', policy });
      const p = out.pawns[0];
      expect(p.restPolicy).toBe(policy);
      expect(p.currentState).toBe(PAWN_STATE.SLEEPING); // left asleep
    }
  });

  it('leaves a working pawn untouched (only resting pawns are forced up)', () => {
    const worker = pawn({
      currentState: PAWN_STATE.WORKING,
      activeJob: { type: 'harvest' } as never,
      state: { isSleeping: false } as never
    });
    const out = COMMANDS.setPawnRestPolicy(stateWith(worker), { pawnId: 'p1', policy: 'never' });
    const p = out.pawns[0];
    expect(p.currentState).toBe(PAWN_STATE.WORKING);
    expect(p.activeJob).toBeDefined();
  });
});
