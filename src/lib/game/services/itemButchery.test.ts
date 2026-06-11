import { describe, it, expect } from 'vitest';
import { itemService } from './ItemService';
import type { GameState, Item } from '../core/types';

/**
 * D10 moved butchery from the engine into ItemService.processButchery. The full yield path
 * is gated by canCraftItem (carcass must be craftable: butcher station + intactness + stock),
 * which depends on runtime-augmented carcass data rather than the static item DB, so it can't
 * be exercised in isolation. These tests pin the deterministic guard branches the move must
 * preserve; the yield math itself is an exact copy of the prior engine code.
 */
function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    seed: 1,
    turn: 0,
    item: [],
    buildings: [],
    stockpile: {},
    stockpileZones: [],
    carcassIntactness: {},
    ...partial
  } as unknown as GameState;
}

const carcass = (): Item =>
  ({
    id: 'rabbit_carcass',
    name: 'Rabbit Carcass',
    category: 'food',
    isCarcass: true,
    yields: [{ item: 'rabbit_meat', min: 2, max: 2 }],
    amount: 0
  }) as any;

describe('ItemService.processButchery (D10 — moved from engine)', () => {
  it('is a no-op for a non-carcass item (returns the same state ref)', () => {
    const gs = makeState();
    const notCarcass = { id: 'plank', name: 'Plank', amount: 0 } as any;
    expect(itemService.processButchery(notCarcass, gs)).toBe(gs);
  });

  it('is a no-op at 0% intactness', () => {
    const gs = makeState({ carcassIntactness: { rabbit_carcass: 0 } });
    expect(itemService.processButchery(carcass(), gs)).toBe(gs);
  });

  it('is a no-op when the carcass is not craftable (no butcher station)', () => {
    const gs = makeState({
      stockpile: { rabbit_carcass: 1 },
      carcassIntactness: { rabbit_carcass: 100 }
    });
    // canCraftItem requires a butcher_spot/dressing_stone — absent here → no production.
    const out = itemService.processButchery(carcass(), gs);
    expect(out.stockpile['rabbit_meat'] ?? 0).toBe(0);
  });
});
