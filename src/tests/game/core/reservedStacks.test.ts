import { describe, it, expect } from 'vitest';
import { completeCraftOrder } from '$lib/game/services/jobs/craft';
import {
  absorbDropIfOnStockpileTile,
  addToStockpileZone,
  reserveForOrder,
  releaseReservation
} from '$lib/game/core/state/stockpile';
import { depositInventory } from '$lib/game/systems/pawn/pawnHauling';
import { itemService } from '$lib/game/services/ItemService';
import { recipeService } from '$lib/game/services/RecipeService';
import type { GameState, DroppedItem, Pawn } from '$lib/game/core/types';

function firewoodOrder(id: string): never {
  return {
    id,
    item: itemService.getItemById('green_firewood')!,
    quantity: 1,
    workRequired: 2,
    workDone: 2,
    startedAt: 0,
    inputs: { pine_log: 1 },
    stationType: recipeService.getRecipeForItem('green_firewood')!.station,
    stationBuildingId: 'cb-1'
  } as never;
}

function stationState(extra: DroppedItem[]): GameState {
  const order = firewoodOrder('cq1') as unknown as { stationType: string };
  return {
    seed: 1,
    turn: 0,
    pawns: [],
    buildings: [{ id: 'cb-1', type: order.stationType, x: 5, y: 5, status: 'complete' }],
    stockpile: {},
    stockpileZones: [],
    droppedItems: [
      {
        id: 'stored-pine_log-5-5',
        resourceId: 'pine_log',
        x: 5,
        y: 5,
        quantity: 1,
        stored: true,
        reservedFor: 'cq1'
      },
      ...extra
    ],
    designations: {},
    zoneTiles: { '5,5': ['stockpile'] },
    jobs: [],
    craftingQueue: [order]
  } as unknown as GameState;
}

const pineLogs = (gs: GameState) =>
  (gs.droppedItems ?? [])
    .filter((d) => d.resourceId === 'pine_log')
    .reduce((s, d) => s + d.quantity, 0);

const reservedFor = (gs: GameState, orderId: string) =>
  (gs.droppedItems ?? [])
    .filter((d) => d.reservedFor === orderId)
    .reduce((s, d) => s + d.quantity, 0);

const uniqueIds = (gs: GameState) => {
  const ids = (gs.droppedItems ?? []).map((d) => d.id);
  return new Set(ids).size === ids.length;
};

describe('items landing on a stack reserved for a craft order', () => {
  it('a loose drop absorbed on that tile stays out of the reservation and survives the craft', () => {
    let gs = stationState([
      { id: 'loose', resourceId: 'pine_log', x: 5, y: 5, quantity: 4, stored: false }
    ]);
    gs = absorbDropIfOnStockpileTile(gs, 'loose');
    expect(reservedFor(gs, 'cq1')).toBe(1);
    gs = completeCraftOrder(gs.craftingQueue[0] as never, gs);
    expect(pineLogs(gs)).toBe(4);
  });

  it('items added to the stockpile on that tile stay out of the reservation and survive the craft', () => {
    let gs = stationState([]);
    gs = addToStockpileZone(gs, '5,5', { pine_log: 4 });
    expect(reservedFor(gs, 'cq1')).toBe(1);
    expect(uniqueIds(gs)).toBe(true);
    gs = completeCraftOrder(gs.craftingQueue[0] as never, gs);
    expect(pineLogs(gs)).toBe(4);
  });

  it('a pawn depositing into a full stockpile does not add to a reserved stack', () => {
    const pawn = {
      id: 'p1',
      name: 'Hauler',
      position: { x: 5, y: 5 },
      isAlive: true,
      stats: { strength: 10 },
      physicalTraits: { height: 170, weight: 70 },
      inventory: { items: { yew_log: 3 }, instances: [] },
      equipment: {}
    } as unknown as Pawn;
    const gs = {
      turn: 1,
      pawns: [pawn],
      droppedItems: [
        {
          id: 'r1',
          resourceId: 'yew_log',
          x: 5,
          y: 5,
          quantity: 1,
          stored: true,
          reservedFor: 'cq1'
        },
        { id: 's1', resourceId: 'stone', x: 6, y: 5, quantity: 2, stored: true }
      ],
      zoneInstances: [],
      zoneTiles: { '5,5': ['stockpile'], '6,5': ['stockpile'] }
    } as unknown as GameState;
    const out = depositInventory(pawn, gs);
    expect(reservedFor(out, 'cq1')).toBe(1);
  });
});

describe('a partial reservation split off a stack', () => {
  const hides: DroppedItem = {
    id: 'hides',
    resourceId: 'raw_hide',
    x: 3,
    y: 3,
    quantity: 10,
    stored: true,
    drying: 120,
    decayAcc: 40,
    matDur: 1.2,
    matWeight: 0.9,
    quality: 3,
    forbidden: true
  };

  it('carries the state of the stack it came from', () => {
    const gs = { droppedItems: [hides], buildings: [] } as unknown as GameState;
    const { state, reserved } = reserveForOrder(gs, 'raw_hide', 4, 'order-1');
    expect(reserved).toBe(4);
    const piece = state.droppedItems!.find((d) => d.reservedFor === 'order-1')!;
    expect(piece).toMatchObject({
      quantity: 4,
      stored: true,
      drying: 120,
      decayAcc: 40,
      matDur: 1.2,
      matWeight: 0.9,
      quality: 3,
      forbidden: true
    });
  });

  it('rejoins that stack when the reservation is released', () => {
    const gs = { droppedItems: [hides], buildings: [] } as unknown as GameState;
    const { state } = reserveForOrder(gs, 'raw_hide', 4, 'order-1');
    const back = releaseReservation(state, 'order-1');
    expect(back.droppedItems).toEqual([hides]);
  });

  it('keeps per-unit conditions in order across the split and the release', () => {
    const conds: DroppedItem = {
      id: 'meat',
      resourceId: 'venison',
      x: 1,
      y: 1,
      quantity: 4,
      stored: true,
      unitConditions: [10, 20, 30, 40]
    };
    const gs = { droppedItems: [conds], buildings: [] } as unknown as GameState;
    const { state } = reserveForOrder(gs, 'venison', 3, 'order-2');
    const piece = state.droppedItems!.find((d) => d.reservedFor === 'order-2')!;
    expect(piece.unitConditions).toEqual([10, 20, 30]);
    const back = releaseReservation(state, 'order-2');
    expect(back.droppedItems).toEqual([conds]);
  });

  it('stays a separate stack when released after its source has gone', () => {
    const gs = { droppedItems: [hides], buildings: [] } as unknown as GameState;
    const { state } = reserveForOrder(gs, 'raw_hide', 4, 'order-1');
    const moved = {
      ...state,
      droppedItems: state.droppedItems!.filter((d) => d.id !== 'hides')
    } as GameState;
    const back = releaseReservation(moved, 'order-1');
    expect(back.droppedItems).toHaveLength(1);
    expect(back.droppedItems![0]).toMatchObject({ quantity: 4, drying: 120 });
    expect(back.droppedItems![0].reservedFor).toBeUndefined();
  });
});
