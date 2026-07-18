import { describe, it, expect } from 'vitest';
import { tryWanderStep } from '$lib/game/systems/pawn/pawnHelpers';
import { rng } from '$lib/game/core/rng';
import type { GameState, Pawn } from '$lib/game/core/types';

// Idle pawns amble one tile at a time instead of standing frozen — natural milling, and it
// keeps idlers off build-site approach tiles (the construct deadlock). Mirrors the mob mover.

function makeWorld(
  w: number,
  h: number,
  blocked: Array<[number, number]> = []
): GameState['worldMap'] {
  const set = new Set(blocked.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({ x, y, walkable: !set.has(`${x},${y}`) }))
  ) as unknown as GameState['worldMap'];
}

function makeState(pawns: Pawn[], blocked: Array<[number, number]> = []): GameState {
  return {
    turn: 0,
    pawns,
    mobs: [],
    worldMap: makeWorld(10, 10, blocked)
  } as unknown as GameState;
}

const idleAt = (id: string, x: number, y: number): Pawn =>
  ({ id, name: id, position: { x, y }, isAlive: true, isMoving: false }) as unknown as Pawn;

describe('idle wander', () => {
  it('eventually steps an idle pawn to an adjacent walkable tile', () => {
    rng.reseed(1);
    const pawn = idleAt('p', 5, 5);
    const state = makeState([pawn]);

    let stepped: GameState | null = null;
    for (let i = 0; i < 2000 && !stepped; i++) stepped = tryWanderStep(pawn, state);

    expect(stepped).not.toBeNull();
    const moved = stepped!.pawns.find((p) => p.id === 'p')!;
    expect(moved.path?.length).toBe(1);
    const dest = moved.path![0];
    // One tile away from the origin (a single adjacent step).
    expect(Math.max(Math.abs(dest.x - 5), Math.abs(dest.y - 5))).toBe(1);
  });

  it('never moves a pawn boxed in by non-walkable tiles', () => {
    rng.reseed(2);
    const pawn = idleAt('p', 5, 5);
    // Wall off all 8 neighbours.
    const walls: Array<[number, number]> = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (dx || dy) walls.push([5 + dx, 5 + dy]);
    const state = makeState([pawn], walls);

    for (let i = 0; i < 1000; i++) expect(tryWanderStep(pawn, state)).toBeNull();
  });

  it('does not redirect a pawn that is already strolling', () => {
    rng.reseed(3);
    const pawn = {
      ...idleAt('p', 5, 5),
      isMoving: true,
      path: [{ x: 6, y: 5 }]
    } as unknown as Pawn;
    const state = makeState([pawn]);
    for (let i = 0; i < 1000; i++) expect(tryWanderStep(pawn, state)).toBeNull();
  });

  it('does not step onto a tile held by another body', () => {
    rng.reseed(4);
    const pawn = idleAt('p', 5, 5);
    // Block 7 of 8 neighbours with terrain; leave only (6,5) open, but park a body there.
    const open: [number, number] = [6, 5];
    const walls: Array<[number, number]> = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (5 + dx === open[0] && 5 + dy === open[1]) continue;
        walls.push([5 + dx, 5 + dy]);
      }
    const blocker = idleAt('b', open[0], open[1]);
    const state = makeState([pawn, blocker], walls);
    // The only walkable neighbour is occupied → the pawn stays put.
    for (let i = 0; i < 1000; i++) expect(tryWanderStep(pawn, state)).toBeNull();
  });
});
