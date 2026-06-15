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
 * It is a per-tick scan (O(pawns + mobs)); no spatial WASM is involved, so it
 * stays in TypeScript per ADR-008 (only A* / nearest-entity live behind the WASM
 * interface). Callers pass `excludeId` for the entity being pathed/moved so it is never
 * blocked by its own body.
 *
 * `blockedTiles` is memoized on the `(pawns, mobs)` array identities: movement commits
 * positions immutably (processMovement/advanceMobMovement rebuild the arrays via `.map()`),
 * so the refs change exactly when occupancy changes. Repeated calls with the same arrays — the
 * many per-pawn path-planning lookups in one phase — reuse the built set instead of rescanning
 * every body each time (it showed up hot in the sim profile). This is pure memoization: identical
 * inputs yield the identical result, so there is no staleness.
 */

import type { GameState, Pawn, Mob } from '../core/types';

export interface OccupancyService {
  /** Set of "x,y" keys for every body except `excludeId`. */
  blockedTiles(state: GameState, excludeId?: string): Set<string>;
  /** True if (x, y) holds a body other than `excludeId`. */
  isBlocked(state: GameState, x: number, y: number, excludeId?: string): boolean;
}

interface OccupancyCache {
  pawns: readonly Pawn[];
  mobs: readonly Mob[] | undefined;
  /** All occupied "x,y" tiles (no exclusions). */
  full: Set<string>;
  /** entity id → its tile key, for cheap excludeId derivation. */
  tileById: Map<string, string>;
  /** tile key → number of bodies on it (≥1), so excluding self never frees a shared tile. */
  count: Map<string, number>;
}

class OccupancyServiceImpl implements OccupancyService {
  private cache: OccupancyCache | null = null;

  private index(state: GameState): OccupancyCache {
    const c = this.cache;
    if (c && c.pawns === state.pawns && c.mobs === state.mobs) return c;

    const full = new Set<string>();
    const tileById = new Map<string, string>();
    const count = new Map<string, number>();
    const add = (id: string, key: string) => {
      full.add(key);
      tileById.set(id, key);
      count.set(key, (count.get(key) ?? 0) + 1);
    };
    for (const p of state.pawns) {
      if (!p.position || p.isAlive === false) continue;
      add(p.id, `${p.position.x},${p.position.y}`);
    }
    for (const m of state.mobs ?? []) {
      if (m.state === 'Corpse') continue;
      add(m.id, `${m.x},${m.y}`);
    }
    return (this.cache = { pawns: state.pawns, mobs: state.mobs, full, tileById, count });
  }

  blockedTiles(state: GameState, excludeId?: string): Set<string> {
    const idx = this.index(state);
    if (excludeId === undefined) return idx.full;
    const selfTile = idx.tileById.get(excludeId);
    // Excluded body absent, or its tile is shared by another body → the full set is already correct.
    if (selfTile === undefined || (idx.count.get(selfTile) ?? 0) > 1) return idx.full;
    // Sole occupant: drop just that tile. Clone so the shared cached set stays intact.
    const result = new Set(idx.full);
    result.delete(selfTile);
    return result;
  }

  isBlocked(state: GameState, x: number, y: number, excludeId?: string): boolean {
    // Point query, not on the hot path — kept as a live scan to preserve its exact original
    // semantics (notably: it counts dead-but-positioned pawns, which blockedTiles does not).
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
