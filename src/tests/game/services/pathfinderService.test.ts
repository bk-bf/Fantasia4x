import { describe, it, expect, beforeAll } from 'vitest';
import {
  BODY_SOFT_PENALTY,
  buildPathfindingGrids,
  findPathOnWorld,
  findPathSoftBlocked,
  patchPathfindingWalkable,
  pathfinderService,
  withSoftBlocked
} from '$lib/game/services/PathfinderService';
import type { WorldTile } from '$lib/game/core/types';

function world(w: number, h: number): WorldTile[][] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x,
      y,
      walkable: !(x === 6 && y > 0 && y < h - 1),
      movementCost: 1 + ((x * 7 + y * 3) % 5) * 0.1,
      terrainType: 'plains',
      resources: {}
    }))
  ) as unknown as WorldTile[][];
}

function search(walkable: Uint8Array, costs: Float32Array, w: number, h: number, maxIter = 0) {
  return pathfinderService.findPath(walkable, costs, w, h, 1, 1, w - 2, h - 2, maxIter);
}

describe('pathfinder search', () => {
  beforeAll(() => pathfinderService.init());

  it('returns the same path on a repeat call, after a failed one, and after one on a larger map', () => {
    const small = buildPathfindingGrids(world(14, 12));
    const first = search(small.walkable, small.costs, 14, 12);
    expect(first.length).toBeGreaterThan(0);
    expect(search(small.walkable, small.costs, 14, 12, 3)).toEqual([]);
    const big = buildPathfindingGrids(world(90, 70));
    expect(search(big.walkable, big.costs, 90, 70).length).toBeGreaterThan(0);
    const again = buildPathfindingGrids(world(14, 12));
    expect(search(again.walkable, again.costs, 14, 12)).toEqual(first);
  });
});

describe('soft-blocked tiles', () => {
  beforeAll(() => pathfinderService.init());

  it('steers around occupied tiles exactly as a penalised copy of the cost grid would', () => {
    const map = world(14, 12);
    const base = buildPathfindingGrids(map);
    const before = base.costs.slice();
    const blocked = new Set([2 * 14 + 2, 3 * 14 + 3, 5 * 14 + 7, 10 * 14 + 12]);
    const copy = base.costs.slice();
    for (const k of blocked) if (base.walkable[k]) copy[k] += BODY_SOFT_PENALTY;
    const expected = search(base.walkable, copy, 14, 12);
    const got = withSoftBlocked(map, blocked, (g) =>
      search(g.walkable, g.costs, g.width, g.height)
    );
    expect(got).toEqual(expected);
    expect(base.costs).toEqual(before);
  });

  it('leaves the start and goal of a pawn order unpenalised', () => {
    const map = world(14, 12);
    const base = buildPathfindingGrids(map);
    const blocked = new Set([1 * 14 + 1, 10 * 14 + 12, 4 * 14 + 4]);
    const copy = base.costs.slice();
    copy[4 * 14 + 4] += BODY_SOFT_PENALTY;
    const expected = search(base.walkable, copy, 14, 12);
    expect(findPathSoftBlocked(map, blocked, 1, 1, 12, 10)).toEqual(expected);
    expect(base.costs[1 * 14 + 1]).toBe(Math.fround(map[1][1].movementCost));
  });
});

describe('the grid held by the search module', () => {
  beforeAll(() => pathfinderService.init());

  it('follows every walkability patch, so a resident search matches one over the live grid', () => {
    const map = world(14, 12);
    const base = buildPathfindingGrids(map);
    const blocked = new Set([3 * 14 + 3]);
    const live = () =>
      withSoftBlocked(map, blocked, (g) => search(g.walkable, g.costs, g.width, g.height));
    expect(findPathOnWorld(map, blocked, 1, 1, 12, 10)).toEqual(live());
    for (let y = 1; y < 11; y++) patchPathfindingWalkable(6, y, true);
    expect(findPathOnWorld(map, blocked, 1, 1, 12, 10)).toEqual(live());
    for (let x = 0; x < 14; x++) patchPathfindingWalkable(x, 5, false);
    expect(findPathOnWorld(map, blocked, 1, 1, 12, 10)).toEqual([]);
    expect(live()).toEqual([]);
    expect(base.walkable[5 * 14 + 6]).toBe(0);
  });

  it('loads a new map when the world changes under it', () => {
    const a = world(14, 12);
    const b = world(20, 16);
    const onA = findPathOnWorld(a, new Set(), 1, 1, 12, 10);
    findPathOnWorld(b, new Set(), 1, 1, 18, 14);
    const ga = buildPathfindingGrids(a);
    expect(findPathOnWorld(a, new Set(), 1, 1, 12, 10)).toEqual(onA);
    expect(onA).toEqual(search(ga.walkable, ga.costs, 14, 12));
  });
});
