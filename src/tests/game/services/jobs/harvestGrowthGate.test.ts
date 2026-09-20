import { describe, it, expect } from 'vitest';
import type { GameState, WorldTile } from '$lib/game/core/types';
import { isHarvestableTileNow, meetsGrowthGate } from '$lib/game/services/jobs/filters';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';

function tileWith(resourceId: string, amount: number, growth: number): Pick<GameState, 'worldMap'> {
  const tile = {
    resources: { [resourceId]: amount },
    growth: { [resourceId]: growth }
  } as unknown as WorldTile;
  return { worldMap: [[tile]] };
}

const forageGate = resourceObjectService.getInteractionByDesignationType(
  'pine_tree',
  'forage'
)!.minGrowth!;

describe('the growth gate comes from the data, not from a constant', () => {
  it('a tree forage is gated at the figure written on its interaction', () => {
    expect(forageGate).toBe(50);
    expect(isHarvestableTileNow(tileWith('pine_tree', 3, forageGate - 1), 0, 0, 'forage')).toBe(
      false
    );
    expect(isHarvestableTileNow(tileWith('pine_tree', 3, forageGate), 0, 0, 'forage')).toBe(true);
  });

  it('felling is never gated — a stripped tree can still be cut down', () => {
    expect(isHarvestableTileNow(tileWith('pine_tree', 3, 10), 0, 0, 'woodcut')).toBe(true);
  });

  it('reaping a crop waits for the same gate', () => {
    expect(resourceObjectService.minHarvestGrowth('crop_wheat')).toBe(50);
    expect(isHarvestableTileNow(tileWith('crop_wheat', 1, 40), 0, 0, 'harvest')).toBe(false);
    expect(isHarvestableTileNow(tileWith('crop_wheat', 1, 60), 0, 0, 'harvest')).toBe(true);
  });

  it('an ungated interaction passes at any growth, and a missing growth reads as grown', () => {
    expect(meetsGrowthGate({ minGrowth: 0 }, 0)).toBe(true);
    expect(meetsGrowthGate(undefined, 0)).toBe(true);
    expect(meetsGrowthGate({ minGrowth: 50 }, undefined)).toBe(true);
  });

  it('rejects any harvest mark on a tile with no matching resource', () => {
    const gs: Pick<GameState, 'worldMap'> = {
      worldMap: [[{ resources: {} } as unknown as WorldTile]]
    };
    expect(isHarvestableTileNow(gs, 0, 0, 'forage')).toBe(false);
  });

  it('does not gate non-harvest designations (zones paint regardless of growth)', () => {
    expect(isHarvestableTileNow(tileWith('pine_tree', 3, 0), 0, 0, 'stockpile')).toBe(true);
  });
});
