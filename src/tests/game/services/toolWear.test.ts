import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import type { GameState, DroppedItem } from '$lib/game/core/types';

function makeState(axes: number): GameState {
  const drops: DroppedItem[] = [
    { id: 's', resourceId: 'stone_axe', x: 0, y: 0, quantity: axes, stored: true }
  ];
  return {
    seed: 1,
    turn: 0,
    stockpile: { stone_axe: axes },
    stockpileZones: [],
    droppedItems: drops,
    buildings: []
  } as unknown as GameState;
}

describe('§B tool work-wear (applyToolWear)', () => {
  it('accumulates wear per action without consuming the tool early', () => {
    let gs = makeState(1);
    gs = itemService.applyToolWear('woodcutting', gs);
    expect(gs.toolWear?.['stone_axe']).toBe(2);
    expect(gs.stockpile['stone_axe']).toBe(1);
  });

  it('breaks the axe after exactly 15 fells (30/2)', () => {
    let gs = makeState(1);
    for (let i = 0; i < 14; i++) gs = itemService.applyToolWear('woodcutting', gs);
    expect(gs.stockpile['stone_axe']).toBe(1);
    gs = itemService.applyToolWear('woodcutting', gs);
    expect(gs.stockpile['stone_axe'] ?? 0).toBe(0);
    expect(gs.toolWear?.['stone_axe']).toBe(0);
  });

  it('is a no-op with no matching tool in stock (bare hands)', () => {
    const gs = makeState(0);
    gs.stockpile = {};
    expect(itemService.applyToolWear('woodcutting', gs)).toBe(gs);
  });
});
