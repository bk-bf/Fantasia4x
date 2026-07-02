import { describe, it, expect } from 'vitest';
import { buildingService } from './BuildingService';
import { moveCostToEnter } from './MovementSystem';
import { tileWetness } from './EnvironmentService';
import type { GameState, WorldTile, PlacedBuilding } from '../core/types';

const tile = (x: number, y: number, extra: Partial<WorldTile> = {}): WorldTile =>
  ({ x, y, movementCost: 1, walkable: true, moisture: 0, snow: 0, ...extra }) as WorldTile;

function stateWith(t: WorldTile): GameState {
  return { worldMap: [[t]] } as unknown as GameState;
}

describe('indoor floor buildings', () => {
  it('bakes tile.floor (speed + dryness) on completion and clears it on deconstruct', () => {
    const placed = { type: 'stone_floor', x: 0, y: 0 } as unknown as PlacedBuilding;
    const s0 = stateWith(tile(0, 0));

    const built = buildingService.applyBuildingFootprint(s0, placed, true);
    const f = built.worldMap[0][0].floor;
    expect(f).toBeDefined();
    expect(f!.speed).toBeCloseTo(0.6);
    expect(f!.dryness).toBeCloseTo(0.9);

    const removed = buildingService.applyBuildingFootprint(built, placed, false);
    expect(removed.worldMap[0][0].floor).toBeUndefined();
  });

  it('a floor leaves the tile walkable (you can stand on it)', () => {
    const placed = { type: 'wooden_floor', x: 0, y: 0 } as unknown as PlacedBuilding;
    const built = buildingService.applyBuildingFootprint(stateWith(tile(0, 0)), placed, true);
    expect(built.worldMap[0][0].walkable).toBe(true);
  });

  it('a floored tile is cheaper to cross (faster movement) than bare ground', () => {
    const bare = [[tile(0, 0), tile(1, 0)]] as WorldTile[][];
    const floored = [[tile(0, 0), tile(1, 0, { floor: { speed: 0.6, dryness: 0.9 } })]];
    const from = { x: 0, y: 0 };
    const to = { x: 1, y: 0 };
    const bareCost = moveCostToEnter(from, to, bare);
    const floorCost = moveCostToEnter(from, to, floored as WorldTile[][]);
    expect(floorCost).toBeCloseTo(bareCost * 0.6);
    expect(floorCost).toBeLessThan(bareCost);
  });

  it('the wetness model (sanity) reads a soaking rainy tile that a floor would cut below soak', () => {
    // Not floor-specific (floor dryness is applied at the wetness tick, not in tileWetness), but pins
    // the math the floor relies on: dryness×tileWet pushes a soaked reading toward dry.
    const muddy = tileWetness(80, undefined); // base ground wetness 80 (no weather)
    expect(muddy * (1 - 0.9)).toBeLessThan(muddy); // a 0.9-dryness floor cuts it to ~8
    expect(muddy * (1 - 0.9)).toBeCloseTo(8);
  });
});
