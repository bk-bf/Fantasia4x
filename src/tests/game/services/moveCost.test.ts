import { describe, it, expect } from 'vitest';
import {
  moveCostToEnter,
  stepBody,
  MAX_BLOCKED_TICKS,
  type MovableBody
} from '$lib/game/services/MovementSystem';
import { TICKS_PER_SECOND } from '$lib/game/core/util/time';
import type { WorldTile } from '$lib/game/core/types';

function grid(n: number, patch?: (t: WorldTile) => void): WorldTile[][] {
  const m: WorldTile[][] = [];
  for (let y = 0; y < n; y++) {
    const row: WorldTile[] = [];
    for (let x = 0; x < n; x++) {
      const t = { x, y, walkable: true, movementCost: 1, resources: {} } as unknown as WorldTile;
      patch?.(t);
      row.push(t);
    }
    m.push(row);
  }
  return m;
}

function ticksToCross(m: WorldTile[][]): number {
  let body: MovableBody = { id: 'm', x: 0, y: 0, path: [{ x: 1, y: 0 }], pathIndex: 0 };
  for (let t = 1; t < 1000; t++) {
    body = stepBody(body, new Set(), new Set(), m, 1).body;
    if (body.x === 1) return t;
  }
  return Infinity;
}

describe('moveCostToEnter: the terms a step pays for', () => {
  it('a diagonal step costs sqrt(2) of a straight one', () => {
    const m = grid(3);
    const straight = moveCostToEnter({ x: 1, y: 1 }, { x: 2, y: 1 }, m);
    const diag = moveCostToEnter({ x: 1, y: 1 }, { x: 2, y: 2 }, m);
    expect(straight).toBeCloseTo(TICKS_PER_SECOND);
    expect(diag / straight).toBeCloseTo(Math.SQRT2);
  });

  it('snow and ice on the entered tile slow the step in proportion', () => {
    const m = grid(3);
    m[1][2].snow = 30;
    m[1][2].ice = 20;
    expect(moveCostToEnter({ x: 1, y: 1 }, { x: 2, y: 1 }, m)).toBeCloseTo(TICKS_PER_SECOND * 1.5);
  });
});

describe('stepBody: the move budget', () => {
  it('a body at speed 1 enters a plain tile on exactly the tick its budget covers the cost', () => {
    expect(ticksToCross(grid(2))).toBe(TICKS_PER_SECOND);
  });

  it('a body on deep snow needs more ticks to cross a tile than on bare ground', () => {
    const snowy = ticksToCross(grid(2, (t) => (t.snow = 50)));
    expect(snowy).toBeGreaterThan(ticksToCross(grid(2)));
  });

  it('a body blocked for MAX_BLOCKED_TICKS ticks still holds; the next tick drops', () => {
    const occ = new Set([1]);
    const at = (blockedTicks: number) =>
      stepBody(
        { id: 'm', x: 0, y: 0, path: [{ x: 1, y: 0 }], pathIndex: 0, blockedTicks },
        occ,
        new Set(),
        grid(2),
        1
      ).status;
    expect(at(MAX_BLOCKED_TICKS - 1)).toBe('held');
    expect(at(MAX_BLOCKED_TICKS)).toBe('dropped');
  });
});
