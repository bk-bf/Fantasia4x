import { describe, it, expect } from 'vitest';
import { pawnStateMachineService } from './PawnStateMachine';
import { CARE_CONFIG } from '../core/Wounds';
import type { GameState, Pawn, Injury } from '../core/types';

// A fresh open+untended wound must not fester until it is `infectionIncubationTicks` old (~2.5 in-game days).

function makePawn(injury: Injury): Pawn {
  return {
    id: 'p1',
    name: 'Wren',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Idle',
    stats: { strength: 12, dexterity: 12, constitution: 10, intelligence: 10, perception: 10, charisma: 10 },
    traits: [],
    equipment: {},
    skills: {},
    needs: { hunger: 10, fatigue: 10, thirst: 0, hygiene: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    state: { mood: 50, health: 100, isWorking: false, isEating: false, isSleeping: false },
    // One open (serious), untended wound on a torso part — no bleeding, so blood loss can't interfere.
    limbs: [
      { id: 'head', health: 100, bleedRate: 0, parts: [] },
      {
        id: 'torso',
        health: 60,
        bleedRate: 0,
        parts: [{ id: 'heart', health: 50, maxHp: 60, isMissing: false, injuries: [injury] }]
      },
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
    maxStamina: 50
  } as unknown as Pawn;
}

function makeState(pawn: Pawn, turn: number): GameState {
  return {
    turn,
    pawns: [pawn],
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

const openWound: Injury = {
  bodyPart: 'heart',
  type: 'cut',
  severity: 'serious',
  damage: 10,
  bleeding: 0,
  painContribution: 1,
  infected: false,
  inflictedAt: 1
};

const hasInfection = (gs: GameState) =>
  (gs.pawns[0].conditions ?? []).some((c) => c.id === 'infection' && c.severity > 0);

describe('infection incubation grace', () => {
  it('a fresh open+untended wound does NOT infect before incubation', () => {
    // age = 100 ticks, well under the incubation window
    const out = pawnStateMachineService.tick(makeState(makePawn(openWound), 1 + 100));
    expect(hasInfection(out)).toBe(false);
  });

  it('the same wound starts to fester once it is older than the incubation window', () => {
    const turn = 1 + CARE_CONFIG.infectionIncubationTicks + 100;
    const out = pawnStateMachineService.tick(makeState(makePawn(openWound), turn));
    expect(hasInfection(out)).toBe(true);
  });

  it('a wound with no inflictedAt (legacy save) starts its clock at load, so it does not infect immediately', () => {
    const { inflictedAt: _omit, ...legacy } = openWound;
    const out = pawnStateMachineService.tick(makeState(makePawn(legacy as Injury), 999999));
    expect(hasInfection(out)).toBe(false);
  });
});
