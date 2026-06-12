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

describe('ResourceGenerator — mineral_deposit guarantee + clustering', () => {
  it('a connected mineral_deposit blob fills as ONE mineral (cluster), never empty', () => {
    // A contiguous 8×6 block of mineral_deposit = one connected component = one mineral vein.
    for (let seed = 1; seed <= 6; seed++) {
      const map: WorldTile[][] = Array.from({ length: 6 }, (_, y) =>
        Array.from({ length: 8 }, (_, x) => tile('mineral_deposit', x, y))
      );
      resourceGeneratorService.generateResources(map, seed * 13);
      const all = map.flat();
      const firstId = Object.keys(all[0].resources).filter((k) => all[0].resources[k] > 0)[0];
      expect(firstId, `empty blob seed ${seed}`).toBeDefined();
      expect(VALID_FILL.has(firstId)).toBe(true);
      // every tile in the blob carries the SAME resource (a uniform cluster, no scatter)
      for (const t of all) {
        const ids = Object.keys(t.resources).filter((k) => t.resources[k] > 0);
        expect(ids).toEqual([firstId]);
      }
    }
  });

  it('separate blobs can hold different minerals', () => {
    // Two blobs separated by a non-mineral gap column → two independent clusters.
    const map: WorldTile[][] = Array.from({ length: 4 }, (_, y) =>
      Array.from({ length: 9 }, (_, x) => tile(x === 4 ? 'rocky' : 'mineral_deposit', x, y))
    );
    resourceGeneratorService.generateResources(map, 999);
    const leftId = Object.keys(map[0][0].resources)[0];
    const rightId = Object.keys(map[0][8].resources)[0];
    expect(VALID_FILL.has(leftId)).toBe(true);
    expect(VALID_FILL.has(rightId)).toBe(true);
    // left blob uniform
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++)
      expect(Object.keys(map[y][x].resources)).toEqual([leftId]);
  });

  it('the mineral_deposit pool is exactly ore / coal / salt (no stone or crystal)', () => {
    expect(VALID_FILL.has('coal')).toBe(true);
    expect(VALID_FILL.has('rock_salt')).toBe(true);
    expect(VALID_FILL.has('hematite')).toBe(true);
    expect(VALID_FILL.has('stone_outcrop')).toBe(false);
    expect(VALID_FILL.has('crystal_formation')).toBe(false);
  });
});
