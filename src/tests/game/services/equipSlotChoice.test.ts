import { describe, it, expect } from 'vitest';
import {
  equipDropToPawn,
  carryDropToInventory,
  canEquipItem
} from '$lib/game/core/rules/gear/equipment';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { jobService } from '$lib/game/services/JobService';
import type { GameState, Pawn } from '$lib/game/core/types';

const pawnWith = (over: Partial<Pawn> = {}): Pawn =>
  ({
    id: 'p1',
    position: { x: 0, y: 0 },
    equipment: {},
    inventory: { items: {}, instances: [] },
    ...over
  }) as unknown as Pawn;

function stateWithDrop(): GameState {
  return {
    pawns: [pawnWith()],
    droppedItems: [{ id: 'd1', resourceId: 'flint_knife', x: 0, y: 0, quantity: 1, stored: false }],
    stockpile: {}
  } as unknown as GameState;
}

describe('equip slot choice + carried-tool boost', () => {
  it('equips into the explicitly requested off-hand slot', () => {
    const out = equipDropToPawn(stateWithDrop(), 'p1', 'd1', 'offHand');
    expect(out.pawns[0].equipment.offHand?.itemId).toBe('flint_knife');
    expect(out.pawns[0].equipment.mainHand).toBeUndefined();
  });

  it('auto-resolves to the main hand when no slot is given', () => {
    const out = equipDropToPawn(stateWithDrop(), 'p1', 'd1');
    expect(out.pawns[0].equipment.mainHand?.itemId).toBe('flint_knife');
  });

  it('consumes the picked-up drop entirely (quantity 1 leaves nothing behind)', () => {
    const out = equipDropToPawn(stateWithDrop(), 'p1', 'd1');
    expect(out.droppedItems?.some((d) => d.id === 'd1')).toBe(false);
  });

  it('equipping into an occupied slot returns the previously-worn item to the ground', () => {
    const state = stateWithDrop();
    const occupied: GameState = {
      ...state,
      pawns: [
        {
          ...state.pawns[0],
          equipment: { mainHand: { instanceId: 'old-1', itemId: 'bone_knife', durability: 50 } }
        }
      ]
    } as unknown as GameState;
    const out = equipDropToPawn(occupied, 'p1', 'd1');
    expect(out.pawns[0].equipment.mainHand?.itemId).toBe('flint_knife');
    const returned = out.droppedItems?.find((d) => d.resourceId === 'bone_knife');
    expect(returned).toBeDefined();
    expect(returned?.instance?.instanceId).toBe('old-1');
  });

  it('refuses to equip into a slot a trait blocks (rending-claws blocks gloves)', () => {
    const state: GameState = {
      pawns: [pawnWith({ traits: [{ id: 'rending-claws', blocksSlots: ['gloves'] }] } as never)],
      droppedItems: [{ id: 'd2', resourceId: 'iron_gauntlets', x: 0, y: 0, quantity: 1, stored: false }],
      stockpile: {}
    } as unknown as GameState;
    const out = equipDropToPawn(state, 'p1', 'd2');
    expect(out).toBe(state);
    expect(out.pawns[0].equipment.gloves).toBeUndefined();
  });

  it('heldToolFor reports a CARRIED tool and its additive boost', () => {
    const pawn = pawnWith({
      inventory: {
        items: {},
        instances: [{ instanceId: 'i', itemId: 'flint_knife', durability: 30 }]
      } as never
    });
    const t = pawnStatService.heldToolFor(pawn, 'leatherworking');
    expect(t?.itemId).toBe('flint_knife');
    expect(t?.speed).toBeGreaterThan(0);
  });

  it('heldToolFor is null for a category the held tool does not serve', () => {
    const pawn = pawnWith({
      inventory: {
        items: {},
        instances: [{ instanceId: 'i', itemId: 'flint_knife', durability: 30 }]
      } as never
    });
    expect(pawnStatService.heldToolFor(pawn, 'mining')).toBeNull();
  });

  it('carryDropToInventory stores the tool as a tracked INSTANCE (not the bulk count map)', () => {
    const out = carryDropToInventory(stateWithDrop(), 'p1', 'd1');
    const inv = out.pawns[0].inventory;
    expect(inv.instances.map((i) => i.itemId)).toContain('flint_knife');
    expect(inv.items.flint_knife ?? 0).toBe(0);
    expect(out.droppedItems).toHaveLength(0);
  });

  it('a multi-unit pile decrements by one and stamps the new instance with matDur', () => {
    const state: GameState = {
      pawns: [pawnWith()],
      droppedItems: [
        { id: 'd3', resourceId: 'flint_knife', x: 0, y: 0, quantity: 3, stored: false, matDur: 0.5 }
      ],
      stockpile: {}
    } as unknown as GameState;
    const out = carryDropToInventory(state, 'p1', 'd3');
    const remaining = out.droppedItems?.find((d) => d.id === 'd3');
    expect(remaining?.quantity).toBe(2);
    const inst = out.pawns[0].inventory.instances.find((i) => i.itemId === 'flint_knife');
    expect(inst?.durability).toBe(15);
  });

  it('canEquipItem is false for an unknown item id and for a non-equippable item (food)', () => {
    const pawn = pawnWith();
    expect(canEquipItem(pawn, 'not_a_real_item')).toBe(false);
    expect(canEquipItem(pawn, 'spit_meat')).toBe(false);
  });

  it('a tool in the bulk items count map is still recognised by the boost AND the gate', () => {
    const pawn = pawnWith({
      inventory: { items: { flint_knife: 1 }, instances: [] } as never
    });
    expect(pawnStatService.heldToolFor(pawn, 'leatherworking')?.itemId).toBe('flint_knife');
    expect(jobService.pawnHasToolFor(pawn, 'leatherworking', 0)).toBe(true);
  });
});
