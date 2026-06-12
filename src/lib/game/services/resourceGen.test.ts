import { describe, it, expect } from 'vitest';
import { resourceGeneratorService } from './ResourceGeneratorService';
import { resourceObjectService } from './ResourceObjectService';
import type { WorldTile } from '../core/types';

/**
 * Bug fix: a `mineral_deposit` tile must NEVER be empty — it always holds a metal ore, coal, or
 * salt (the generator force-fills it if the independent spawn rolls all miss). Other subterrains
 * may legitimately be empty.
 */
function tile(subType: string, x: number, y: number): WorldTile {
  return {
    x,
    y,
    subType,
    terrainType: subType,
    resources: {},
    walkable: true,
    movementCost: 1,
    ascii: '.'
  } as unknown as WorldTile;
}

const VALID_FILL = new Set(
  resourceObjectService
    .getAll()
    .filter((d) => (d.spawn.subterrains['mineral_deposit'] ?? 0) > 0)
    .map((d) => d.id)
);

describe('ResourceGenerator — mineral_deposit guarantee', () => {
  it('every mineral_deposit tile gets a resource from the ore/coal/salt pool', () => {
    // a grid of mineral_deposit tiles across several seeds
    for (let seed = 1; seed <= 5; seed++) {
      const map: WorldTile[][] = [
        Array.from({ length: 40 }, (_, i) => tile('mineral_deposit', i, seed))
      ];
      resourceGeneratorService.generateResources(map, seed * 13);
      for (const t of map[0]) {
        const ids = Object.keys(t.resources).filter((k) => t.resources[k] > 0);
        expect(ids.length, `empty mineral_deposit at ${t.x},${t.y} seed ${seed}`).toBeGreaterThan(0);
        expect(VALID_FILL.has(ids[0]), `unexpected fill '${ids[0]}'`).toBe(true);
      }
    }
  });

  it('the mineral_deposit pool is exactly ore / coal / salt (no stone or crystal)', () => {
    expect(VALID_FILL.has('coal')).toBe(true);
    expect(VALID_FILL.has('rock_salt')).toBe(true);
    expect(VALID_FILL.has('hematite')).toBe(true);
    expect(VALID_FILL.has('stone_outcrop')).toBe(false);
    expect(VALID_FILL.has('crystal_formation')).toBe(false);
  });
});
