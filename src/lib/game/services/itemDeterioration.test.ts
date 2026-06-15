import { describe, it, expect } from 'vitest';
import { itemService, DETERIORATION_GLOBAL_SCALE } from './ItemService';
import type { GameState, DroppedItem } from '../core/types';

/**
 * §B (PRODUCTION-CHAIN-EXPANSION) durable-goods deterioration — count-down model.
 * A loose stack (`stored !== true`) loses `deteriorationRate × DETERIORATION_GLOBAL_SCALE × elapsedTicks`
 * durability from its `maxDurability` pool (default 100); destroyed at 0. Stored items take no
 * exposure damage. The global scale stretches lifespans to days/weeks; the caller throttles the
 * step to run every N ticks and passes that N as `elapsedTicks`.
 * `pine_log` carries deteriorationRate 0.05 and an explicit maxDurability in the item DB.
 */
const PINE = itemService.getItemById('pine_log')!;
const RATE = PINE.deteriorationRate!; // 0.05
const MAXD = PINE.maxDurability ?? 100;
/** Effective durability lost per elapsed tick after the global scale. */
const PER_TICK = RATE * DETERIORATION_GLOBAL_SCALE;

function makeState(dropped: DroppedItem[]): GameState {
  return { seed: 1, turn: 0, stockpile: {}, droppedItems: dropped } as unknown as GameState;
}
const drop = (p: Partial<DroppedItem>): DroppedItem =>
  ({ id: 'd1', resourceId: 'pine_log', x: 0, y: 0, quantity: 3, ...p }) as DroppedItem;

describe('ItemService.stepItemDeterioration (§B, count-down durability)', () => {
  it('draws durability down from maxDurability on a loose item (scaled, default 1 tick)', () => {
    const out = itemService.stepItemDeterioration(makeState([drop({})]));
    expect(out.droppedItems![0].durability).toBeCloseTo(MAXD - PER_TICK);
  });

  it('applies elapsedTicks worth of wear in one throttled pass', () => {
    const out = itemService.stepItemDeterioration(makeState([drop({})]), 600);
    expect(out.droppedItems![0].durability).toBeCloseTo(MAXD - PER_TICK * 600);
  });

  it('does NOT wear a stored (sheltered) item — storage halts deterioration', () => {
    const gs = makeState([drop({ stored: true })]);
    expect(itemService.stepItemDeterioration(gs)).toBe(gs);
  });

  it('weathers EVERY item — e.g. granite, from its own durability pool', () => {
    const g = itemService.getItemById('granite')!;
    const out = itemService.stepItemDeterioration(makeState([drop({ resourceId: 'granite' })]));
    expect(out.droppedItems![0].durability).toBeCloseTo(
      (g.maxDurability ?? 100) - g.deteriorationRate! * DETERIORATION_GLOBAL_SCALE
    );
  });

  it('destroys the stack once durability reaches 0', () => {
    let gs = makeState([drop({ durability: PER_TICK / 2 })]);
    gs = itemService.stepItemDeterioration(gs);
    expect(gs.droppedItems!.length).toBe(0);
  });

  it('lifespan ≈ maxDurability / (rate × scale) ticks', () => {
    // Drive it with a large elapsedTicks per call so the test stays fast; total ticks to destruction
    // should land within one step of the analytic lifespan.
    const STEP = 2000;
    const expectedTicks = MAXD / PER_TICK;
    let gs = makeState([drop({})]);
    let ticks = 0;
    while ((gs.droppedItems?.length ?? 0) > 0 && ticks < expectedTicks + STEP * 2) {
      gs = itemService.stepItemDeterioration(gs, STEP);
      ticks += STEP;
    }
    expect(ticks).toBeGreaterThanOrEqual(expectedTicks - STEP);
    expect(ticks).toBeLessThanOrEqual(expectedTicks + STEP);
  });
});
