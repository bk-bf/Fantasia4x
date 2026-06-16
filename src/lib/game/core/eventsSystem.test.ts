import { describe, it, expect } from 'vitest';
import { EventSystem } from './Events';
import type { GameState } from './types';

// R11 — the random-events system is wired into the turn loop (GameEngineImpl 'events' phase) and
// surfaces via the chronicle. These lock the consequence-application path that had to be reconciled
// from the dead `buildingCounts` map to the physical PlacedBuilding[] model, and made immutable.

function makeState(): GameState {
  return {
    turn: 100,
    pawns: [
      { id: 'p1', state: { mood: 50, health: 100 }, stats: { strength: 10 } },
      { id: 'p2', state: { mood: 50, health: 100 }, stats: { strength: 10 } }
    ],
    buildings: [{ id: 'b1', type: 'house', status: 'complete', condition: 100 }],
    droppedItems: [],
    stockpile: {},
    designations: {}
  } as unknown as GameState;
}

describe('R11 event consequences (reconciled to the current model)', () => {
  it('applies building damage to PlacedBuilding.condition (not the dead buildingCounts) without crashing', () => {
    const es = new EventSystem();
    const state = makeState();
    const consequence = {
      id: 'c',
      description: 'A fire damages a building',
      probability: 1,
      effects: {
        buildingEffects: { destroyChance: 1, targetBuilding: 'random', targetCount: 1 }
      }
    } as any;
    const out = es.processEventConsequences([consequence], state) as GameState;
    expect(out.buildings[0].condition).toBe(0); // destroyed in place
    // immutability — the original state object is untouched
    expect(state.buildings[0].condition).toBe(100);
    expect(out.buildings[0]).not.toBe(state.buildings[0]);
  });

  it('applies pawn mood changes immutably (new pawn objects, original untouched)', () => {
    const es = new EventSystem();
    const state = makeState();
    const consequence = {
      id: 'c',
      description: 'Morale drops',
      probability: 1,
      effects: {
        pawnEffects: {
          targetType: 'all',
          effects: { moodChange: { min: -10, max: -10 } }
        }
      }
    } as any;
    const out = es.processEventConsequences([consequence], state) as GameState;
    expect(out.pawns[0].state.mood).toBe(40);
    expect(out.pawns[1].state.mood).toBe(40);
    expect(state.pawns[0].state.mood).toBe(50); // original unchanged
    expect(out.pawns[0]).not.toBe(state.pawns[0]);
  });
});
