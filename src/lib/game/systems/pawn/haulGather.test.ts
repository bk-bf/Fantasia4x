import { describe, it, expect } from 'vitest';
import { complete as completeHaul, stockpileAcceptsDrop } from '../../services/jobs/haul';
import { opportunisticHaulPickup, pickUpFromTile } from './pawnHauling';
import { itemService } from '../../services/ItemService';
import { ENC_OVERLOAD_FULL } from '../../core/needs';
import type { GameState, Pawn, DroppedItem, Job } from '../../core/types';

// A real-ish pawn so the carry budget (body mass × STR load fraction) computes. STR 10, 70 kg body
// → ~8.4 kg / ~9.1 L budget; the haul ceiling is ENC_OVERLOAD_FULL (1.4×) of that.
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

const drop = (id: string, resourceId: string, x: number, y: number, qty: number): DroppedItem =>
  ({ id, resourceId, x, y, quantity: qty }) as DroppedItem;

const makeState = (pawn: Pawn, drops: DroppedItem[], partial: Partial<GameState> = {}): GameState =>
  ({
    turn: 1,
    pawns: [pawn],
    droppedItems: drops,
    zoneInstances: [],
    zoneTiles: { '5,5': ['stockpile'] },
    ...partial
  }) as unknown as GameState;

const haulJob = (droppedItemId: string, d: DroppedItem): Job =>
  ({
    id: `haul-${droppedItemId}`,
    type: 'haul',
    targetX: d.x,
    targetY: d.y,
    resourceId: d.resourceId,
    droppedItemId,
    workRequired: 1,
    workDone: 1,
    claimedBy: 'p1'
  }) as Job;

describe('haul.complete — cross-resource + 3×3 sweep', () => {
  it('clears a mixed pile on the same tile in one trip (cross-resource)', () => {
    const pawn = makePawn(1, 1);
    const branch = drop('d_b', 'branch', 1, 1, 3); // 0.3 kg / 1.2 L each
    const fiber = drop('d_f', 'plant_fiber', 1, 1, 5); // 0.05 kg / 0.2 L each
    const gs = makeState(pawn, [branch, fiber]);

    const out = completeHaul(haulJob('d_b', branch), gs);
    const inv = out.pawns[0].inventory!.items;
    expect(inv.branch).toBe(3);
    expect(inv.plant_fiber).toBe(5);
    expect(out.droppedItems ?? []).toHaveLength(0);
  });

  it('sweeps loose drops on the 8 neighbouring tiles, not just the exact tile', () => {
    const pawn = makePawn(1, 1);
    const onTile = drop('d_b', 'branch', 1, 1, 2);
    const adjacent = drop('d_f', 'plant_fiber', 2, 1, 4); // Chebyshev 1
    const far = drop('d_far', 'plant_fiber', 4, 1, 4); // Chebyshev 3 — out of reach
    const gs = makeState(pawn, [onTile, adjacent, far]);

    const out = completeHaul(haulJob('d_b', onTile), gs);
    const inv = out.pawns[0].inventory!.items;
    expect(inv.branch).toBe(2);
    expect(inv.plant_fiber).toBe(4);
    // The far drop is untouched.
    expect((out.droppedItems ?? []).find((d) => d.id === 'd_far')?.quantity).toBe(4);
  });

  it('overfills past 1.0× capacity up to the encumbrance ceiling', () => {
    const pawn = makePawn(1, 1);
    const big = drop('d_b', 'branch', 1, 1, 100);
    const gs = makeState(pawn, [big]);

    const cap1 = itemService.clampPickupQuantity(pawn, 'branch', 100, gs, 1);
    const cap14 = itemService.clampPickupQuantity(pawn, 'branch', 100, gs, ENC_OVERLOAD_FULL);
    expect(cap14).toBeGreaterThan(cap1); // 1.4× lets the hauler carry more

    const out = completeHaul(haulJob('d_b', big), gs);
    expect(out.pawns[0].inventory!.items.branch).toBe(cap14);
  });

  it('does not sweep drops the stockpile filter rejects', () => {
    const pawn = makePawn(1, 1);
    const branch = drop('d_b', 'branch', 1, 1, 2); // primitive
    const fiber = drop('d_f', 'plant_fiber', 1, 1, 4); // primitive
    const gs = makeState(pawn, [branch, fiber], {
      zoneInstances: [
        { id: 'z1', type: 'stockpile', filter: { allowedCategories: ['wood'], blockedItems: [] } }
      ]
    } as unknown as Partial<GameState>);
    // The job's own drop is still taken (the player created the haul job), but the cross-resource
    // top-up only pulls stockpile-accepted resources — neither primitive item qualifies for a
    // wood-only stockpile, so the fiber is left on the ground.
    const out = completeHaul(haulJob('d_b', branch), gs);
    expect((out.droppedItems ?? []).find((d) => d.id === 'd_f')?.quantity).toBe(4);
  });
});

describe('stockpileAcceptsDrop', () => {
  it('accepts anything when no filter is set', () => {
    const gs = makeState(makePawn(0, 0), []);
    expect(stockpileAcceptsDrop(gs, 'branch')).toBe(true);
  });
  it('rejects a category outside an instance filter', () => {
    const gs = makeState(makePawn(0, 0), [], {
      zoneInstances: [
        { id: 'z1', type: 'stockpile', filter: { allowedCategories: ['wood'], blockedItems: [] } }
      ]
    } as unknown as Partial<GameState>);
    expect(stockpileAcceptsDrop(gs, 'branch')).toBe(false); // branch is 'primitive'
  });
});

describe('opportunisticHaulPickup', () => {
  it('picks up loose goods on/adjacent to the pawn when a stockpile exists', () => {
    const pawn = makePawn(2, 2);
    const here = drop('d1', 'branch', 2, 2, 2);
    const adj = drop('d2', 'plant_fiber', 3, 2, 3);
    const gs = makeState(pawn, [here, adj]);
    const out = opportunisticHaulPickup(gs, 'p1');
    expect(out.pawns[0].inventory!.items.branch).toBe(2);
    expect(out.pawns[0].inventory!.items.plant_fiber).toBe(3);
  });

  it('is a no-op when there is no stockpile to deliver to', () => {
    const pawn = makePawn(2, 2);
    const gs = makeState(pawn, [drop('d1', 'branch', 2, 2, 2)], { zoneTiles: {} });
    const out = opportunisticHaulPickup(gs, 'p1');
    expect(out).toBe(gs); // unchanged reference
  });

  it('leaves forbidden drops alone', () => {
    const pawn = makePawn(2, 2);
    const forbidden = { ...drop('d1', 'branch', 2, 2, 2), forbidden: true } as DroppedItem;
    const gs = makeState(pawn, [forbidden]);
    const out = opportunisticHaulPickup(gs, 'p1');
    expect(out.pawns[0].inventory?.items.branch ?? 0).toBe(0);
  });
});

describe('pickUpFromTile defaults (right-click pickup unchanged)', () => {
  it('still grabs forbidden drops and stays on the exact tile at 1.0× by default', () => {
    const pawn = makePawn(1, 1);
    const forbidden = { ...drop('d1', 'plant_fiber', 1, 1, 3), forbidden: true } as DroppedItem;
    const adjacent = drop('d2', 'plant_fiber', 2, 1, 3);
    const gs = makeState(pawn, [forbidden, adjacent]);
    const out = pickUpFromTile(gs, 'p1', 1, 1);
    // forbidden taken (no skipForbidden), adjacent ignored (radius 0).
    expect(out.pawns[0].inventory!.items.plant_fiber).toBe(3);
    expect((out.droppedItems ?? []).find((d) => d.id === 'd2')?.quantity).toBe(3);
  });
});
