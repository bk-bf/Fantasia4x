import { describe, it, expect } from 'vitest';
import { designationService } from '$lib/game/services/DesignationService';
import type { GameState, DroppedItem } from '$lib/game/core/types';

// A stockpile is just a place designation — painting one over loose items on the ground should
// treat them as stored immediately (no haul). Inverse of the deposit-time absorption trigger.

const loose = (p: Partial<DroppedItem>): DroppedItem =>
  ({ id: 'l', resourceId: 'branch', x: 0, y: 0, quantity: 5, stored: false, ...p }) as DroppedItem;

function makeState(drops: DroppedItem[]): GameState {
  return {
    droppedItems: drops,
    designations: {},
    buildings: [],
    stockpileZones: [],
    worldMap: [],
    stockpile: {}
  } as unknown as GameState;
}

describe('paint stockpile over loose items absorbs them (DesignationService)', () => {
  it('designate() absorbs a loose drop on the painted tile', () => {
    const gs = makeState([loose({ id: 'a', x: 3, y: 3, quantity: 7 })]);
    const out = designationService.designate(3, 3, 'stockpile', gs);
    expect(out.droppedItems!.find((d) => d.id === 'a')!.stored).toBe(true);
    expect(out.stockpile['branch']).toBe(7);
  });

  it('designateRect() absorbs every loose drop inside the painted rect, leaving outside ones loose', () => {
    const gs = makeState([
      loose({ id: 'in1', resourceId: 'granite', x: 1, y: 1, quantity: 4 }),
      loose({ id: 'in2', resourceId: 'branch', x: 2, y: 2, quantity: 3 }),
      loose({ id: 'out', resourceId: 'granite', x: 9, y: 9, quantity: 5 })
    ]);
    const out = designationService.designateRect(0, 0, 3, 3, 'stockpile', gs);
    const byId = (id: string) => out.droppedItems!.find((d) => d.id === id)!;
    expect(byId('in1').stored).toBe(true);
    expect(byId('in2').stored).toBe(true);
    expect(byId('out').stored).toBe(false); // outside the rect — untouched
    expect(out.stockpile).toEqual({ granite: 4, branch: 3 });
  });

  it('merges a loose drop into an existing stored pile of the same resource on the tile', () => {
    const gs = makeState([
      { id: 'stored', resourceId: 'branch', x: 5, y: 5, quantity: 2, stored: true } as DroppedItem,
      loose({ id: 'fresh', resourceId: 'branch', x: 5, y: 5, quantity: 6 })
    ]);
    const out = designationService.designate(5, 5, 'stockpile', gs);
    const piles = out.droppedItems!.filter((d) => d.resourceId === 'branch');
    expect(piles).toHaveLength(1); // merged, not two stacks
    expect(piles[0].quantity).toBe(8);
  });

  it('a non-stockpile designation does NOT absorb', () => {
    const gs = makeState([loose({ id: 'a', x: 1, y: 1 })]);
    const out = designationService.designate(1, 1, 'forage', gs);
    expect(out.droppedItems!.find((d) => d.id === 'a')!.stored).toBe(false);
  });
});
