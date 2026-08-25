import type { GameState } from '../core/types';

export interface OccupancyService {
  blockedTiles(state: GameState, excludeId?: string): Set<string>;
  blockedTilesShared(state: GameState): Set<string>;
  isBlocked(state: GameState, x: number, y: number, excludeId?: string): boolean;
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
