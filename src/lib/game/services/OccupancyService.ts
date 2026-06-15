/**
 * OccupancyService — single source of truth for "which tiles hold a solid body".
 *
 * Every pawn and every non-corpse mob occupies exactly one tile and blocks it: no two
 * bodies may share a tile and none may phase through another. This one service answers
 * that question for BOTH consumers, so the rule can't drift apart between them:
 *
 *   • Pathfinding — `blockedTiles()` feeds the A* grid builder
 *     (`buildPathfindingGridsWithBlocked`) so routes plan AROUND other bodies.
 *   • Movement — the per-tick advance passes test `blockedTiles()` / `isBlocked()`
 *     before entering a tile, enforcing the same rule if the world shifted since the
 *     path was planned.
 *
 * It is a plain per-tick scan (O(pawns + mobs)); no spatial WASM is involved, so it
 * stays in TypeScript per ADR-008 (only A* / nearest-entity live behind the WASM
 * interface). Callers pass `excludeId` for the entity being pathed/moved so it is never
 * blocked by its own body.
 *
 * (A `(pawns,mobs)`-identity memoization was tried and reverted: `processMovement` rebuilds the
 * `pawns` array on every patch, so the cache key invalidated constantly → near-zero hit rate, and
 * the extra per-rebuild bookkeeping cost more than the plain scan it replaced. Measured worse.)
 */

import type { GameState } from '../core/types';

export interface OccupancyService {
  /** Set of "x,y" keys for every body except `excludeId`. */
  blockedTiles(state: GameState, excludeId?: string): Set<string>;
  /** True if (x, y) holds a body other than `excludeId`. */
  isBlocked(state: GameState, x: number, y: number, excludeId?: string): boolean;
}

class OccupancyServiceImpl implements OccupancyService {
  blockedTiles(state: GameState, excludeId?: string): Set<string> {
    const occupied = new Set<string>();
    for (const p of state.pawns) {
      if (p.id === excludeId || !p.position || p.isAlive === false) continue;
      occupied.add(`${p.position.x},${p.position.y}`);
    }
    for (const m of state.mobs ?? []) {
      if (m.id === excludeId || m.state === 'Corpse') continue;
      occupied.add(`${m.x},${m.y}`);
    }
    return occupied;
  }

  isBlocked(state: GameState, x: number, y: number, excludeId?: string): boolean {
    for (const p of state.pawns) {
      if (p.id === excludeId || !p.position) continue;
      if (p.position.x === x && p.position.y === y) return true;
    }
    for (const m of state.mobs ?? []) {
      if (m.id === excludeId || m.state === 'Corpse') continue;
      if (m.x === x && m.y === y) return true;
    }
    return false;
  }
}

export const occupancyService: OccupancyService = new OccupancyServiceImpl();
