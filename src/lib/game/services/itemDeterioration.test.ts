import { describe, it, expect } from 'vitest';
import { itemService } from './ItemService';
import type { GameState, DroppedItem } from '../core/types';

/**
 * §B (PRODUCTION-CHAIN-EXPANSION) durable-goods deterioration.
 * Loose items on the ground (`stored !== true`) wear at their def's `deteriorationRate`
 * and are removed at 100. Stored/stockpiled items take no exposure damage (storage halts it).
 * `wood_log` carries deteriorationRate 0.05 in the item DB.
 */
function makeState(dropped: DroppedItem[]): GameState {
  return {
    seed: 1,
    turn: 0,
    stockpile: {},
    droppedItems: dropped
  } as unknown as GameState;
}

const drop = (p: Partial<DroppedItem>): DroppedItem =>
  ({ id: 'd1', resourceId: 'wood_log', x: 0, y: 0, quantity: 3, ...p }) as DroppedItem;

describe('ItemService.stepItemDeterioration (§B)', () => {
  it('accrues wear on a loose item with a deteriorationRate', () => {
    const out = itemService.stepItemDeterioration(makeState([drop({})]));
    expect(out.droppedItems![0].deterioration).toBeCloseTo(0.05);
  });

  it('does NOT wear a stored (sheltered) item — storage halts deterioration', () => {
    const gs = makeState([drop({ stored: true })]);
    // unchanged state reference is returned when nothing wears
    expect(itemService.stepItemDeterioration(gs)).toBe(gs);
  });

  it('does NOT wear an item whose def has no deteriorationRate (e.g. granite)', () => {
    const gs = makeState([drop({ resourceId: 'granite' })]);
    expect(itemService.stepItemDeterioration(gs)).toBe(gs);
  });

  it('removes the stack once wear reaches 100 (ruined)', () => {
    let gs = makeState([drop({ deterioration: 99.99 })]);
    gs = itemService.stepItemDeterioration(gs);
    expect(gs.droppedItems!.length).toBe(0);
  });

  it('ruins a fresh loose stack within the expected number of ticks', () => {
    let gs = makeState([drop({})]);
    let steps = 0;
    while ((gs.droppedItems?.length ?? 0) > 0 && steps < 10000) {
      gs = itemService.stepItemDeterioration(gs);
      steps++;
    }
    // 100 / 0.05 = 2000 ticks (±1 for fp accumulation of repeated +0.05)
    expect(steps).toBeGreaterThanOrEqual(2000);
    expect(steps).toBeLessThanOrEqual(2001);
  });
});
