import { describe, it, expect } from 'vitest';
import { handleSleeping } from '$lib/game/systems/pawn/handlers/needs';
import { PAWN_STATE } from '$lib/game/systems/pawn/pawnStates';
import type { GameState, Pawn } from '$lib/game/core/types';

function sleeper(needs: Partial<Pawn['needs']>): Pawn {
  return {
    id: 'p1',
    name: 'Sleeper',
    currentState: PAWN_STATE.SLEEPING,
    position: { x: 0, y: 0 },
    isMoving: false,
    path: [],
    needs: { hunger: 0, thirst: 0, fatigue: 30, sleep: 30, ...needs },
    state: { mood: 50, health: 100, isWorking: false, isSleeping: true, isEating: false }
  } as unknown as Pawn;
}

const withDrinkZone = (p: Pawn): GameState =>
  ({
    turn: 1,
    pawns: [p],
    buildings: [],
    designations: { '2,2': 'drink' }
  }) as unknown as GameState;
const noWater = (p: Pawn): GameState =>
  ({ turn: 1, pawns: [p], buildings: [], designations: {} }) as unknown as GameState;

describe('handleSleeping — wake for thirst', () => {
  it('a well-rested-enough but THIRSTY pawn wakes when a drink target exists', () => {
    const p = sleeper({ thirst: 90 });
    const after = handleSleeping(p, withDrinkZone(p)).pawns[0];
    expect(after.currentState).toBe(PAWN_STATE.IDLE);
  });

  it('the SAME pawn keeps sleeping when NOT thirsty (proves thirst is what woke it)', () => {
    const p = sleeper({ thirst: 0 });
    const after = handleSleeping(p, withDrinkZone(p)).pawns[0];
    expect(after.currentState).toBe(PAWN_STATE.SLEEPING);
  });

  it('does NOT wake for thirst when there is no reachable water (no ping-pong)', () => {
    const p = sleeper({ thirst: 90 });
    const after = handleSleeping(p, noWater(p)).pawns[0];
    expect(after.currentState).toBe(PAWN_STATE.SLEEPING);
  });
});
