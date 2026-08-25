import { describe, it, expect } from 'vitest';
import {
  reserveForOrder,
  releaseReservation,
  availableQuantityFromDrops,
  aggregateFromDrops
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
