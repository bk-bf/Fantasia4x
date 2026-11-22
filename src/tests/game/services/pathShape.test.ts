import { describe, it, expect, beforeAll } from 'vitest';
import { pathfinderService } from '$lib/game/services/PathfinderService';

function grid(w: number, h: number) {
  return { walkable: new Uint8Array(w * h).fill(1), costs: new Float32Array(w * h).fill(1) };
}

beforeAll(async () => {
  await pathfinderService.init();
});

describe('the WASM pathfinder: path shape', () => {
  it('crosses an open grid straight down the diagonal', () => {
    const { walkable, costs } = grid(5, 5);
    expect(pathfinderService.findPath(walkable, costs, 5, 5, 0, 0, 4, 4)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 }
    ]);
  });

  it('prices a diagonal step above a straight one', () => {
    const { walkable, costs } = grid(5, 3);
    for (let x = 1; x < 5; x++) costs[x] = 1.2;
    expect(pathfinderService.findPath(walkable, costs, 5, 3, 0, 0, 4, 0)).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 }
    ]);
  });

  it('cuts past one blocked corner, but never between two', () => {
    const { walkable, costs } = grid(3, 3);
    walkable[1] = 0;
    expect(pathfinderService.findPath(walkable, costs, 3, 3, 0, 0, 1, 1)).toEqual([{ x: 1, y: 1 }]);
    walkable[3] = 0;
    expect(pathfinderService.findPath(walkable, costs, 3, 3, 0, 0, 1, 1)).toEqual([]);
  });
});
