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
  /** ALL-bodies occupancy (no self-exclusion), MEMOISED on the (mobs, pawns) array refs so every mob
   *  pathing in one FSM tick shares ONE set instead of rebuilding it per request. Self-exclusion is
   *  dropped deliberately: callers (mob A*) only use it as a SOFT cost penalty, and a penalty on the
   *  mover's own start tile is irrelevant to A* (start g=0). Stable within a tick (state.mobs/pawns
   *  refs don't change mid-FSM); rebuilt when either ref flips. */
  blockedTilesShared(state: GameState): Set<string>;
  /** True if (x, y) holds a body other than `excludeId`. */
  isBlocked(state: GameState, x: number, y: number, excludeId?: string): boolean;
  /** Map of each MOVING body's CURRENT tile key → `{ id, target }`, where `target` is the next tile it
   *  intends to enter. Lets the move pass spot a head-on swap deadlock — A wants B's tile while B wants
   *  A's — and break it at once instead of waiting out MAX_BLOCKED_TICKS. Covers pawns AND mobs so a
   *  pawn↔mob head-on resolves too. MEMOISED on the (mobs, pawns) array refs (stable within a tick),
   *  like {@link blockedTilesShared}, so both move passes share one build. */
  movingTargets(state: GameState): Map<string, { id: string; target: string }>;
}

class OccupancyServiceImpl implements OccupancyService {
  private _sharedMobs: unknown = null;
  private _sharedPawns: unknown = null;
  private _sharedSet: Set<string> | null = null;
  private _mtMobs: unknown = null;
  private _mtPawns: unknown = null;
  private _mtMap: Map<string, { id: string; target: string }> | null = null;

  blockedTilesShared(state: GameState): Set<string> {
    if (this._sharedMobs === state.mobs && this._sharedPawns === state.pawns && this._sharedSet)
      return this._sharedSet;
    const s = this.blockedTiles(state);
    this._sharedMobs = state.mobs;
    this._sharedPawns = state.pawns;
    this._sharedSet = s;
    return s;
  }

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

  movingTargets(state: GameState): Map<string, { id: string; target: string }> {
    if (this._mtMobs === state.mobs && this._mtPawns === state.pawns && this._mtMap)
      return this._mtMap;
    const m = new Map<string, { id: string; target: string }>();
    for (const p of state.pawns) {
      if (p.isAlive === false || !p.position || !p.isMoving || !p.path?.length) continue;
      const t = p.path[p.pathIndex ?? 0];
      if (t) m.set(`${p.position.x},${p.position.y}`, { id: p.id, target: `${t.x},${t.y}` });
    }
    for (const mob of state.mobs ?? []) {
      if (mob.state === 'Corpse' || !mob.path?.length) continue;
      const t = mob.path[mob.pathIndex ?? 0];
      if (t) m.set(`${mob.x},${mob.y}`, { id: mob.id, target: `${t.x},${t.y}` });
    }
    this._mtMobs = state.mobs;
    this._mtPawns = state.pawns;
    this._mtMap = m;
    return m;
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
