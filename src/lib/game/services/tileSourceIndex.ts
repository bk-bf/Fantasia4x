import type { WorldTile } from '../core/types';
import { watchTerrainTiles } from '../core/state/tileDeltas';

interface TileEntry<T> {
  sig: string;
  sources: T[];
}

export class TileSourceIndex<T> {
  private mapRef: WorldTile[][] | null = null;
  private width = 0;
  private byTile = new Map<number, TileEntry<T>>();
  private list: T[] = [];
  private ids: ReadonlySet<string> | null = null;
  private readonly dirty = watchTerrainTiles();
  version = 0;

  constructor(
    private readonly sourceOf: (id: string, x: number, y: number) => T | null,
    private readonly sourceIds: () => Iterable<string>
  ) {}

  sources(worldMap: WorldTile[][]): T[] {
    if (worldMap !== this.mapRef) this.rescan(worldMap);
    else if (this.dirty.size > 0 && this.applyDirty()) this.relist();
    this.dirty.clear();
    return this.list;
  }

  private applyDirty(): boolean {
    const ids = this.idSet();
    const map = this.mapRef!;
    let changed = false;
    for (const tile of this.dirty.values()) {
      const { x, y } = tile;
      if (map[y]?.[x] !== tile) continue;
      const key = y * this.width + x;
      const prev = this.byTile.get(key);
      const next = tile.resources ? this.entryFor(tile.resources, x, y, ids) : null;
      if ((prev?.sig ?? '') === (next?.sig ?? '')) continue;
      if (next) this.byTile.set(key, next);
      else this.byTile.delete(key);
      changed = true;
    }
    return changed;
  }

  private idSet(): ReadonlySet<string> {
    return (this.ids ??= new Set(this.sourceIds()));
  }

  private entryFor(
    res: Record<string, number>,
    x: number,
    y: number,
    ids: ReadonlySet<string>
  ): TileEntry<T> | null {
    let sig = '';
    let sources: T[] | null = null;
    for (const id in res) {
      if ((res[id] ?? 0) <= 0 || !ids.has(id)) continue;
      const source = this.sourceOf(id, x, y);
      if (!source) continue;
      (sources ??= []).push(source);
      sig += id + ',';
    }
    return sources ? { sig, sources } : null;
  }

  private rescan(worldMap: WorldTile[][]): void {
    this.mapRef = worldMap;
    this.width = worldMap[0]?.length ?? 0;
    this.byTile.clear();
    const ids = this.idSet();
    const list: T[] = [];
    for (let y = 0; y < worldMap.length; y++) {
      const row = worldMap[y];
      for (let x = 0; x < row.length; x++) {
        const res = row[x]?.resources;
        const entry = res ? this.entryFor(res, x, y, ids) : null;
        if (!entry) continue;
        this.byTile.set(y * this.width + x, entry);
        for (const s of entry.sources) list.push(s);
      }
    }
    this.list = list;
    this.version++;
  }

  private relist(): void {
    const keys = [...this.byTile.keys()].sort((a, b) => a - b);
    const list: T[] = [];
    for (const k of keys) for (const s of this.byTile.get(k)!.sources) list.push(s);
    this.list = list;
    this.version++;
  }
}
