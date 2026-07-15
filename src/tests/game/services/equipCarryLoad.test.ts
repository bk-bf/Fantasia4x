import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import type { GameState, Pawn } from '$lib/game/core/types';

// Equipped gear must count toward a pawn's carry WEIGHT (the pawn bears its mass), but NOT its
// volume (worn, not packed). Previously equipped items were weightless/volumeless in the carry
// calc, so armour/weapons never affected the carry limit (player report 2026-06-14).

const STONE_SPEAR_W = 1.5; // from items.jsonc
const WATTLE_BUCKLER_W = 2;

function makePawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p',
    name: 'P',
    stats: { strength: 10 },
    physicalTraits: { size: 'medium' },
    inventory: { items: {}, instances: [] },
    equipment: {},
    ...over
  } as unknown as Pawn;
}

const state = {} as unknown as GameState;

describe('equipped gear counts toward carry weight (not volume)', () => {
  it('adds equipped item weight to the load, leaving volume untouched', () => {
    const naked = makePawn();
    const base = itemService.getCurrentCarryLoad(naked, state);
    expect(base.weightKg).toBe(0);
    expect(base.volumeL).toBe(0);

    const armed = makePawn({
      equipment: {
        mainHand: { instanceId: 'a', itemId: 'stone_spear', durability: 100 },
        offHand: { instanceId: 'b', itemId: 'wattle_buckler', durability: 100 }
      } as Pawn['equipment']
    });
    const load = itemService.getCurrentCarryLoad(armed, state);
    expect(load.weightKg).toBeCloseTo(STONE_SPEAR_W + WATTLE_BUCKLER_W, 5);
    expect(load.volumeL).toBe(0); // worn gear is not pack volume
  });

  it('leaves less weight headroom for hauling when equipped', () => {
    const naked = makePawn();
    const armed = makePawn({
      equipment: {
        mainHand: { instanceId: 'a', itemId: 'stone_spear', durability: 100 }
      } as Pawn['equipment']
    });
    // Same item, but the armed pawn already spends STONE_SPEAR_W of its weight budget.
    const nakedCanTake = itemService.clampPickupQuantity(naked, 'granite', 999, state);
    const armedCanTake = itemService.clampPickupQuantity(armed, 'granite', 999, state);
    expect(armedCanTake).toBeLessThan(nakedCanTake);
  });

  it('still counts pack items for both weight and volume', () => {
    const packing = makePawn({
      inventory: { items: { granite: 1 }, instances: [] } as unknown as Pawn['inventory']
    });
    const load = itemService.getCurrentCarryLoad(packing, state);
    expect(load.weightKg).toBeGreaterThan(0);
    expect(load.volumeL).toBeGreaterThan(0); // pack contents DO use volume
  });
});
