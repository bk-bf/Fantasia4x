import type { GameState } from '../core/types';
import { tileKey } from '../core/util/tileKey';

export interface OccupancyService {
  blockedTiles(state: GameState, excludeId?: string): Set<number>;
  blockedTilesShared(state: GameState): Set<number>;
  isBlocked(state: GameState, x: number, y: number, excludeId?: string): boolean;
  movingTargets(state: GameState): Map<number, { id: string; target: number }>;
}

class OccupancyServiceImpl implements OccupancyService {
  private _sharedMobs: unknown = null;
  private _sharedPawns: unknown = null;
  private _sharedSet: Set<number> | null = null;
  private _mtMobs: unknown = null;
  private _mtPawns: unknown = null;
  private _mtMap: Map<number, { id: string; target: number }> | null = null;

  blockedTilesShared(state: GameState): Set<number> {
    if (this._sharedMobs === state.mobs && this._sharedPawns === state.pawns && this._sharedSet)
      return this._sharedSet;
    const s = this.blockedTiles(state);
    this._sharedMobs = state.mobs;
    this._sharedPawns = state.pawns;
    this._sharedSet = s;
    return s;
  }

  blockedTiles(state: GameState, excludeId?: string): Set<number> {
    const width = state.worldMap[0]?.length ?? 0;
    const occupied = new Set<number>();
    for (const p of state.pawns) {
      if (p.id === excludeId || !p.position || p.isAlive === false) continue;
      occupied.add(tileKey(p.position.x, p.position.y, width));
    }
    for (const m of state.mobs ?? []) {
      if (m.id === excludeId || m.state === 'Corpse') continue;
      occupied.add(tileKey(m.x, m.y, width));
    }
    return occupied;
  }

  movingTargets(state: GameState): Map<number, { id: string; target: number }> {
    if (this._mtMobs === state.mobs && this._mtPawns === state.pawns && this._mtMap)
      return this._mtMap;
    const width = state.worldMap[0]?.length ?? 0;
    const m = new Map<number, { id: string; target: number }>();
    for (const p of state.pawns) {
      if (p.isAlive === false || !p.position || !p.isMoving || !p.path?.length) continue;
      const t = p.path[p.pathIndex ?? 0];
      if (t)
        m.set(tileKey(p.position.x, p.position.y, width), {
          id: p.id,
          target: tileKey(t.x, t.y, width)
        });
    }
    for (const mob of state.mobs ?? []) {
      if (mob.state === 'Corpse' || !mob.path?.length) continue;
      const t = mob.path[mob.pathIndex ?? 0];
      if (t) m.set(tileKey(mob.x, mob.y, width), { id: mob.id, target: tileKey(t.x, t.y, width) });
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
