import { describe, it, expect } from 'vitest';
import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import { colonyToolTier } from '$lib/game/core/GameState';
import type { GameState, DroppedItem } from '$lib/game/core/types';

/**
 * ADR-009 tool-tier gate. `toolTierRequired` on a building/recipe must be satisfied by a crafted/owned
 * tool of that tier — NOT only by research-granted `currentToolLevel`. Regression for the BLOCKED bug:
 * a fresh colony holding a stone_axe (tier 1) and all ingredients couldn't build the tier-1 Splitting
 * Stump because the gate read `currentToolLevel` (0 without research).
 */
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
    const gs = makeState([{ id: 'a', resourceId: 'stone_axe', x: 0, y: 0, quantity: 1, stored: true }]);
    expect(gs.currentToolLevel).toBe(0);
    expect(colonyToolTier(gs)).toBe(1); // stone_axe is tier 1
  });

  it('still honours research-granted currentToolLevel when no tools are owned', () => {
    const gs = makeState([], 2);
    expect(colonyToolTier(gs)).toBe(2);
  });

  it('owning a tier-1 tool satisfies a tier-1 building gate (Splitting Stump)', () => {
    // chopping_block: buildingCost {category:log: 1, stone_axe: 1}, toolTierRequired 1.
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
