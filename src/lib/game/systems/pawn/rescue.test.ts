import { describe, it, expect } from 'vitest';
import { COMMANDS } from '../../sim/commands';
import { PAWN_STATE } from './pawnStates';
import { pickUpPawn, dropCarriedPawn, reconcileCarriedPawns, CARRIED_PAWN_ITEM } from './carry';
import { itemService } from '../../services/ItemService';
import { nearestShelterTile } from './handlers/rescue';
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

describe('rescuePawn command (drafted carry order)', () => {
  it('drafts the nearest free pawn with a rescue order when shelter exists', () => {
    const victim = pawn('v', 5, 5, { currentState: PAWN_STATE.COLLAPSED });
    const far = pawn('far', 0, 0);
    const near = pawn('near', 6, 5);
    const out = COMMANDS.rescuePawn(state([victim, far, near], [bed(10, 10)]), { victimId: 'v' });
    const n = out.pawns.find((p) => p.id === 'near')!;
    expect(n.drafted).toBe(true);
    expect(n.draftTarget).toMatchObject({ type: 'rescue', victimId: 'v', auto: true });
    // The far pawn is untouched.
    expect(out.pawns.find((p) => p.id === 'far')!.draftTarget).toBeUndefined();
  });

  it('no-ops when the colony has no shelter', () => {
    const victim = pawn('v', 5, 5, { currentState: PAWN_STATE.COLLAPSED });
    const helper = pawn('h', 6, 5);
    const out = COMMANDS.rescuePawn(state([victim, helper], []), { victimId: 'v' });
    expect(out.pawns.find((p) => p.id === 'h')!.draftTarget).toBeUndefined();
  });

  it('no-ops when the target is not collapsed', () => {
    const victim = pawn('v', 5, 5); // Idle, not collapsed
    const helper = pawn('h', 6, 5);
    const out = COMMANDS.rescuePawn(state([victim, helper], [bed(10, 10)]), { victimId: 'v' });
    expect(out.pawns.find((p) => p.id === 'h')!.draftTarget).toBeUndefined();
  });

  it('no-ops when the victim is already being carried/dispatched', () => {
    const victim = pawn('v', 5, 5, { currentState: PAWN_STATE.COLLAPSED });
    const busy = pawn('busy', 6, 5, {
      drafted: true,
      draftTarget: { type: 'rescue', victimId: 'v' }
    });
    const free = pawn('free', 7, 5);
    const out = COMMANDS.rescuePawn(state([victim, busy, free], [bed(10, 10)]), { victimId: 'v' });
    expect(out.pawns.find((p) => p.id === 'free')!.draftTarget).toBeUndefined();
  });
});

describe('carried-pawn cargo (pawn/carry)', () => {
  it('pickUpPawn hides the victim and stows a named, capacity-counted body in the carrier', () => {
    const carrier = pawn('c', 5, 5, {
      drafted: true,
      draftTarget: { type: 'rescue', victimId: 'v' }
    });
    const victim = pawn('v', 5, 6, { name: 'Vale', currentState: PAWN_STATE.COLLAPSED });
    const gs = pickUpPawn(state([carrier, victim]), 'c', 'v');
    const c = gs.pawns.find((p) => p.id === 'c')!;
    const v = gs.pawns.find((p) => p.id === 'v')!;
    expect(v.carriedBy).toBe('c');
    const inst = (c.inventory?.instances ?? []).find((i) => i.itemId === CARRIED_PAWN_ITEM);
    expect(inst).toBeDefined();
    expect(inst!.name).toContain('Vale');
    // The body has real weight → it eats carry budget.
    expect(itemService.getCurrentCarryLoad(c, gs).weightKg).toBeGreaterThan(0);
  });

  it('dropCarriedPawn restores the victim at the drop tile and removes the body item', () => {
    const carrier = pawn('c', 9, 9, {
      drafted: true,
      draftTarget: { type: 'rescue', victimId: 'v' }
    });
    const victim = pawn('v', 5, 6, { currentState: PAWN_STATE.COLLAPSED });
    let gs = pickUpPawn(state([carrier, victim]), 'c', 'v');
    gs = dropCarriedPawn(gs, 'c', 'v', 10, 10);
    const c = gs.pawns.find((p) => p.id === 'c')!;
    const v = gs.pawns.find((p) => p.id === 'v')!;
    expect(v.carriedBy).toBeUndefined();
    expect(v.position).toEqual({ x: 10, y: 10 });
    expect((c.inventory?.instances ?? []).some((i) => i.itemId === CARRIED_PAWN_ITEM)).toBe(false);
  });

  it('reconcile sets a carried body down when the carrier stops carrying it (never vanishes)', () => {
    const carrier = pawn('c', 8, 8, {
      drafted: true,
      draftTarget: { type: 'rescue', victimId: 'v' }
    });
    const victim = pawn('v', 5, 6, { currentState: PAWN_STATE.COLLAPSED });
    let gs = pickUpPawn(state([carrier, victim]), 'c', 'v');
    // Carrier is re-ordered (e.g. MOVE) — its rescue order is gone.
    gs = {
      ...gs,
      pawns: gs.pawns.map((p) =>
        p.id === 'c' ? { ...p, draftTarget: { type: 'move', x: 1, y: 1 } } : p
      )
    } as GameState;
    gs = reconcileCarriedPawns(gs);
    const c = gs.pawns.find((p) => p.id === 'c')!;
    const v = gs.pawns.find((p) => p.id === 'v')!;
    expect(v.carriedBy).toBeUndefined();
    expect(v.position).toEqual({ x: 8, y: 8 }); // set down where the carrier stood
    expect((c.inventory?.instances ?? []).some((i) => i.itemId === CARRIED_PAWN_ITEM)).toBe(false);
  });

  it('nearestShelterTile skips a bed already occupied by another pawn (one body per shelter)', () => {
    const occupant = pawn('sleeper', 10, 10); // standing on the only bed
    const carrier = pawn('c', 9, 10);
    const gs = state([occupant, carrier], [bed(10, 10)]);
    expect(nearestShelterTile(gs, 9, 10)).toBeNull(); // the lone bed is taken
    // A second, free bed is chosen instead.
    const gs2 = state([occupant, carrier], [bed(10, 10), bed(8, 10)]);
    expect(nearestShelterTile(gs2, 9, 10)).toEqual({ x: 8, y: 10 });
  });

  it('reconcile is a no-op when nobody is carrying anyone', () => {
    const a = pawn('a', 1, 1);
    const b = pawn('b', 2, 2);
    const gs = state([a, b]);
    expect(reconcileCarriedPawns(gs)).toBe(gs);
  });
});
