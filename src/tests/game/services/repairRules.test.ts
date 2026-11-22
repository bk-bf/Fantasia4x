import { describe, it, expect } from 'vitest';
import {
  getRepairThresholdPct,
  getDefaultAllowedRepairIds,
  repairUnitsNeeded,
  planRepair
} from '$lib/game/services/repairRules';
import type { GameState, PlacedBuilding, DroppedItem } from '$lib/game/core/types';

const b = (over: Partial<PlacedBuilding>): PlacedBuilding =>
  ({ id: 'b1', type: 'campfire', x: 0, y: 0, status: 'complete', ...over }) as PlacedBuilding;

const stored = (resourceId: string, quantity: number): DroppedItem =>
  ({ id: `d-${resourceId}`, resourceId, x: 1, y: 1, quantity, stored: true }) as DroppedItem;

const gs = (drops: DroppedItem[]): GameState => ({ droppedItems: drops }) as unknown as GameState;

describe('repairRules', () => {
  it('threshold defaults to 30% and is clamped into 0..100', () => {
    expect(getRepairThresholdPct(b({}))).toBe(30);
    expect(getRepairThresholdPct(b({ repairSettings: { repairThresholdPct: 150 } } as never))).toBe(
      100
    );
    expect(getRepairThresholdPct(b({ repairSettings: { repairThresholdPct: -5 } } as never))).toBe(
      0
    );
  });

  it('units needed round up the missing share of the build cost', () => {
    expect(repairUnitsNeeded(b({ condition: 100 }))).toBe(0);
    expect(repairUnitsNeeded(b({ condition: 95 }))).toBe(1);
    expect(repairUnitsNeeded(b({ condition: 50 }))).toBe(5);
  });

  it('a building with repairMaterials repairs only from that list', () => {
    expect(getDefaultAllowedRepairIds('thatch_roof').sort()).toEqual([
      'branch',
      'hay',
      'plant_fiber'
    ]);
    expect(getDefaultAllowedRepairIds('campfire').sort()).toEqual(['branch', 'plant_fiber']);
  });

  it('a plan needs every unit on hand; short stock plans nothing', () => {
    const half = b({ condition: 50 });
    expect(planRepair(gs([stored('branch', 4)]), half)).toBeNull();
    const plan = planRepair(gs([stored('branch', 3), stored('plant_fiber', 9)]), half);
    expect(plan?.newCondition).toBe(100);
    expect(Object.values(plan!.consumed).reduce((a, n) => a + n, 0)).toBe(5);
  });
});
