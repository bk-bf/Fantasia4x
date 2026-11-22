import { describe, it, expect } from 'vitest';
import {
  complete as completeHaul,
  generate as generateHaulJobs,
  stockpileAcceptsDrop,
  storageTileAcceptsDrop
} from '$lib/game/services/jobs/haul';
import { itemService } from '$lib/game/services/ItemService';
import { ENC_OVERLOAD_FULL } from '$lib/game/core/rules/body/conditions';
import type { DroppedItem, GameState, Job, Pawn } from '$lib/game/core/types';

const loose = (id: string, over: Partial<DroppedItem> = {}): DroppedItem => ({
  id,
  resourceId: 'granite',
  x: 1,
  y: 1,
  quantity: 2,
  ...over
});

const hauler = (): Pawn =>
  ({
    id: 'p',
    name: 'Cal Hauler',
    position: { x: 1, y: 1 },
    stats: { strength: 10 },
    physicalTraits: { height: 170, weight: 70 },
    inventory: {
      items: {},
      instances: [],
      weightKg: 0,
      maxWeightKg: 20,
      volumeL: 0,
      maxVolumeL: 20
    }
  }) as unknown as Pawn;

const haulJob = (dropId: string, claimedBy: string | null = 'p'): Job => ({
  id: `haul-${dropId}`,
  type: 'haul',
  targetX: 1,
  targetY: 1,
  droppedItemId: dropId,
  workRequired: 0.02,
  workDone: 0,
  claimedBy
});

const state = (drops: DroppedItem[], over: Partial<GameState> = {}): GameState =>
  ({
    turn: 10,
    pawns: [hauler()],
    droppedItems: drops,
    buildings: [],
    zoneTiles: { '5,5': ['stockpile'] },
    zoneInstances: [],
    ...over
  }) as unknown as GameState;

const carried = (gs: GameState) => gs.pawns.find((p) => p.id === 'p')!.inventory!.items;
const dropById = (gs: GameState, id: string) => gs.droppedItems!.find((d) => d.id === id);

describe('haul pickup', () => {
  it('leaves on the tile whatever the pawn could not carry', () => {
    const gs = state([loose('big', { quantity: 40 })]);
    const taken = itemService.clampPickupQuantity(hauler(), 'granite', 40, gs, ENC_OVERLOAD_FULL);
    expect(taken).toBeLessThan(40);
    const out = completeHaul(haulJob('big'), gs);
    expect(carried(out).granite).toBe(taken);
    expect(dropById(out, 'big')!.quantity).toBe(40 - taken);
  });

  it('gathers an adjacent loose stack but not a forbidden one', () => {
    const gs = state([
      loose('main'),
      loose('open', { resourceId: 'branch', x: 1, y: 2, quantity: 3 }),
      loose('locked', { resourceId: 'wheat', x: 2, y: 1, quantity: 3, forbidden: true })
    ]);
    const out = completeHaul(haulJob('main'), gs);
    expect(carried(out)).toEqual({ granite: 2, branch: 3 });
    expect(dropById(out, 'locked')!.quantity).toBe(3);
  });

  it('does not gather a stack two tiles away', () => {
    const gs = state([
      loose('main'),
      loose('far', { resourceId: 'branch', x: 3, y: 1, quantity: 3 })
    ]);
    const out = completeHaul(haulJob('main'), gs);
    expect(carried(out)).toEqual({ granite: 2 });
    expect(dropById(out, 'far')!.quantity).toBe(3);
  });
});

describe('haul job generation', () => {
  const jobDrops = (jobs: Job[]) => jobs.map((j) => j.droppedItemId);

  it('waits out a rehaul cooldown before hauling a stack again', () => {
    const gs = state([loose('d1', { rehaulCooldownUntil: 13 })]);
    expect(generateHaulJobs([], gs)).toEqual([]);
    expect(jobDrops(generateHaulJobs([], { ...gs, turn: 13 }))).toEqual(['d1']);
  });

  it('opens no new haul once the jobs in flight fill every free pile slot', () => {
    const gs = state([loose('d1'), loose('d2')]);
    expect(jobDrops(generateHaulJobs([haulJob('d1', null)], gs))).toEqual(['d1']);
  });

  it('counts a stored pile as filling its tile', () => {
    const gs = state([
      loose('pile', { x: 5, y: 5, stored: true }),
      loose('d1', { resourceId: 'branch' }),
      loose('d2', { resourceId: 'wheat' })
    ]);
    expect(jobDrops(generateHaulJobs([haulJob('d1', null)], gs))).toEqual(['d1']);
  });

  it('a stockpile with no categories chosen accepts anything', () => {
    const gs = state([], {
      zoneInstances: [
        {
          id: 'z1',
          type: 'stockpile',
          label: 'Store',
          filter: { allowedCategories: [], blockedItems: [] }
        }
      ]
    } as Partial<GameState>);
    expect(stockpileAcceptsDrop(gs, 'granite')).toBe(true);
  });

  it('refuses another vessel once a zone holds its container budget', () => {
    const bucket = loose('b1', {
      resourceId: 'wooden_bucket',
      x: 5,
      y: 5,
      quantity: 1,
      stored: true,
      instance: { instanceId: 'b1', itemId: 'wooden_bucket', durability: 100 }
    });
    const zone = (containerBudget: number) =>
      state([bucket], {
        designationZoneId: { '5,5': { stockpile: 'z1' } },
        zoneInstances: [
          {
            id: 'z1',
            type: 'stockpile',
            label: 'Store',
            containerBudget,
            filter: { allowedCategories: [], blockedItems: [] }
          }
        ]
      } as Partial<GameState>);
    expect(storageTileAcceptsDrop(zone(1), 5, 5, 'wooden_bucket')).toBe(false);
    expect(storageTileAcceptsDrop(zone(2), 5, 5, 'wooden_bucket')).toBe(true);
  });
});
