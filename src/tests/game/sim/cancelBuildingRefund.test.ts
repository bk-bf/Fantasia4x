import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { applySimCommand } from '$lib/game/sim/commands';
import type { GameState } from '$lib/game/core/types';

function storedTotals(s: GameState): { stock: Record<string, number>; reserved: number } {
  const stock: Record<string, number> = {};
  let reserved = 0;
  for (const d of s.droppedItems ?? []) {
    if (!d.stored) continue;
    stock[d.resourceId] = (stock[d.resourceId] ?? 0) + d.quantity;
    if (d.reservedFor) reserved += d.quantity;
  }
  return { stock, reserved };
}

function scenario(): GameState {
  return buildScenario({
    seed: 9,
    map: { w: 20, h: 20 },
    pawns: [{ count: 1 }],
    items: { branch: 10, plant_fiber: 10 }
  });
}

describe('cancelling a building from the build menu', () => {
  it('returns a planned building its materials without duplicating or stranding them', () => {
    let s = scenario();
    const before = storedTotals(s);
    s = applySimCommand(s, { type: 'placeBuilding', payload: { bid: 'campfire', x: 3, y: 3 } });
    const placed = (s.buildings ?? []).find((b) => b.type === 'campfire')!;
    expect(placed.status).toBe('planned');
    expect(storedTotals(s).reserved).toBeGreaterThan(0);

    s = applySimCommand(s, { type: 'cancelBuildingRefund', payload: { buildingId: placed.id } });

    const after = storedTotals(s);
    expect(after.stock).toEqual(before.stock);
    expect(after.reserved).toBe(0);
    expect((s.droppedItems ?? []).filter((d) => d.reservedFor === placed.id)).toHaveLength(0);
    expect((s.buildings ?? []).some((b) => b.id === placed.id)).toBe(false);
    expect((s.jobs ?? []).some((j) => j.buildingId === placed.id)).toBe(false);
  });

  it('refunds the cost of a building whose materials were already delivered', () => {
    let s = scenario();
    const before = storedTotals(s);
    s = {
      ...s,
      buildings: [
        ...(s.buildings ?? []),
        {
          id: 'campfire-legacy',
          type: 'campfire',
          x: 3,
          y: 3,
          status: 'under_construction',
          progress: 0.5,
          workRequired: 10,
          workDone: 5,
          materialsDelivered: true
        }
      ]
    };

    s = applySimCommand(s, {
      type: 'cancelBuildingRefund',
      payload: { buildingId: 'campfire-legacy' }
    });

    const after = storedTotals(s);
    expect(after.stock).toEqual({
      branch: before.stock.branch + 5,
      plant_fiber: before.stock.plant_fiber + 4
    });
    expect(after.reserved).toBe(0);
  });
});
