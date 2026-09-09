import { describe, it, expect } from 'vitest';
import { COMMANDS } from '$lib/game/sim/commands';
import type { GameState, Pawn } from '$lib/game/core/types';

function makeState(
  pawn: Pawn,
  stockpile: Record<string, number>,
  droppedItems: GameState['droppedItems'] = []
): GameState {
  return {
    turn: 0,
    pawns: [pawn],
    buildings: [],
    droppedItems,
    stockpile
  } as unknown as GameState;
}

const pawn = (): Pawn =>
  ({
    id: 'p1',
    position: { x: 0, y: 0 },
    equipment: {},
    inventory: { items: {}, instances: [] }
  }) as unknown as Pawn;

describe('equipPawnItem refuses to mint gear the colony does not have', () => {
  it('an empty stockpile leaves the pawn unequipped and the state untouched', () => {
    const s = makeState(pawn(), {});
    const out = COMMANDS.equipPawnItem(s, { pawnId: 'p1', itemId: 'flint_knife' });
    expect(out.pawns[0].equipment.mainHand).toBeUndefined();
    expect(out).toBe(s);
  });

  it('equips and consumes one unit from the stockpile when one is available', () => {
    const drop = {
      id: 'd1',
      resourceId: 'flint_knife',
      x: 0,
      y: 0,
      quantity: 1,
      stored: true
    } as NonNullable<GameState['droppedItems']>[number];
    const s = makeState(pawn(), { flint_knife: 1 }, [drop]);
    const out = COMMANDS.equipPawnItem(s, { pawnId: 'p1', itemId: 'flint_knife' });
    expect(out.pawns[0].equipment.mainHand?.itemId).toBe('flint_knife');
    expect(out.stockpile?.flint_knife ?? 0).toBe(0);
  });

  it('devEquipPawnItem is the named bypass and does not touch the stockpile', () => {
    const s = makeState(pawn(), {});
    const out = COMMANDS.devEquipPawnItem(s, { pawnId: 'p1', itemId: 'flint_knife' });
    expect(out.pawns[0].equipment.mainHand?.itemId).toBe('flint_knife');
    expect(out.stockpile?.flint_knife ?? 0).toBe(0);
  });
});
