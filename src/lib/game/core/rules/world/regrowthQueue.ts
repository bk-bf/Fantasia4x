import type { WorldTile } from '../../types';

interface RegrowthEntry {
  turn: number;
  x: number;
  y: number;
}

let heap: RegrowthEntry[] = [];

function swap(i: number, j: number): void {
  const t = heap[i];
  heap[i] = heap[j];
  heap[j] = t;
}

function siftUp(i: number): void {
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p].turn <= heap[i].turn) break;
    swap(i, p);
    i = p;
  }
}

function siftDown(i: number): void {
  const n = heap.length;
  for (;;) {
    let s = i;
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    if (l < n && heap[l].turn < heap[s].turn) s = l;
    if (r < n && heap[r].turn < heap[s].turn) s = r;
    if (s === i) break;
    swap(i, s);
    i = s;
  }
}

export function pushRegrowth(turn: number, x: number, y: number): void {
  heap.push({ turn, x, y });
  siftUp(heap.length - 1);
}

export function peekRegrowthTurn(): number {
  return heap.length > 0 ? heap[0].turn : Infinity;
}

export function popRegrowth(): RegrowthEntry | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    siftDown(0);
  }
  return top;
}

export function minCooldownExpiry(cooldowns: Record<string, number> | undefined): number {
  if (!cooldowns) return Infinity;
  let min = Infinity;
  for (const k in cooldowns) {
    const v = cooldowns[k];
    if (v < min) min = v;
  }
  return min;
}

export function clearRegrowthQueue(): void {
  heap = [];
}

export function rebuildRegrowthQueue(worldMap: WorldTile[][]): void {
  heap = [];
  for (let y = 0; y < worldMap.length; y++) {
    const row = worldMap[y];
    for (let x = 0; x < row.length; x++) {
      const min = minCooldownExpiry(row[x].resourceCooldowns);
      if (min !== Infinity) pushRegrowth(min, x, y);
    }
  }
}
