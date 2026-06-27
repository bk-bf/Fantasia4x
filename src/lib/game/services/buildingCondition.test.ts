import { describe, it, expect } from 'vitest';
import { buildingService } from './BuildingService';
import type { GameState, PlacedBuilding } from '../core/types';

/**
 * Refactor Stage 1 (PRODUCTION-CHAIN-EXPANSION §B building wear).
 * Complete buildings whose def has `conditionDecayPerTurn` lose condition each tick;
 * `repairBuilding` restores them to 100 by consuming a fraction of the build cost.
 * `branch_wall` carries conditionDecayPerTurn 0.5 and buildingCost {branch:8, plant_fiber:4}.
 */
function makeState(buildings: PlacedBuilding[], stockpile: Record<string, number> = {}): GameState {
  // Stage 2: items live as `stored` DroppedItems on tiles; the aggregate is summed from them.
  const droppedItems = Object.entries(stockpile).map(([id, qty], i) => ({
    id: `stored-${id}`,
    resourceId: id,
    x: i,
    y: 0,
    quantity: qty,
    stored: true
  }));
  return {
    seed: 1,
    turn: 0,
    stockpile: { ...stockpile },
    stockpileZones: [],
    droppedItems,
    buildings
  } as unknown as GameState;
}

const wall = (p: Partial<PlacedBuilding> = {}): PlacedBuilding =>
  ({
    id: 'b1',
    type: 'branch_wall',
    x: 0,
    y: 0,
    status: 'complete',
    progress: 1,
    ...p
  }) as PlacedBuilding;

describe('BuildingService condition (refactor Stage 1)', () => {
  it('decays a complete building with conditionDecayPerTurn', () => {
    const out = buildingService.stepBuildingCondition(makeState([wall()]));
    expect(out.buildings![0].condition).toBeLessThan(100);
    expect(out.buildings![0].condition).toBeGreaterThan(99); // tiny per-tick amount
  });

  it('does not decay buildings under construction', () => {
    const gs = makeState([wall({ status: 'under_construction' })]);
    expect(buildingService.stepBuildingCondition(gs)).toBe(gs);
  });

  it('does not decay a building whose def has no decay rate (e.g. hearth)', () => {
    const gs = makeState([wall({ type: 'hearth' })]);
    expect(buildingService.stepBuildingCondition(gs)).toBe(gs);
  });

  it('repair restores condition to 100 and consumes ~25% of build cost', () => {
    const gs = makeState([wall({ condition: 40 })], { branch: 10, cordage: 10 });
    const out = buildingService.repairBuilding('b1', gs);
    expect(out.buildings![0].condition).toBe(100);
    // 25% of branch_wall {branch:8, cordage:8} = {branch:2, cordage:2}
    expect(out.stockpile['branch']).toBe(8);
    expect(out.stockpile['cordage']).toBe(8);
  });

  it('repair is a no-op when materials are unaffordable', () => {
    const gs = makeState([wall({ condition: 40 })], { branch: 0, cordage: 0 });
    expect(buildingService.repairBuilding('b1', gs)).toBe(gs);
  });
});
