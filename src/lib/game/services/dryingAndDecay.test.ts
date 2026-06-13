import { describe, it, expect } from 'vitest';
import { itemService } from './ItemService';
import { SECONDS_PER_TICK } from '../core/time';
import type { GameState, DroppedItem, PlacedBuilding } from '../core/types';

/**
 * Stage 4 — §1 wood seasoning + §C spoilage.
 * Drying: green_firewood at Chebyshev distance EXACTLY 2 from a lit fire seasons into
 * dry_firewood; adjacent (1) or far (3+) stacks don't. Decay: every perishable stack accrues a
 * spoilage clock at full speed and rots into its decaysTo (preservation via cold is owned by the
 * temperature system, not storage buildings).
 */
const fire = (x: number, y: number): PlacedBuilding =>
  ({
    id: `f${x}`,
    type: 'hearth',
    x,
    y,
    status: 'complete',
    progress: 1,
    lit: true,
    fuel: 10
  }) as PlacedBuilding;

const drop = (p: Partial<DroppedItem>): DroppedItem =>
  ({
    id: `d-${p.x}-${p.y}-${p.resourceId}`,
    resourceId: 'green_firewood',
    x: 0,
    y: 0,
    quantity: 2,
    ...p
  }) as DroppedItem;

function state(drops: DroppedItem[], buildings: PlacedBuilding[]): GameState {
  return {
    seed: 1,
    turn: 0,
    stockpile: {},
    stockpileZones: [],
    droppedItems: drops,
    buildings
  } as unknown as GameState;
}

describe('§1 wood seasoning (stepWoodDrying)', () => {
  it('seasons firewood at distance 2 from a lit fire, not adjacent or far', () => {
    const gs = state(
      [
        drop({ x: 2, y: 0, id: 'ring' }),
        drop({ x: 1, y: 0, id: 'adj' }),
        drop({ x: 5, y: 0, id: 'far' })
      ],
      [fire(0, 0)]
    );
    const out = itemService.stepWoodDrying(gs);
    expect(out.droppedItems!.find((d) => d.id === 'ring')!.drying).toBeGreaterThan(0);
    expect(out.droppedItems!.find((d) => d.id === 'adj')!.drying).toBeUndefined();
    expect(out.droppedItems!.find((d) => d.id === 'far')!.drying).toBeUndefined();
  });

  it('converts to dry_firewood once seasoned', () => {
    const gs = state([drop({ x: 2, y: 0, drying: 1799.999 })], [fire(0, 0)]);
    const out = itemService.stepWoodDrying(gs);
    expect(out.droppedItems![0].resourceId).toBe('dry_firewood');
  });

  it('no lit fire → nothing seasons', () => {
    const unlit = { ...fire(0, 0), lit: false };
    const gs = state([drop({ x: 2, y: 0 })], [unlit as PlacedBuilding]);
    expect(itemService.stepWoodDrying(gs)).toBe(gs);
  });
});

describe('§C spoilage (stepItemDecay)', () => {
  const meat = (p: Partial<DroppedItem>): DroppedItem =>
    drop({ resourceId: 'venison', quantity: 3, ...p });

  it('loose and bare-stored meat spoil at full speed; no container = no bonus', () => {
    const gs = state(
      [meat({ id: 'loose', x: 5, y: 5 }), meat({ id: 'stored', x: 0, y: 0, stored: true })],
      []
    );
    const out = itemService.stepItemDecay(gs);
    const loose = out.droppedItems!.find((d) => d.id === 'loose')!;
    const stored = out.droppedItems!.find((d) => d.id === 'stored')!;
    expect(loose.decayAcc).toBeCloseTo(SECONDS_PER_TICK);
    expect(stored.decayAcc).toBeCloseTo(SECONDS_PER_TICK);
  });

  it('a container stored on the tile slows stored food (clay urn −20%; best wins)', () => {
    const container = (id: string, resourceId: string): DroppedItem =>
      drop({ id, resourceId, x: 0, y: 0, quantity: 1, stored: true });
    const gs = state(
      [
        meat({ id: 'food', x: 0, y: 0, stored: true }),
        container('basket', 'woven_basket'),
        container('urn', 'water_urn')
      ],
      []
    );
    const out = itemService.stepItemDecay(gs);
    const food = out.droppedItems!.find((d) => d.id === 'food')!;
    expect(food.decayAcc).toBeCloseTo(SECONDS_PER_TICK * 0.8);
  });

  it('a unit rots into decaysTo when the clock fills', () => {
    const gs = state([meat({ id: 'loose', x: 5, y: 5, decayAcc: 599.999 })], []);
    const out = itemService.stepItemDecay(gs);
    const meatStack = out.droppedItems!.find((d) => d.resourceId === 'venison')!;
    const rot = out.droppedItems!.find((d) => d.resourceId === 'rotten_meat');
    expect(meatStack.quantity).toBe(2);
    expect(rot?.quantity).toBe(1);
  });
});
