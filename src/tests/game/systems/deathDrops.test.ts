import { describe, it, expect } from 'vitest';
import { killPawn, reapDeadPawns } from '$lib/game/systems/PawnStateMachine';
import { itemService } from '$lib/game/services/ItemService';
import type { GameState, Pawn } from '$lib/game/core/types';

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
  return {
    turn: 100,
    pawns: [pawn],
    jobs: [],
    droppedItems: [],
    deadPawns: []
  } as unknown as GameState;
}

describe('R10 death drops', () => {
  it('drops carried items, equipped gear, and a corpse at the death tile; clears the pawn', () => {
    const pawn = makePawn();
    const out = killPawn(pawn, 'combat', makeState(pawn));
    const drops = out.droppedItems ?? [];
    const at = (id: string) => drops.find((d) => d.resourceId === id && d.x === 4 && d.y === 7);

    expect(at('wood')?.quantity).toBe(3);
    expect(at('stone_axe')?.instance?.instanceId).toBe('i-axe');
    expect(at('stone_spear')?.instance?.instanceId).toBe('i-spear');
    const corpse = at('pawn_carcass');
    expect(corpse).toBeDefined();
    expect(corpse!.name).toBe("Bjorn's Carcass");

    const dead = out.pawns.find((p) => p.id === 'p1')!;
    expect(dead.isAlive).toBe(false);
    expect(Object.keys(dead.equipment)).toHaveLength(0);
    expect(dead.inventory.items).toEqual({});
    expect(dead.inventory.instances).toEqual([]);
  });
});

describe('NT-2 reapDeadPawns', () => {
  it('finalises a combat death (corpse + gear) and reaps the pawn from pawns[]', () => {
    const pawn = makePawn();
    (pawn as unknown as { isAlive: boolean }).isAlive = false;
    const out = reapDeadPawns(makeState(pawn));

    const drops = out.droppedItems ?? [];
    expect(drops.find((d) => d.resourceId === 'pawn_carcass')?.name).toBe("Bjorn's Carcass");
    expect(drops.find((d) => d.resourceId === 'stone_spear')?.instance?.instanceId).toBe('i-spear');
    expect(out.deadPawns?.some((r) => r.name === 'Bjorn' && r.cause === 'combat')).toBe(true);
    expect(out.pawns.find((p) => p.id === 'p1')).toBeUndefined();
  });

  it('does not double-drop a corpse for a killPawn death it then reaps', () => {
    const pawn = makePawn();
    const killed = killPawn(pawn, 'infection', makeState(pawn));
    const out = reapDeadPawns(killed);

    const corpses = (out.droppedItems ?? []).filter((d) => d.resourceId === 'pawn_carcass');
    expect(corpses).toHaveLength(1);
    expect(out.pawns.find((p) => p.id === 'p1')).toBeUndefined();
  });

  it('is a no-op (same reference) when all pawns are alive', () => {
    const state = makeState(makePawn());
    expect(reapDeadPawns(state)).toBe(state);
  });
});

describe('R10 dynamic item name', () => {
  it('makeDynamicName builds "<subject>’s <name>" only for dynamicName items', () => {
    expect(itemService.makeDynamicName('pawn_carcass', 'Bjorn')).toBe("Bjorn's Carcass");
    expect(itemService.makeDynamicName('branch', 'Bjorn')).toBe(
      itemService.getItemById('branch')!.name
    );
  });

  it('getItemDisplayName honours the per-drop override for dynamicName items only', () => {
    expect(
      itemService.getItemDisplayName({ resourceId: 'pawn_carcass', name: "Bjorn's Carcass" })
    ).toBe("Bjorn's Carcass");
    expect(itemService.getItemDisplayName({ resourceId: 'pawn_carcass' })).toBe('Carcass');
    expect(itemService.getItemDisplayName({ resourceId: 'branch', name: 'Hacked' })).toBe(
      itemService.getItemById('branch')!.name
    );
  });
});
