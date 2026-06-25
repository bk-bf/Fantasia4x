import { describe, it, expect } from 'vitest';
import { COMMANDS } from '../../sim/commands';
import { handleRescuing } from './handlers/rescue';
import { PAWN_STATE } from './pawnStates';
import type { GameState, Pawn } from '../../core/types';

const pawn = (id: string, x: number, y: number, extra: Partial<Pawn> = {}): Pawn =>
  ({
    id,
    name: id,
    position: { x, y },
    currentState: PAWN_STATE.IDLE,
    isAlive: true,
    path: [],
    isMoving: false,
    ...extra
  }) as unknown as Pawn;

const bed = (x: number, y: number) => ({ type: 'sleeping_spot', x, y, status: 'complete' });

function state(pawns: Pawn[], buildings: unknown[] = []): GameState {
  return { pawns, buildings, jobs: [] } as unknown as GameState;
}

describe('rescuePawn command', () => {
  it('dispatches the nearest free pawn to rescue a collapsed colonist when shelter exists', () => {
    const victim = pawn('v', 5, 5, { currentState: PAWN_STATE.COLLAPSED });
    const far = pawn('far', 0, 0);
    const near = pawn('near', 6, 5);
    const out = COMMANDS.rescuePawn(state([victim, far, near], [bed(10, 10)]), { victimId: 'v' });
    const n = out.pawns.find((p) => p.id === 'near')!;
    expect(n.currentState).toBe(PAWN_STATE.RESCUING);
    expect(n.rescue?.victimId).toBe('v');
    expect(out.pawns.find((p) => p.id === 'far')!.currentState).toBe(PAWN_STATE.IDLE);
  });

  it('no-ops when the colony has no shelter', () => {
    const victim = pawn('v', 5, 5, { currentState: PAWN_STATE.COLLAPSED });
    const helper = pawn('h', 6, 5);
    const out = COMMANDS.rescuePawn(state([victim, helper], []), { victimId: 'v' });
    expect(out.pawns.find((p) => p.id === 'h')!.currentState).toBe(PAWN_STATE.IDLE);
  });

  it('no-ops when the target is not collapsed', () => {
    const victim = pawn('v', 5, 5); // Idle, not collapsed
    const helper = pawn('h', 6, 5);
    const out = COMMANDS.rescuePawn(state([victim, helper], [bed(10, 10)]), { victimId: 'v' });
    expect(out.pawns.find((p) => p.id === 'h')!.currentState).toBe(PAWN_STATE.IDLE);
  });

  it('no-ops when the victim is already being rescued', () => {
    const victim = pawn('v', 5, 5, { currentState: PAWN_STATE.COLLAPSED });
    const busy = pawn('busy', 6, 5, {
      currentState: PAWN_STATE.RESCUING,
      rescue: { victimId: 'v', carrying: false, destX: 0, destY: 0 }
    });
    const free = pawn('free', 7, 5);
    const out = COMMANDS.rescuePawn(state([victim, busy, free], [bed(10, 10)]), { victimId: 'v' });
    expect(out.pawns.find((p) => p.id === 'free')!.currentState).toBe(PAWN_STATE.IDLE);
  });
});

describe('handleRescuing', () => {
  it('picks up when adjacent to the victim: flips carrying + targets the nearest shelter', () => {
    const carrier = pawn('c', 5, 5, {
      currentState: PAWN_STATE.RESCUING,
      rescue: { victimId: 'v', carrying: false, destX: 0, destY: 0 }
    });
    const victim = pawn('v', 5, 6, { currentState: PAWN_STATE.COLLAPSED }); // adjacent
    const gs = handleRescuing(carrier, state([carrier, victim], [bed(10, 10)]));
    const c = gs.pawns.find((p) => p.id === 'c')!;
    expect(c.rescue?.carrying).toBe(true);
    expect(c.rescue).toMatchObject({ destX: 10, destY: 10 });
  });

  it('lays the victim down at the shelter and goes idle once arrived', () => {
    const carrier = pawn('c', 10, 10, {
      currentState: PAWN_STATE.RESCUING,
      rescue: { victimId: 'v', carrying: true, destX: 10, destY: 10 }
    });
    const victim = pawn('v', 9, 10, { currentState: PAWN_STATE.COLLAPSED });
    const gs = handleRescuing(carrier, state([carrier, victim], [bed(10, 10)]));
    const c = gs.pawns.find((p) => p.id === 'c')!;
    const v = gs.pawns.find((p) => p.id === 'v')!;
    expect(c.currentState).toBe(PAWN_STATE.IDLE);
    expect(c.rescue).toBeUndefined();
    expect(v.position).toEqual({ x: 10, y: 10 });
  });

  it('sets the victim down where it stands if it wakes up mid-carry', () => {
    const carrier = pawn('c', 4, 4, {
      currentState: PAWN_STATE.RESCUING,
      rescue: { victimId: 'v', carrying: true, destX: 10, destY: 10 }
    });
    const victim = pawn('v', 4, 4, { currentState: PAWN_STATE.IDLE }); // recovered
    const gs = handleRescuing(carrier, state([carrier, victim], [bed(10, 10)]));
    expect(gs.pawns.find((p) => p.id === 'c')!.currentState).toBe(PAWN_STATE.IDLE);
    expect(gs.pawns.find((p) => p.id === 'v')!.position).toEqual({ x: 4, y: 4 });
  });
});
