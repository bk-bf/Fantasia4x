import type { GameState } from '../core/types';
import { tileKey } from '../core/util/tileKey';

export interface OccupancyService {
  blockedTiles(state: GameState, excludeId?: string): Set<number>;
  blockedTilesShared(state: GameState): Set<number>;
  isBlocked(state: GameState, x: number, y: number, excludeId?: string): boolean;
  movingTargets(state: GameState): Map<number, { id: string; target: number }>;
  indexTiles(state: GameState): void;
  dropTileIndex(): void;
}

interface TileIndex {
  pawns: GameState['pawns'];
  mobs: GameState['mobs'];
  width: number;
  height: number;
  head: Int32Array;
  next: Int32Array;
  ids: string[];
}

function onGrid(x: number, y: number, width: number, height: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
}

class OccupancyServiceImpl implements OccupancyService {
  private _sharedMobs: unknown = null;
  private _sharedPawns: unknown = null;
  private _sharedSet: Set<number> | null = null;
  private _mtMobs: unknown = null;
  private _mtPawns: unknown = null;
  private _mtMap: Map<number, { id: string; target: number }> | null = null;
  private _tiles: TileIndex | null = null;
  private _head = new Int32Array(0);
  private _written: number[] = [];

  indexTiles(state: GameState): void {
    this._tiles = null;
    const height = state.worldMap.length;
    const width = state.worldMap[0]?.length ?? 0;
    let head = this._head;
    const written = this._written;
    if (head.length !== width * height) {
      head = this._head = new Int32Array(width * height).fill(-1);
    } else {
      for (let i = 0; i < written.length; i++) head[written[i]] = -1;
    }
    written.length = 0;
    const pawns = state.pawns;
    const mobs = state.mobs ?? [];
    const next = new Int32Array(pawns.length + mobs.length);
    const ids: string[] = [];
    const np = pawns.length;
    for (let j = 0; j < np + mobs.length; j++) {
      let x: number;
      let y: number;
      let id: string;
      if (j < np) {
        const pos = pawns[j].position;
        if (!pos) continue;
        x = pos.x;
        y = pos.y;
        id = pawns[j].id;
      } else {
        const m = mobs[j - np];
        if (m.state === 'Corpse') continue;
        x = m.x;
        y = m.y;
        id = m.id;
      }
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= width ||
        y >= height
      )
        return;
      const k = y * width + x;
      const i = ids.length;
      ids.push(id);
      next[i] = head[k];
      head[k] = i;
      written.push(k);
    }
    this._tiles = { pawns, mobs: state.mobs, width, height, head, next, ids };
  }

  dropTileIndex(): void {
    this._tiles = null;
  }

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
    const ix = this._tiles;
    if (
      ix &&
      ix.pawns === state.pawns &&
      ix.mobs === state.mobs &&
      onGrid(x, y, ix.width, ix.height)
    ) {
      for (let i = ix.head[y * ix.width + x]; i >= 0; i = ix.next[i])
        if (ix.ids[i] !== excludeId) return true;
      return false;
    }
    const pawns = state.pawns;
    for (let i = 0; i < pawns.length; i++) {
      const p = pawns[i];
      const pos = p.position;
      if (pos && pos.x === x && pos.y === y && p.id !== excludeId) return true;
    }
    const mobs = state.mobs;
    if (!mobs) return false;
    for (let i = 0; i < mobs.length; i++) {
      const m = mobs[i];
      if (m.x === x && m.y === y && m.state !== 'Corpse' && m.id !== excludeId) return true;
    }
    return false;
  }
}

export const occupancyService: OccupancyService = new OccupancyServiceImpl();
