import { describe, it, expect } from 'vitest';
import { complete as completeHaul } from '../../services/jobs/haul';
import { pickUpFromTile, depositInventory } from './pawnHauling';
import type { GameState, Pawn, DroppedItem, Job } from '../../core/types';

// Trace a LOG through the full physical haul cycle and assert mass is conserved at every step.
// "what happens to a log when a pawn picks one up" — if a log ever vanishes, exactly one of these
// asserts fails and pinpoints the step.

const makePawn = (x: number, y: number): Pawn =>
  ({
    id: 'p1',
    name: 'Hauler',
    position: { x, y },
    isAlive: true,
    stats: { strength: 10 },
    physicalTraits: { height: 170, weight: 70 },
    inventory: { items: {}, instances: [] },
    equipment: {}
  }) as unknown as Pawn;

const makeState = (pawn: Pawn, drops: DroppedItem[], partial: Partial<GameState> = {}): GameState =>
  ({
    turn: 1,
    pawns: [pawn],
    droppedItems: drops,
    zoneInstances: [],
    // A 2-tile stockpile NOT under the pawn, so deposit must physically place the log there.
    zoneTiles: { '5,5': ['stockpile'], '6,5': ['stockpile'] },
    ...partial
  }) as unknown as GameState;

const logDrop = (id: string, qty: number, x = 1, y = 1): DroppedItem =>
  ({ id, resourceId: 'yew_log', x, y, quantity: qty }) as DroppedItem;

const carriedLogs = (gs: GameState) => gs.pawns[0].inventory?.items?.yew_log ?? 0;
const storedLogs = (gs: GameState) =>
  (gs.droppedItems ?? [])
    .filter((d) => d.resourceId === 'yew_log' && d.stored)
    .reduce((s, d) => s + d.quantity, 0);
const looseLogs = (gs: GameState) =>
  (gs.droppedItems ?? [])
    .filter((d) => d.resourceId === 'yew_log' && !d.stored)
    .reduce((s, d) => s + d.quantity, 0);

describe('log pickup puts the log in the pawn inventory (not the void)', () => {
  it('pickUpFromTile: ground log → carry inventory', () => {
    const pawn = makePawn(1, 1);
    const gs = makeState(pawn, [logDrop('d1', 2)]);
    const out = pickUpFromTile(gs, 'p1', 1, 1, { looseOnly: true });
    // Everything that left the ground must be on the pawn.
    expect(carriedLogs(out) + looseLogs(out)).toBe(2);
    expect(carriedLogs(out)).toBeGreaterThan(0);
  });

  it('haul.complete: ground log → carry inventory', () => {
    const pawn = makePawn(1, 1);
    const d = logDrop('d1', 2);
    const job = {
      id: 'haul-d1',
      type: 'haul',
      targetX: 1,
      targetY: 1,
      resourceId: 'yew_log',
      droppedItemId: 'd1',
      workRequired: 1,
      workDone: 1,
      claimedBy: 'p1'
    } as Job;
    const out = completeHaul(job, makeState(pawn, [d]));
    expect(carriedLogs(out) + looseLogs(out)).toBe(2);
    expect(carriedLogs(out)).toBeGreaterThan(0);
  });
});

describe('depositInventory lays a carried log into the stockpile (the step with no prior coverage)', () => {
  it('carried log → stored stockpile drop, removed from carry', () => {
    const pawn = makePawn(5, 5);
    pawn.inventory = { items: { yew_log: 3 }, instances: [] } as Pawn['inventory'];
    const gs = makeState(pawn, []);
    const out = depositInventory(pawn, gs);
    expect(storedLogs(out)).toBe(3); // landed physically in the stockpile
    expect(carriedLogs(out)).toBe(0); // no longer carried
  });

  it('FULL CYCLE: ground → carry → deposit conserves every log', () => {
    const pawn = makePawn(5, 5); // adjacent to the stockpile tiles
    const gs = makeState(pawn, [logDrop('d1', 3, 5, 6)]); // 3 logs on the ground next to the pile
    const picked = pickUpFromTile(gs, 'p1', 5, 6, { looseOnly: true });
    const carried = carriedLogs(picked);
    expect(carried).toBeGreaterThan(0);

    const deposited = depositInventory(picked.pawns[0], picked);
    // Total logs in the world (loose + carried + stored) is unchanged: started at 3, still 3.
    expect(looseLogs(deposited) + carriedLogs(deposited) + storedLogs(deposited)).toBe(3);
  });
});
