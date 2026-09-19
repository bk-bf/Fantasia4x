import { describe, it, expect } from 'vitest';
import {
  reserveForOrder,
  releaseReservation,
  availableQuantityFromDrops,
  aggregateFromDrops,
  consumeFromStockpiles
} from '$lib/game/core/state/stockpile';
import { itemService } from '$lib/game/services/ItemService';
import { recipeService } from '$lib/game/services/RecipeService';
import type { GameState, DroppedItem } from '$lib/game/core/types';

function drop(id: string, resourceId: string, quantity: number): DroppedItem {
  return { id, resourceId, x: 0, y: 0, quantity, stored: true };
}
function state(drops: DroppedItem[]): GameState {
  return { droppedItems: drops } as unknown as GameState;
}

describe('ADR-016 reservation bookkeeping', () => {
  it('reserving splits a stack: available drops, colony total is unchanged', () => {
    const gs = state([drop('d1', 'wood', 5)]);
    const { state: after, reserved } = reserveForOrder(gs, 'wood', 2, 'order-A');
    expect(reserved).toBe(2);
    expect(availableQuantityFromDrops(after.droppedItems, 'wood')).toBe(3);
    expect(aggregateFromDrops(after.droppedItems)['wood']).toBe(5);
  });

  it('prevents double-spend: a second order only sees the unreserved remainder', () => {
    let gs = state([drop('d1', 'wood', 5)]);
    gs = reserveForOrder(gs, 'wood', 4, 'order-A').state;
    const { state: after, reserved } = reserveForOrder(gs, 'wood', 4, 'order-B');
    expect(reserved).toBe(1);
    expect(availableQuantityFromDrops(after.droppedItems, 'wood')).toBe(0);
  });

  it('cancelling an order releases its reservation back to available stock', () => {
    let gs = state([drop('d1', 'wood', 5)]);
    gs = reserveForOrder(gs, 'wood', 3, 'order-A').state;
    expect(availableQuantityFromDrops(gs.droppedItems, 'wood')).toBe(2);
    gs = releaseReservation(gs, 'order-A');
    expect(availableQuantityFromDrops(gs.droppedItems, 'wood')).toBe(5);
  });

  it('getAvailableQuantity excludes reserved stock (affordability cannot double-count)', () => {
    let gs = state([drop('d1', 'wood', 5)]);
    gs = reserveForOrder(gs, 'wood', 5, 'order-A').state;
    expect(itemService.getAvailableQuantity('wood', gs)).toBe(0);
  });
});

describe('availableQuantityFromDrops (direct)', () => {
  it('counts a quantity held inside a stored vessel instance (contents)', () => {
    const vesselDrop = {
      id: 'v1',
      resourceId: 'waterskin',
      x: 0,
      y: 0,
      quantity: 1,
      stored: true,
      instance: {
        instanceId: 'i1',
        itemId: 'waterskin',
        durability: 100,
        contents: [{ itemId: 'water', litres: 4 }]
      }
    } as unknown as DroppedItem;
    expect(availableQuantityFromDrops([vesselDrop], 'water')).toBe(4);
  });

  it('excludes a drop that is not stored', () => {
    const loose = { ...drop('d2', 'wood', 5), stored: false };
    expect(availableQuantityFromDrops([loose], 'wood')).toBe(0);
  });
});

describe('reserveForOrder: vessel-held contents are not split (reserves the whole carrier)', () => {
  it('reserving a small amount held inside a vessel reserves the entire vessel drop, not just the amount asked for', () => {
    const vesselDrop = {
      id: 'v1',
      resourceId: 'waterskin',
      x: 0,
      y: 0,
      quantity: 1,
      stored: true,
      instance: {
        instanceId: 'i1',
        itemId: 'waterskin',
        durability: 100,
        contents: [{ itemId: 'water', litres: 10 }]
      }
    } as unknown as DroppedItem;
    const gs = state([vesselDrop]);
    const { reserved, state: after } = reserveForOrder(gs, 'water', 2, 'order-A');
    expect(reserved).toBe(10);
    expect(after.droppedItems![0].reservedFor).toBe('order-A');
  });
});

describe('releaseReservation only touches the named order', () => {
  it('releasing one order leaves a different order\'s reservation on a different drop intact', () => {
    let gs = state([drop('d1', 'wood', 3), drop('d2', 'stone', 5)]);
    gs = reserveForOrder(gs, 'wood', 3, 'order-A').state;
    gs = reserveForOrder(gs, 'stone', 5, 'order-B').state;
    gs = releaseReservation(gs, 'order-A');
    const wood = gs.droppedItems!.find((d) => d.resourceId === 'wood');
    const stoneDrop = gs.droppedItems!.find((d) => d.resourceId === 'stone');
    expect(wood?.reservedFor).toBeUndefined();
    expect(stoneDrop?.reservedFor).toBe('order-B');
  });
});

describe('consumeFromStockpiles', () => {
  it('skips a reserved pile and draws from the unreserved one instead', () => {
    const gs = state([
      { ...drop('r', 'wood', 3), reservedFor: 'order-A' },
      drop('u', 'wood', 4)
    ]);
    const out = consumeFromStockpiles(gs, { wood: 2 });
    const reservedPile = out.droppedItems!.find((d) => d.id === 'r');
    const unreservedPile = out.droppedItems!.find((d) => d.id === 'u');
    expect(reservedPile?.quantity).toBe(3);
    expect(unreservedPile?.quantity).toBe(2);
  });

  it('clamps a depleted pile at zero (not negative) and carries the exact shortfall to the next pile', () => {
    const gs = state([drop('p1', 'wood', 3), drop('p2', 'wood', 10)]);
    const out = consumeFromStockpiles(gs, { wood: 5 });
    expect(out.droppedItems!.find((d) => d.id === 'p1')).toBeUndefined();
    const p2 = out.droppedItems!.find((d) => d.id === 'p2');
    expect(p2?.quantity).toBe(8);
  });
});

describe('butchery is recipe-based and consumes exactly one carcass (R3)', () => {
  it('a butchery recipe (make_rabbit_meat) reserves a single carcass, not the whole stack', () => {
    const recipe = recipeService.getRecipeForItem('rabbit_meat');
    expect(recipe?.inputs?.['rabbit_carcass']).toBe(1);

    let gs = state([drop('c', 'rabbit_carcass', 3)]);
    const { reserved, state: after } = reserveForOrder(
      gs,
      'rabbit_carcass',
      recipe!.inputs['rabbit_carcass'],
      'butcher-1'
    );
    expect(reserved).toBe(1);
    expect(availableQuantityFromDrops(after.droppedItems, 'rabbit_carcass')).toBe(2);
  });
});
