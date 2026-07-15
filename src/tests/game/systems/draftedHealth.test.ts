import { describe, it, expect } from 'vitest';
import { pawnStateMachineService } from '$lib/game/systems/PawnStateMachine';
import type { GameState, Pawn } from '$lib/game/core/types';

// Drafted pawns must still run the health sim (bleed/heal/collapse/death); only the FSM is skipped.
function makePawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p1',
    name: 'Wren',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Idle',
    stats: { strength: 14, dexterity: 14, constitution: 12, intelligence: 10, perception: 10, charisma: 10 },
    traits: [],
    equipment: {},
    skills: {},
    needs: { hunger: 10, fatigue: 10, thirst: 0, hygiene: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50, health: 100, isWorking: false, isEating: false, isSleeping: false },
    limbs: [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      { id: 'torso', health: 60, bleedRate: 60, parts: [] }, // bleeding (~1 blood/tick)
      { id: 'left_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_arm', health: 100, bleedRate: 0, parts: [] },
      { id: 'left_leg', health: 100, bleedRate: 0, parts: [] },
      { id: 'right_leg', health: 100, bleedRate: 0, parts: [] }
    ],
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 50,
    maxStamina: 50,
    ...(over as object)
  } as unknown as Pawn;
}

function makeState(pawns: Pawn[]): GameState {
  return {
    turn: 1,
    pawns,
    jobs: [],
    mobs: [],
    droppedItems: [],
    buildings: [],
    stockpile: {},
    deadPawns: [],
    worldMap: [],
    designations: {}
  } as unknown as GameState;
}

describe('R2 drafted pawns run the health sim', () => {
  it('a drafted pawn with a bleeding wound loses blood (not immortal)', () => {
    const out = pawnStateMachineService.tick(makeState([makePawn({ drafted: true })]));
    expect(out.pawns[0].bloodVolume).toBeLessThan(100);
  });

  it('drafted and undrafted bleed at the same rate (drafting grants no immortality)', () => {
    const blood = (drafted: boolean) =>
      pawnStateMachineService.tick(makeState([makePawn({ drafted })])).pawns[0].bloodVolume!;
    expect(blood(true)).toBeCloseTo(blood(false), 6);
  });

  it('a drafted pawn can bleed out and die', () => {
    let gs = makeState([makePawn({ drafted: true, bloodVolume: 3 })]);
    for (let i = 0; i < 6 && gs.pawns[0].isAlive !== false; i++) {
      gs = pawnStateMachineService.tick(gs);
      gs = { ...gs, turn: gs.turn + 1 };
    }
    expect(gs.pawns[0].isAlive).toBe(false);
  });
});
