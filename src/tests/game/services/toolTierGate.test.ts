import { describe, it, expect } from 'vitest';
import { buildingService } from '$lib/game/services/BuildingService';
import { colonyToolTier } from '$lib/game/core/state/stockpile';
import type { GameState, DroppedItem } from '$lib/game/core/types';

function makeState(drops: DroppedItem[], currentToolLevel = 0): GameState {
  return {
    seed: 1,
    turn: 0,
    stockpile: {},
    stockpileZones: [],
    droppedItems: drops,
    buildings: [],
    pawns: [{ id: 'p1' }],
    completedResearch: [],
    currentToolLevel
  } as unknown as GameState;
}

describe('ADR-009 colony tool-tier gate', () => {
  it('colonyToolTier returns the highest owned tool tier even with currentToolLevel 0', () => {
    const gs = makeState([
      { id: 'a', resourceId: 'stone_axe', x: 0, y: 0, quantity: 1, stored: true }
    ]);
    expect(gs.currentToolLevel).toBe(0);
    expect(colonyToolTier(gs)).toBe(1);
  });

  it('still honours research-granted currentToolLevel when no tools are owned', () => {
    const gs = makeState([], 2);
    expect(colonyToolTier(gs)).toBe(2);
  });

  it('takes the MAX of an owned tool and currentToolLevel, whichever is higher', () => {
    const lowTool = makeState(
      [{ id: 'a', resourceId: 'stone_axe', x: 0, y: 0, quantity: 1, stored: true }],
      3
    );
    expect(colonyToolTier(lowTool)).toBe(3);

    const highTool = makeState(
      [{ id: 'b', resourceId: 'steel_pick', x: 0, y: 0, quantity: 1, stored: true }],
      1
    );
    expect(colonyToolTier(highTool)).toBe(3);
  });

  it('owning a tier-1 tool satisfies a tier-1 building gate (Splitting Stump)', () => {
    const gs = makeState([
      { id: 'a', resourceId: 'stone_axe', x: 0, y: 0, quantity: 1, stored: true },
      { id: 'l', resourceId: 'oak_log', x: 0, y: 0, quantity: 5, stored: true }
    ]);
    expect(buildingService.hasRequiredTools('chopping_block', gs)).toBe(true);
    expect(buildingService.canBuildBuilding('chopping_block', gs)).toBe(true);
  });

  it('blocks the tier-1 building when no qualifying tool is owned', () => {
    const gs = makeState([
      { id: 'l', resourceId: 'oak_log', x: 0, y: 0, quantity: 5, stored: true }
    ]);
    expect(buildingService.hasRequiredTools('chopping_block', gs)).toBe(false);
  });
});
