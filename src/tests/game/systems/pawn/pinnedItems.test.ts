import { describe, it, expect } from 'vitest';
import { depositInventory } from '$lib/game/systems/pawn/pawnHauling';
import { COMMANDS } from '$lib/game/sim/commands';
import type { GameState, Pawn } from '$lib/game/core/types';

// Pinned-item feature: a pawn never deposits a pinned carried item (it keeps it in hand); everything
// else is deposited normally. The togglePin command flips the per-pawn pinnedItems set.

function makeWorld(w: number, h: number): GameState['worldMap'] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({ x, y, walkable: true }))
  ) as unknown as GameState['worldMap'];
}

function makeState(pawn: Pawn): GameState {
  return {
    turn: 0,
    pawns: [pawn],
    mobs: [],
    buildings: [],
    designations: {},
    droppedItems: [],
    worldMap: makeWorld(10, 10),
    zoneTiles: { '1,0': ['stockpile'], '2,0': ['stockpile'] }
  } as unknown as GameState;
}

const hauler = (items: Record<string, number>, pinnedItems: string[] = []): Pawn =>
  ({
    id: 'h',
    name: 'H',
    position: { x: 0, y: 0 },
    isAlive: true,
    pinnedItems,
    inventory: { items, instances: [], weightKg: 0, maxWeightKg: 20, volumeL: 0, maxVolumeL: 20 }
  }) as unknown as Pawn;

describe('pinned carried items are never deposited', () => {
  it('deposits non-pinned items but keeps the pinned one in hand', () => {
    const pawn = hauler({ wood: 5, stone_axe: 1 }, ['stone_axe']);
    const out = depositInventory(pawn, makeState(pawn));
    const kept = out.pawns[0].inventory.items;
    expect(kept.stone_axe).toBe(1); // pinned — kept
    expect(kept.wood ?? 0).toBe(0); // non-pinned — deposited
  });

  it('with no pins, everything is deposited (inventory emptied)', () => {
    const pawn = hauler({ wood: 5, stone_axe: 1 }, []);
    const out = depositInventory(pawn, makeState(pawn));
    expect(Object.values(out.pawns[0].inventory.items).every((q) => q === 0)).toBe(true);
  });

  it('dropCarriedItem puts the whole stack on the pawn tile, empties it, and clears the pin', () => {
    const s = makeState(hauler({ wood: 5 }, ['wood'])); // pawn at (0,0); stockpile tiles are 1,0/2,0
    const out = COMMANDS.dropCarriedItem(s, { pawnId: 'h', itemId: 'wood' });
    expect(out.pawns[0].inventory.items.wood ?? 0).toBe(0);
    expect(out.pawns[0].pinnedItems).not.toContain('wood');
    const drop = (out.droppedItems ?? []).find((d) => d.resourceId === 'wood');
    expect(drop).toMatchObject({ quantity: 5, x: 0, y: 0 });
  });

  it('dropCarriedItem drops a tracked tool instance, preserving durability and removing it', () => {
    const pawn = hauler({}, []);
    pawn.inventory.instances = [{ instanceId: 'axe-1', itemId: 'stone_axe', durability: 42 }];
    const out = COMMANDS.dropCarriedItem(makeState(pawn), {
      pawnId: 'h',
      itemId: 'stone_axe',
      instanceId: 'axe-1'
    });
    expect(out.pawns[0].inventory.instances).toHaveLength(0);
    const drop = (out.droppedItems ?? []).find((d) => d.resourceId === 'stone_axe');
    expect(drop).toMatchObject({ quantity: 1, x: 0, y: 0, durability: 42 });
    expect(drop?.instance).toMatchObject({ instanceId: 'axe-1', durability: 42 });
  });

  it('togglePinItem flips the pin on and off for the right pawn', () => {
    const s = makeState(hauler({}, []));
    const on = COMMANDS.togglePinItem(s, { pawnId: 'h', itemId: 'stone_axe' });
    expect(on.pawns[0].pinnedItems).toContain('stone_axe');
    const off = COMMANDS.togglePinItem(on, { pawnId: 'h', itemId: 'stone_axe' });
    expect(off.pawns[0].pinnedItems).not.toContain('stone_axe');
  });
});
