import { describe, it, expect } from 'vitest';
import { depositInventory, REHAUL_COOLDOWN_TICKS } from '$lib/game/systems/pawn/pawnHauling';
import { generate as generateHaul } from '$lib/game/services/jobs/haul';
import type { GameState, Pawn, DroppedItem } from '$lib/game/core/types';

const makePawn = (x: number, y: number): Pawn =>
  ({
    id: 'p1',
    name: 'Hauler',
    position: { x, y },
    isAlive: true,
    stats: { strength: 10 },
    physicalTraits: { height: 170, weight: 70 },
    inventory: { items: { granite: 4 }, instances: [] },
    equipment: {}
  }) as unknown as Pawn;

const makeState = (pawn: Pawn, drops: DroppedItem[], turn = 100): GameState =>
  ({
    turn,
    pawns: [pawn],
    droppedItems: drops,
    zoneInstances: [],
    zoneTiles: { '5,5': ['stockpile'] }
  }) as unknown as GameState;

const looseDrops = (gs: GameState) => (gs.droppedItems ?? []).filter((d) => !d.stored);

describe('re-haul cooldown breaks the unreachable-stockpile floor-shuffle', () => {
  it('a load set down loose carries a future rehaulCooldownUntil stamp', () => {
    const pawn = makePawn(0, 0);
    const out = depositInventory(pawn, makeState(pawn, []));
    const loose = looseDrops(out);
    expect(loose.length).toBeGreaterThan(0);
    expect(loose.every((d) => d.rehaulCooldownUntil === 100 + REHAUL_COOLDOWN_TICKS)).toBe(true);
  });

  it('haul.generate does NOT re-target a cooling drop (no instant re-haul)', () => {
    const cooling: DroppedItem = {
      id: 'loose-granite-0-0',
      resourceId: 'granite',
      x: 0,
      y: 0,
      quantity: 4,
      stored: false,
      rehaulCooldownUntil: 600
    } as DroppedItem;
    const pawn = makePawn(0, 0);
    const jobs = generateHaul([], makeState(pawn, [cooling], 100));
    expect(jobs.some((j) => j.type === 'haul' && j.droppedItemId === 'loose-granite-0-0')).toBe(
      false
    );
  });

  it('haul.generate resumes hauling once the cooldown lapses', () => {
    const cooled: DroppedItem = {
      id: 'loose-granite-0-0',
      resourceId: 'granite',
      x: 0,
      y: 0,
      quantity: 4,
      stored: false,
      rehaulCooldownUntil: 600
    } as DroppedItem;
    const pawn = makePawn(0, 0);
    const jobs = generateHaul([], makeState(pawn, [cooled], 601));
    expect(jobs.some((j) => j.type === 'haul' && j.droppedItemId === 'loose-granite-0-0')).toBe(
      true
    );
  });
});
