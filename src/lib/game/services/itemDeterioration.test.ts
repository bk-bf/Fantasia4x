import { describe, it, expect } from 'vitest';
import { itemService } from './ItemService';
import type { GameState, DroppedItem } from '../core/types';

/**
 * §B (PRODUCTION-CHAIN-EXPANSION) durable-goods deterioration — count-down model.
 * A loose stack (`stored !== true`) loses `deteriorationRate` durability per tick from its
 * `maxDurability` pool (default 100); destroyed at 0. Stored items take no exposure damage.
 * `pine_log` carries deteriorationRate 0.05 and an explicit maxDurability in the item DB.
 */
const PINE = itemService.getItemById('pine_log')!;
const RATE = PINE.deteriorationRate!; // 0.05
const MAXD = PINE.maxDurability ?? 100;

function makeState(dropped: DroppedItem[]): GameState {
  return { seed: 1, turn: 0, stockpile: {}, droppedItems: dropped } as unknown as GameState;
}
const drop = (p: Partial<DroppedItem>): DroppedItem =>
  ({ id: 'd1', resourceId: 'pine_log', x: 0, y: 0, quantity: 3, ...p }) as DroppedItem;

describe('ItemService.stepItemDeterioration (§B, count-down durability)', () => {
  it('draws durability down from maxDurability on a loose item', () => {
    const out = itemService.stepItemDeterioration(makeState([drop({})]));
    expect(out.droppedItems![0].durability).toBeCloseTo(MAXD - RATE);
  });

  it('does NOT wear a stored (sheltered) item — storage halts deterioration', () => {
    const gs = makeState([drop({ stored: true })]);
    expect(itemService.stepItemDeterioration(gs)).toBe(gs);
  });

  it('weathers EVERY item — e.g. granite, from its own durability pool', () => {
    const g = itemService.getItemById('granite')!;
    const out = itemService.stepItemDeterioration(makeState([drop({ resourceId: 'granite' })]));
    expect(out.droppedItems![0].durability).toBeCloseTo((g.maxDurability ?? 100) - g.deteriorationRate!);
  });

  it('destroys the stack once durability reaches 0', () => {
    let gs = makeState([drop({ durability: RATE / 2 })]);
    gs = itemService.stepItemDeterioration(gs);
    expect(gs.droppedItems!.length).toBe(0);
  });

  it('destroys a fresh loose stack after ~maxDurability/rate ticks', () => {
    let gs = makeState([drop({})]);
    let steps = 0;
    const expected = Math.ceil(MAXD / RATE);
    while ((gs.droppedItems?.length ?? 0) > 0 && steps < expected + 50) {
      gs = itemService.stepItemDeterioration(gs);
      steps++;
    }
    expect(steps).toBeGreaterThanOrEqual(expected - 1);
    expect(steps).toBeLessThanOrEqual(expected + 1);
  });
});
