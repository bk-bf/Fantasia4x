import { describe, it, expect } from 'vitest';
import { handleDrinking, handleWashing, handleEating } from '$lib/game/systems/pawn/handlers/needs';
import { PAWN_STATE } from '$lib/game/systems/pawn/pawnStates';
import type { GameState, Pawn } from '$lib/game/core/types';

// A pawn drinking/washing must stay GATED at the water tile until the task completes — it can enter
// the state while still carrying a movement path (e.g. interrupted mid-job next to water), and must
// not walk off mid-task (player report). The handlers clear path/isMoving every tick.

function drinkingPawn(state: string): Pawn {
  return {
    id: 'p',
    name: 'P',
    isAlive: true,
    position: { x: 5, y: 5 },
    needs: { hunger: 0, fatigue: 0, thirst: 80, hygiene: 80 },
    // Residual movement from however it entered the state.
    path: [
      { x: 6, y: 5 },
      { x: 7, y: 5 }
    ],
    pathIndex: 0,
    isMoving: true,
    currentState: state,
    activeJob: {
      type: 'need',
      targetX: 5,
      targetY: 5,
      progress: 0,
      timeRequired: 120,
      turnsInState: 1
    }
  } as unknown as Pawn;
}

const stateWith = (p: Pawn): GameState =>
  ({ turn: 0, stockpile: {}, pawns: [p] }) as unknown as GameState;

describe('drinking/washing gate the pawn in place', () => {
  it('handleDrinking clears the residual path so the pawn stays put', () => {
    const out = handleDrinking(
      drinkingPawn(PAWN_STATE.DRINKING),
      stateWith(drinkingPawn(PAWN_STATE.DRINKING))
    );
    const p = out.pawns[0];
    expect(p.currentState).toBe(PAWN_STATE.DRINKING); // still drinking (1/120 done)
    expect(p.path?.length ?? 0).toBe(0);
    expect(p.isMoving).toBe(false);
  });

  it('handleWashing clears the residual path so the pawn stays put', () => {
    const out = handleWashing(
      drinkingPawn(PAWN_STATE.WASHING),
      stateWith(drinkingPawn(PAWN_STATE.WASHING))
    );
    const p = out.pawns[0];
    expect(p.currentState).toBe(PAWN_STATE.WASHING);
    expect(p.path?.length ?? 0).toBe(0);
    expect(p.isMoving).toBe(false);
  });

  it('handleEating clears the residual path so the pawn stays put', () => {
    const out = handleEating(
      drinkingPawn(PAWN_STATE.EATING),
      stateWith(drinkingPawn(PAWN_STATE.EATING))
    );
    const p = out.pawns[0];
    expect(p.path?.length ?? 0).toBe(0);
    expect(p.isMoving).toBe(false);
  });
});
