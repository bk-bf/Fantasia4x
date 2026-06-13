import { describe, it, expect } from 'vitest';
import { killPawn } from './PawnStateMachine';
import { itemService } from '../services/ItemService';
import type { GameState, Pawn } from '../core/types';

// R10 — a slain pawn drops its carried goods, equipped gear, and a (dynamic-named) corpse on the
// death tile so permadeath doesn't delete the colony's economy.
function makePawn(): Pawn {
  return {
    id: 'p1',
    name: 'Bjorn',
    position: { x: 4, y: 7 },
    isAlive: true,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    state: { mood: 50 },
    inventory: {
      items: { wood: 3 },
      instances: [{ instanceId: 'i-axe', itemId: 'stone_axe', durability: 30 }]
    },
    equipment: { mainHand: { instanceId: 'i-spear', itemId: 'stone_spear', durability: 40 } }
  } as unknown as Pawn;
}

function makeState(pawn: Pawn): GameState {
  return { turn: 100, pawns: [pawn], jobs: [], droppedItems: [], deadPawns: [] } as unknown as GameState;
}

describe('R10 death drops', () => {
  it('drops carried items, equipped gear, and a corpse at the death tile; clears the pawn', () => {
    const pawn = makePawn();
    const out = killPawn(pawn, 'combat', makeState(pawn));
    const drops = out.droppedItems ?? [];
    const at = (id: string) => drops.find((d) => d.resourceId === id && d.x === 4 && d.y === 7);

    expect(at('wood')?.quantity).toBe(3); // bulk inventory
    expect(at('stone_axe')?.instance?.instanceId).toBe('i-axe'); // tracked inventory instance
    expect(at('stone_spear')?.instance?.instanceId).toBe('i-spear'); // equipped gear
    const corpse = at('pawn_carcass');
    expect(corpse).toBeDefined();
    expect(corpse!.name).toBe("Bjorn's Corpse"); // dynamic per-instance name

    // The corpse-pawn no longer carries the gear (it's on the ground now).
    const dead = out.pawns.find((p) => p.id === 'p1')!;
    expect(dead.isAlive).toBe(false);
    expect(Object.keys(dead.equipment)).toHaveLength(0);
    expect(dead.inventory.items).toEqual({});
    expect(dead.inventory.instances).toEqual([]);
  });
});

describe('R10 dynamic item name', () => {
  it('makeDynamicName builds "<subject>’s <name>" only for dynamicName items', () => {
    expect(itemService.makeDynamicName('pawn_carcass', 'Bjorn')).toBe("Bjorn's Corpse");
    // A normal item ignores the subject.
    expect(itemService.makeDynamicName('branch', 'Bjorn')).toBe(
      itemService.getItemById('branch')!.name
    );
  });

  it('getItemDisplayName honours the per-drop override for dynamicName items only', () => {
    expect(
      itemService.getItemDisplayName({ resourceId: 'pawn_carcass', name: "Bjorn's Corpse" })
    ).toBe("Bjorn's Corpse");
    expect(itemService.getItemDisplayName({ resourceId: 'pawn_carcass' })).toBe('Corpse'); // no override
    // Non-dynamic item ignores any stray override.
    expect(itemService.getItemDisplayName({ resourceId: 'branch', name: 'Hacked' })).toBe(
      itemService.getItemById('branch')!.name
    );
  });
});
