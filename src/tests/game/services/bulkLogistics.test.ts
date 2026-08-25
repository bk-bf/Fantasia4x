import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import { pawnService } from '$lib/game/services/PawnService';
import { getEquipmentSlot } from '$lib/game/core/rules/gear/equipment';
import type { GameState, Pawn } from '$lib/game/core/types';

const state = {} as unknown as GameState;

function makePawn(over: Partial<Pawn> = {}): Pawn {
  return {
    id: 'p',
    name: 'P',
    stats: { strength: 10, dexterity: 10 },
    physicalTraits: { size: 'medium', weight: 70, height: 170 },
    inventory: { items: {}, instances: [] },
    equipment: {},
    ...over
  } as unknown as Pawn;
}

const HANDCART = {
  mainHand: { instanceId: 'c', itemId: 'handcart', durability: 300 }
} as Pawn['equipment'];

describe('§L carts are two-handed tools that expand carry capacity', () => {
  it('wheel + carts exist; carts are mainHand tools with an inventoryBonus and no weapon', () => {
    const wheel = itemService.getItemById('wheel');
    expect(wheel).toBeTruthy();

    for (const id of ['wheelbarrow', 'handcart']) {
      const cart = itemService.getItemById(id)!;
      expect(cart.type).toBe('tool');
      expect(getEquipmentSlot(cart)).toBe('mainHand');
      expect(cart.weaponProperties).toBeUndefined();
      expect(cart.inventoryBonus!.weightKg).toBeGreaterThan(0);
      expect(cart.inventoryBonus!.volumeL).toBeGreaterThan(0);
    }
    const wb = itemService.getItemById('wheelbarrow')!.inventoryBonus!;
    const hc = itemService.getItemById('handcart')!.inventoryBonus!;
    expect(hc.weightKg).toBeGreaterThan(wb.weightKg);
  });

  it('a held cart raises the carry budget (reusing the inventoryBonus channel, no bulk pool)', () => {
    const bare = itemService.getCarryBudget(makePawn(), state);
    const carting = itemService.getCarryBudget(makePawn({ equipment: HANDCART }), state);
    const hc = itemService.getItemById('handcart')!.inventoryBonus!;
    expect(carting.maxWeightKg).toBeCloseTo(bare.maxWeightKg + hc.weightKg, 1);
    expect(carting.maxVolumeL).toBeCloseTo(bare.maxVolumeL + hc.volumeL, 1);
  });

  it('lets a hauler pick up far more bulk goods than by hand', () => {
    const byHand = itemService.clampPickupQuantity(makePawn(), 'granite', 999, state);
    const withCart = itemService.clampPickupQuantity(
      makePawn({ equipment: HANDCART }),
      'granite',
      999,
      state
    );
    expect(withCart).toBeGreaterThan(byHand * 5);
  });
});

describe('§L overloading is not free — load drags move-speed', () => {
  it('a fully loaded cart-pusher moves slower than the same pawn with an empty cart', () => {
    const empty = makePawn({ equipment: HANDCART });
    const cap = itemService.clampPickupQuantity(empty, 'granite', 9999, state);
    const loaded = makePawn({
      equipment: HANDCART,
      inventory: { items: { granite: cap }, instances: [] } as unknown as Pawn['inventory']
    });

    const emptySpeed = pawnService.getMoveSpeed(empty).tilesPerSecond;
    const loadedSpeed = pawnService.getMoveSpeed(loaded).tilesPerSecond;
    expect(loadedSpeed).toBeLessThan(emptySpeed);
    expect(pawnService.getMoveSpeed(empty).sources.some((s) => s.startsWith('load'))).toBe(false);
    expect(pawnService.getMoveSpeed(loaded).sources.some((s) => s.startsWith('load'))).toBe(true);
  });

  it('an unladen pawn pays no encumbrance', () => {
    const speed = pawnService.getMoveSpeed(makePawn());
    expect(speed.sources.some((s) => s.startsWith('load'))).toBe(false);
  });
});
