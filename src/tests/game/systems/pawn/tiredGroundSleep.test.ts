import { describe, it, expect } from 'vitest';
import { handleTired } from '$lib/game/systems/pawn/handlers/needs';
import { PAWN_STATE } from '$lib/game/systems/pawn/pawnStates';
import type { GameState, Pawn, PlacedBuilding } from '$lib/game/core/types';

// Regression: a TIRED pawn whose only bed is unreachable must lie down and sleep on the ground rather
// than freezing in TIRED forever (the old code logged "unreachable, retrying" and returned unchanged).
// In the test env the pathfinder isn't initialised, so tryAssignSleepPath returns null for any bed —
// i.e. every bed is "unreachable" — which is precisely the branch this fix covers.

function pawn(extra: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Sleeper',
    currentState: PAWN_STATE.TIRED,
    position: { x: 0, y: 0 },
    isMoving: false,
    path: [],
    needs: { fatigue: 80 },
    ...extra
  } as unknown as Pawn;
}

function bed(extra: Partial<PlacedBuilding> = {}): PlacedBuilding {
  return {
    id: 'b1',
    type: 'sleeping_spot',
    status: 'complete',
    x: 5,
    y: 5,
    ...extra
  } as unknown as PlacedBuilding;
}

const stateWith = (p: Pawn, buildings: PlacedBuilding[] = []): GameState =>
  ({ turn: 1, pawns: [p], buildings }) as unknown as GameState;

describe('handleTired — falls back to ground sleep when the bed is unreachable', () => {
  it('sleeps on the ground at its own position when a bed exists but is unpathable', () => {
    const p = pawn();
    const out = handleTired(p, stateWith(p, [bed()]));
    const after = out.pawns[0];
    expect(after.currentState).toBe(PAWN_STATE.SLEEPING);
    // Slept where it stands, NOT at the unreachable bed's (5,5).
    expect(after.activeJob?.targetX).toBe(0);
    expect(after.activeJob?.targetY).toBe(0);
    expect(after.path).toEqual([]);
    expect(after.isMoving).toBe(false);
  });

  it('still sleeps on the ground when no bed exists at all', () => {
    const p = pawn();
    const out = handleTired(p, stateWith(p, []));
    expect(out.pawns[0].currentState).toBe(PAWN_STATE.SLEEPING);
  });

  it('sleeps on the bed tile (recording the bed coords) when already standing on it', () => {
    const p = pawn({ position: { x: 5, y: 5 } });
    const out = handleTired(p, stateWith(p, [bed()]));
    const after = out.pawns[0];
    expect(after.currentState).toBe(PAWN_STATE.SLEEPING);
    expect(after.activeJob?.targetX).toBe(5);
    expect(after.activeJob?.targetY).toBe(5);
  });
});
