import { describe, it, expect } from 'vitest';
import { depositInventory, REHAUL_COOLDOWN_TICKS } from '$lib/game/systems/pawn/pawnHauling';
import { generate as generateHaul } from '$lib/game/services/jobs/haul';
import type { GameState, Pawn, DroppedItem } from '$lib/game/core/types';

// REGRESSION: the floor-shuffle loop. When a hauling pawn cannot physically reach a stockpile it sets
// its load DOWN loose (dropLooseAtPawn). Before this guard, haul.generate re-targeted that loose pile
// the very next tick, the same unreachable pawn re-grabbed and re-dropped it — items "dragged" tile by
// tile across the floor forever, never reaching the stockpile (0 deposits, endless re-hauls).
// The fix: the set-down stack carries a rehaulCooldownUntil stamp; haul.generate skips it until it lapses.

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
    // A stockpile the pawn is NOWHERE near, so deposit must set the load down loose.
    zoneTiles: { '5,5': ['stockpile'] }
  }) as unknown as GameState;

const looseDrops = (gs: GameState) => (gs.droppedItems ?? []).filter((d) => !d.stored);

describe('re-haul cooldown breaks the unreachable-stockpile floor-shuffle', () => {
  it('a load set down loose carries a future rehaulCooldownUntil stamp', () => {
    const pawn = makePawn(0, 0); // far from the stockpile at (5,5)
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
    // turn 100 < cooldown 600 → still cooling → no haul job created for it.
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
    // turn 601 > cooldown 600 → eligible again → a haul job is created.
    const jobs = generateHaul([], makeState(pawn, [cooled], 601));
    expect(jobs.some((j) => j.type === 'haul' && j.droppedItemId === 'loose-granite-0-0')).toBe(
      true
    );
  });
});
