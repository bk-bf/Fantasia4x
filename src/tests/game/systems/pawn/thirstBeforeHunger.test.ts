import { describe, it, expect } from 'vitest';
import { selectIdleNeed, selectInterruptNeed } from '$lib/game/systems/pawn/needSelection';
import type { GameState, Pawn } from '$lib/game/core/types';

function pawn(hunger: number, thirst: number, pos = { x: 1, y: 1 }): Pawn {
  return {
    id: 'p1',
    name: 'T',
    isAlive: true,
    position: pos,
    needs: { hunger, thirst, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0, hygiene: 10 }
  } as unknown as Pawn;
}

function makeState(p: Pawn, drinkAt: { x: number; y: number }, foodAt: { x: number; y: number }) {
  return {
    seed: 1,
    turn: 5,
    pawns: [p],
    stockpile: { bread: 5 },
    droppedItems: [
      { id: 'b', resourceId: 'bread', x: foodAt.x, y: foodAt.y, quantity: 5, stored: true }
    ],
    designations: { [`${drinkAt.x},${drinkAt.y}`]: 'drink' },
    buildings: []
  } as unknown as GameState;
}

describe('thirst-before-hunger distance check', () => {
  it('IDLE: drinks first when the drink zone is adjacent and food is far', () => {
    const gs = makeState(pawn(80, 85), { x: 0, y: 1 }, { x: 10, y: 10 });
    const choice = selectIdleNeed(gs.pawns[0], gs);
    expect(choice?.kind).toBe('water');
    if (choice?.kind === 'water') expect(choice.need).toBe('drink');
  });

  it('IDLE: eats first when food is strictly closer than water', () => {
    const gs = makeState(pawn(80, 85), { x: 10, y: 10 }, { x: 2, y: 1 });
    expect(selectIdleNeed(gs.pawns[0], gs)?.kind).toBe('eat');
  });

  it('IDLE: thirst-only (not hungry) still routes to drink', () => {
    const gs = makeState(pawn(0, 85), { x: 0, y: 1 }, { x: 2, y: 1 });
    expect(selectIdleNeed(gs.pawns[0], gs)?.kind).toBe('water');
  });

  it('MID-JOB: interrupts to drink when the drink zone is nearer than food', () => {
    const gs = makeState(pawn(80, 85), { x: 0, y: 1 }, { x: 10, y: 10 });
    const choice = selectInterruptNeed(gs.pawns[0], gs, 'Working', 0, [], 0);
    expect(choice?.kind).toBe('water');
  });

  it('still walks to the drink zone even when the colony has water stored elsewhere', () => {
    const gs = makeState(pawn(80, 85), { x: 0, y: 1 }, { x: 10, y: 10 });
    gs.stockpile = { bread: 5, water: 3 };
    expect(selectIdleNeed(gs.pawns[0], gs)?.kind).toBe('water');
  });

  it('drinks from its own waterskin instead of walking, when it is carrying one', () => {
    const gs = makeState(pawn(80, 85), { x: 0, y: 1 }, { x: 10, y: 10 });
    gs.pawns[0].inventory = {
      items: {},
      instances: [
        {
          instanceId: 'skin1',
          itemId: 'waterskin',
          durability: 80,
          filter: ['water'],
          contents: [{ itemId: 'water', litres: 2 }]
        }
      ]
    } as never;
    const choice = selectIdleNeed(gs.pawns[0], gs);
    expect(choice?.kind).toBe('water');
    const routed = choice?.kind === 'water' ? choice.routedState : undefined;
    expect(routed?.pawns[0].path ?? []).toHaveLength(0);
  });
});
