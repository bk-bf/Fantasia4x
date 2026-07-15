import { describe, it, expect } from 'vitest';
import { buildingService } from '$lib/game/services/BuildingService';
import type { GameState, PlacedBuilding } from '$lib/game/core/types';

// Solid buildings (def.walkable === false — walls, furnaces, fires) block their tile once built;
// passable ones (beds, doors, spots) never do. The flag lives on worldMap.walkable, which every
// walkability check (A* grid, mob isWalkable, approach-finding, idle wander) already honors.

function makeState(): GameState {
  return {
    turn: 0,
    pawns: [],
    mobs: [],
    buildings: [],
    worldMap: Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 5 }, (_, x) => ({ x, y, walkable: true }))
    )
  } as unknown as GameState;
}

const placed = (type: string, x: number, y: number): PlacedBuilding =>
  ({ id: `${type}-${x}-${y}`, type, x, y, status: 'complete' }) as unknown as PlacedBuilding;

describe('building footprint walkability', () => {
  it('marks the data: walls and furnaces non-walkable, beds/doors/spots passable', () => {
    const nonWalkable = ['hearth', 'campfire', 'branch_wall', 'mud_brick_wall', 'bloomery', 'well'];
    for (const id of nonWalkable) {
      expect(buildingService.getBuildingById(id)?.walkable, id).toBe(false);
    }
    // Passable buildings leave walkable undefined (treated as true) — pawns stand on/cross them.
    const passable = ['sleeping_spot', 'door', 'craft_spot', 'wooden_table'];
    for (const id of passable) {
      expect(buildingService.getBuildingById(id)?.walkable ?? true, id).toBe(true);
    }
  });

  it('blocks a solid building tile and restores it on removal', () => {
    const state = makeState();
    const hearth = placed('hearth', 2, 2);

    const blocked = buildingService.applyBuildingFootprint(state, hearth, true);
    expect(blocked.worldMap[2][2].walkable).toBe(false);
    // Neighbours are untouched.
    expect(blocked.worldMap[2][3].walkable).toBe(true);

    const restored = buildingService.applyBuildingFootprint(blocked, hearth, false);
    expect(restored.worldMap[2][2].walkable).toBe(true);
  });

  it('is a no-op for a passable building', () => {
    const state = makeState();
    const bed = placed('sleeping_spot', 1, 1);
    const after = buildingService.applyBuildingFootprint(state, bed, true);
    expect(after).toBe(state); // same reference — nothing changed
    expect(after.worldMap[1][1].walkable).toBe(true);
  });

  it('returns the same state when the tile already matches (no needless copy)', () => {
    const state = makeState();
    const wall = placed('branch_wall', 0, 0);
    // Already walkable, asking to restore (walkable=true) → no change.
    expect(buildingService.applyBuildingFootprint(state, wall, false)).toBe(state);
  });
});
