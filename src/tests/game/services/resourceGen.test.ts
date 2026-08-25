import { describe, it, expect } from 'vitest';
import { resourceGeneratorService } from '$lib/game/services/ResourceGeneratorService';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import type { WorldTile } from '$lib/game/core/types';

function tile(subType: string, x: number, y: number, terrainType = subType): WorldTile {
  return {
    x,
    y,
    subType,
    terrainType,
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
    for (let seed = 1; seed <= 6; seed++) {
      const map: WorldTile[][] = Array.from({ length: 6 }, (_, y) =>
        Array.from({ length: 8 }, (_, x) => tile('mineral_deposit', x, y))
      );
      resourceGeneratorService.generateResources(map, seed * 13);
      const all = map.flat();
      const firstId = Object.keys(all[0].resources).filter((k) => all[0].resources[k] > 0)[0];
      expect(firstId, `empty blob seed ${seed}`).toBeDefined();
      expect(VALID_FILL.has(firstId)).toBe(true);
      for (const t of all) {
        const ids = Object.keys(t.resources).filter((k) => t.resources[k] > 0);
        expect(ids).toEqual([firstId]);
      }
    }
  });

  it('grows a lone mineral_deposit tile into a 3–8 tile single-mineral cluster', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const map: WorldTile[][] = Array.from({ length: 9 }, (_, y) =>
        Array.from({ length: 9 }, (_, x) =>
          tile(x === 4 && y === 4 ? 'mineral_deposit' : 'cave', x, y, 'mountain')
        )
      );
      resourceGeneratorService.generateResources(map, seed * 31);
      const oreTiles = map
        .flat()
        .filter((t) =>
          Object.keys(t.resources).some((k) => t.resources[k] > 0 && VALID_FILL.has(k))
        );
      expect(oreTiles.length, `cluster size seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(oreTiles.length).toBeLessThanOrEqual(8);
      const minerals = new Set(
        oreTiles.map((t) => Object.keys(t.resources).find((k) => VALID_FILL.has(k)))
      );
      expect(minerals.size, 'cluster is a single mineral').toBe(1);
    }
  });

  it('separate blobs can hold different minerals', () => {
    const map: WorldTile[][] = Array.from({ length: 4 }, (_, y) =>
      Array.from({ length: 9 }, (_, x) => tile(x === 4 ? 'cave' : 'mineral_deposit', x, y))
    );
    resourceGeneratorService.generateResources(map, 999);
    const leftId = Object.keys(map[0][0].resources)[0];
    const rightId = Object.keys(map[0][8].resources)[0];
    expect(VALID_FILL.has(leftId)).toBe(true);
    expect(VALID_FILL.has(rightId)).toBe(true);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) expect(Object.keys(map[y][x].resources)).toEqual([leftId]);
  });

  it('the mineral_deposit pool is exactly ore / coal / salt (no stone or crystal)', () => {
    expect(VALID_FILL.has('coal')).toBe(true);
    expect(VALID_FILL.has('rock_salt')).toBe(true);
    expect(VALID_FILL.has('hematite')).toBe(true);
    expect(VALID_FILL.has('stone_outcrop')).toBe(false);
    expect(VALID_FILL.has('amethyst_node')).toBe(false);
  });
});
