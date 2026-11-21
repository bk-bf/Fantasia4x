import type { WorldTile } from '../../types';

interface GrowthEntry {
  turn: number;
  x: number;
  y: number;
}

export class GrowthQueue {
  private heap: GrowthEntry[] = [];
  private readonly queued = new Set<string>();

  private swap(i: number, j: number): void {
    const t = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = t;
  }

  private siftUp(i: number): void {
    const heap = this.heap;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].turn <= heap[i].turn) break;
      this.swap(i, p);
      i = p;
    }
  }

  private siftDown(i: number): void {
    const heap = this.heap;
    const n = heap.length;
    for (;;) {
      let s = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && heap[l].turn < heap[s].turn) s = l;
      if (r < n && heap[r].turn < heap[s].turn) s = r;
      if (s === i) break;
      this.swap(i, s);
      i = s;
    }
  }

  push(turn: number, x: number, y: number): void {
    const key = x + ',' + y;
    if (this.queued.has(key)) return;
    this.queued.add(key);
    this.heap.push({ turn, x, y });
    this.siftUp(this.heap.length - 1);
  }

  peek(): number {
    return this.heap.length > 0 ? this.heap[0].turn : Infinity;
  }

  pop(): GrowthEntry | undefined {
    const heap = this.heap;
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      this.siftDown(0);
    }
    this.queued.delete(top.x + ',' + top.y);
    return top;
  }

  size(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap = [];
    this.queued.clear();
  }

  enrol(tile: WorldTile, turn: number): void {
    tile.growthTurn = turn;
    this.push(turn + 1, tile.x, tile.y);
  }

  rebuild(worldMap: WorldTile[][], turn: number): void {
    this.clear();
    for (let y = 0; y < worldMap.length; y++) {
      const row = worldMap[y];
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        if (!tileIsGrowing(tile)) continue;
        if (tile.growthTurn === undefined) {
          const growth = tile.growth!;
          for (const id in growth) if (growth[id] < 100) growth[id] = 100;
          continue;
        }
        this.enrol(tile, turn);
      }
    }
  }
}

let active = new GrowthQueue();

export function useGrowthQueue(queue: GrowthQueue): void {
  active = queue;
}

export function pushGrowth(turn: number, x: number, y: number): void {
  active.push(turn, x, y);
}

export function peekGrowthTurn(): number {
  return active.peek();
}

export function popGrowth(): GrowthEntry | undefined {
  return active.pop();
}

export function growthQueueSize(): number {
  return active.size();
}

export function clearGrowthQueue(): void {
  active.clear();
}

export function enrolGrowth(tile: WorldTile, turn: number): void {
  active.enrol(tile, turn);
}

export function tileIsGrowing(tile: WorldTile): boolean {
  const growth = tile.growth;
  if (!growth) return false;
  for (const id in growth) if (growth[id] < 100) return true;
  return false;
}

export function rebuildGrowthQueue(worldMap: WorldTile[][], turn: number): void {
  active.rebuild(worldMap, turn);
}
