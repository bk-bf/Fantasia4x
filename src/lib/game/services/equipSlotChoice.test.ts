import { describe, it, expect } from 'vitest';
import { equipDropToPawn, carryDropToInventory } from '../core/PawnEquipment';
import { pawnStatService } from './PawnStatService';
import { jobService } from './JobService';
import type { GameState, Pawn } from '../core/types';

/**
 * Equip-system fixes: (1) an explicit target slot lets the player put gear in the OFF hand (not just
 * the auto-resolved main hand); (2) a tool CARRIED in inventory still grants its work boost, and
 * `heldToolFor` itemises which tool + how much (drives the work-tab tooltip line).
 */
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
    droppedItems: [
      { id: 'd1', resourceId: 'flint_knife', x: 0, y: 0, quantity: 1, stored: false }
    ],
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
    expect(inv.items.flint_knife ?? 0).toBe(0); // not in the bulk count map
    expect(out.droppedItems).toHaveLength(0); // drop consumed
  });

  it('a tool in the bulk items count map is still recognised by the boost AND the gate', () => {
    const pawn = pawnWith({
      inventory: { items: { flint_knife: 1 }, instances: [] } as never
    });
    expect(pawnStatService.heldToolFor(pawn, 'leatherworking')?.itemId).toBe('flint_knife');
    expect(jobService.pawnHasToolFor(pawn, 'leatherworking', 0)).toBe(true);
  });
});
