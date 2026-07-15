import { describe, it, expect } from 'vitest';
import { tileHasBody, freeDropTileNear, separateStackedBodies } from '$lib/game/systems/pawn/carry';
import type { GameState, Mob, Pawn, WorldTile } from '$lib/game/core/types';

// 6×6 all-walkable map.
const W = 6;
const worldMap = Array.from({ length: W }, (_, y) =>
  Array.from(
    { length: W },
    (_, x) => ({ x, y, walkable: true, movementCost: 1 }) as unknown as WorldTile
  )
) as WorldTile[][];

const pawn = (id: string, x: number, y: number, extra: Partial<Pawn> = {}): Pawn =>
  ({ id, name: id, position: { x, y }, isAlive: true, path: [], isMoving: false, ...extra }) as unknown as Pawn;

const mob = (id: string, x: number, y: number, state = 'Wander'): Mob =>
  ({ id, x, y, state }) as unknown as Mob;

const gs = (pawns: Pawn[], mobs: Mob[] = []): GameState =>
  ({ pawns, mobs, worldMap, buildings: [], jobs: [] }) as unknown as GameState;

describe('one-body-per-tile occupancy (carry / de-overlap)', () => {
  it('tileHasBody sees a mob, not just a pawn (the gap behind the reported bug)', () => {
    const s = gs([], [mob('wolf', 3, 3, 'Collapsed')]);
    expect(tileHasBody(s, 3, 3)).toBe(true);
    expect(tileHasBody(s, 2, 2)).toBe(false);
    // A corpse is walkable-over and does NOT block (matches OccupancyService).
    expect(tileHasBody(gs([], [mob('dead', 4, 4, 'Corpse')]), 4, 4)).toBe(false);
  });

  it('freeDropTileNear never sets a body down on a tile a mob occupies', () => {
    const s = gs([pawn('carrier', 3, 3)], [mob('wolf', 3, 3, 'Collapsed')]);
    const at = freeDropTileNear(s, 3, 3, 'victim');
    expect(at).not.toEqual({ x: 3, y: 3 }); // not under the wolf / carrier
    expect(tileHasBody(s, at.x, at.y, ['victim'])).toBe(false); // landed somewhere clear
  });

  it('freeDropTileNear lays the body BESIDE the carrier, never on it', () => {
    const at = freeDropTileNear(gs([pawn('carrier', 3, 3)]), 3, 3, 'victim');
    expect(at).not.toEqual({ x: 3, y: 3 });
    expect(Math.max(Math.abs(at.x - 3), Math.abs(at.y - 3))).toBe(1); // adjacent tile
  });

  it('separateStackedBodies nudges the mob off a pawn-occupied tile, keeping the pawn put', () => {
    const out = separateStackedBodies(gs([pawn('colonist', 2, 2)], [mob('wolf', 2, 2, 'Collapsed')]));
    expect(out.pawns.find((q) => q.id === 'colonist')!.position).toEqual({ x: 2, y: 2 }); // pawn stays
    const w = out.mobs!.find((q) => q.id === 'wolf')!;
    expect(w.x === 2 && w.y === 2).toBe(false); // wolf relocated
    expect(tileHasBody(out, 2, 2, ['colonist'])).toBe(false); // tile no longer doubly occupied
  });

  it('separateStackedBodies is a no-op (same ref) when nothing overlaps', () => {
    const s = gs([pawn('a', 1, 1), pawn('b', 2, 2)], [mob('m', 3, 3)]);
    expect(separateStackedBodies(s)).toBe(s);
  });
});
