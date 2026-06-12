import { describe, it, expect } from 'vitest';
import { pawnService } from './PawnService';
import type { GameState, Pawn } from '../core/types';

/**
 * §D auto-drink: a thirsty pawn (≥70) drinks stored water (consumes 1, big thirst relief),
 * or raw water next to a river (free, small hygiene hit). Below threshold, nothing happens.
 */
function pawn(thirst: number, pos = { x: 1, y: 1 }): Pawn {
  return {
    id: 'p1',
    name: 'T',
    isAlive: true,
    position: pos,
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0, thirst, hygiene: 10 }
  } as unknown as Pawn;
}

function makeState(p: Pawn, water: number, withRiver = false): GameState {
  const drops = water > 0 ? [{ id: 'w', resourceId: 'water', x: 0, y: 0, quantity: water, stored: true }] : [];
  // 3×3 land map; optionally make a neighbour a water tile.
  const worldMap = Array.from({ length: 3 }, (_, y) =>
    Array.from({ length: 3 }, (_, x) => ({ x, y, type: withRiver && x === 0 && y === 1 ? 'water' : 'land' }))
  );
  return {
    seed: 1, turn: 5, pawns: [p], stockpile: { water }, stockpileZones: [], droppedItems: drops, worldMap
  } as unknown as GameState;
}

describe('§D auto-drink (processAutoDrink)', () => {
  it('drinks stored water when thirsty, consuming a unit and relieving thirst', () => {
    const out = pawnService.processAutoDrink(makeState(pawn(80), 2));
    expect(out.pawns[0].needs.thirst).toBe(80 - 65);
    expect(out.stockpile['water']).toBe(1);
  });

  it('drinks raw from an adjacent river when no stored water (small hygiene hit)', () => {
    const out = pawnService.processAutoDrink(makeState(pawn(90, { x: 1, y: 1 }), 0, true));
    expect(out.pawns[0].needs.thirst).toBe(90 - 65);
    expect(out.pawns[0].needs.hygiene).toBe(16); // +6 untreated
  });

  it('does nothing below the thirst threshold', () => {
    const gs = makeState(pawn(50), 2);
    expect(pawnService.processAutoDrink(gs)).toBe(gs);
  });
});

describe('§D auto-wash (processAutoWash)', () => {
  const filthy = (hygiene: number, pos = { x: 1, y: 1 }): Pawn =>
    ({ ...pawn(0, pos), needs: { ...pawn(0, pos).needs, hygiene } }) as Pawn;

  it('washes a filthy pawn at an adjacent river, lowering hygiene', () => {
    const out = pawnService.processAutoWash(makeState(filthy(90), 0, true));
    expect(out.pawns[0].needs.hygiene).toBe(90 - 70);
  });

  it('does nothing if no water is adjacent', () => {
    const gs = makeState(filthy(90), 0, false);
    expect(pawnService.processAutoWash(gs)).toBe(gs);
  });

  it('does nothing below the hygiene threshold', () => {
    const gs = makeState(filthy(50), 0, true);
    expect(pawnService.processAutoWash(gs)).toBe(gs);
  });
});
