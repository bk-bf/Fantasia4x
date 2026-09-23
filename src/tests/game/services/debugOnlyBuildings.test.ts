import { describe, it, expect, afterEach } from 'vitest';
import { buildingService } from '$lib/game/services/BuildingService';
import type { Building, GameState } from '$lib/game/core/types';

function gs(overrides: Partial<GameState> = {}): GameState {
  return {
    pawns: [{}],
    buildings: [],
    completedResearch: [],
    droppedItems: [],
    ...overrides
  } as unknown as GameState;
}

describe('debugOnly buildings (canBuildBuilding / getAvailableBuildings)', () => {
  const craftSpot = buildingService.getBuildingById('craft_spot') as Building;

  afterEach(() => {
    delete craftSpot.debugOnly;
  });

  it('a non-debug building is buildable whether or not the toggle is on', () => {
    expect(buildingService.canBuildBuilding('craft_spot', gs())).toBe(true);
    expect(buildingService.canBuildBuilding('craft_spot', gs({ debugMode: true }))).toBe(true);
  });

  it('a debugOnly building is unbuildable with the toggle off, buildable with it on', () => {
    craftSpot.debugOnly = true;
    expect(buildingService.canBuildBuilding('craft_spot', gs())).toBe(false);
    expect(buildingService.canBuildBuilding('craft_spot', gs({ debugMode: true }))).toBe(true);
  });

  it('getAvailableBuildings excludes a debugOnly building with the toggle off, includes it with it on', () => {
    craftSpot.debugOnly = true;
    expect(
      buildingService.getAvailableBuildings(gs()).some((b) => b.id === 'craft_spot')
    ).toBe(false);
    expect(
      buildingService
        .getAvailableBuildings(gs({ debugMode: true }))
        .some((b) => b.id === 'craft_spot')
    ).toBe(true);
  });
});

describe('isRecipeStationDebugOnly', () => {
  it('is false when the station has no debugOnly flag', () => {
    expect(buildingService.isRecipeStationDebugOnly('steel_stove')).toBe(false);
  });

  it('is false for hand-crafting, which names no station', () => {
    expect(buildingService.isRecipeStationDebugOnly(null)).toBe(false);
    expect(buildingService.isRecipeStationDebugOnly(undefined)).toBe(false);
  });

  it('is true once the only station able to fulfil the recipe is debugOnly', () => {
    const steelStove = buildingService.getBuildingById('steel_stove') as Building;
    steelStove.debugOnly = true;
    try {
      expect(buildingService.isRecipeStationDebugOnly('steel_stove')).toBe(true);
    } finally {
      delete steelStove.debugOnly;
    }
  });

  it('stays false when a non-debug station on the same ladder still fulfils the recipe', () => {
    const campfire = buildingService.getBuildingById('campfire') as Building;
    campfire.debugOnly = true;
    try {
      expect(buildingService.isRecipeStationDebugOnly('campfire')).toBe(false);
    } finally {
      delete campfire.debugOnly;
    }
  });
});
