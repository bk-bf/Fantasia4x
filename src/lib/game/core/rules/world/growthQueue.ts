import type { WorldTile } from '../../types';

interface GrowthEntry {
  turn: number;
  x: number;
  y: number;
}

let heap: GrowthEntry[] = [];
const queued = new Set<string>();

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

export function pushGrowth(turn: number, x: number, y: number): void {
  const key = x + ',' + y;
  if (queued.has(key)) return;
  queued.add(key);
  heap.push({ turn, x, y });
  siftUp(heap.length - 1);
}

export function peekGrowthTurn(): number {
  return heap.length > 0 ? heap[0].turn : Infinity;
}

export function popGrowth(): GrowthEntry | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    siftDown(0);
  }
  queued.delete(top.x + ',' + top.y);
  return top;
}

export function growthQueueSize(): number {
  return heap.length;
}

export function clearGrowthQueue(): void {
  heap = [];
  queued.clear();
}

export function enrolGrowth(tile: WorldTile, turn: number): void {
  tile.growthTurn = turn;
  pushGrowth(turn + 1, tile.x, tile.y);
}

export function tileIsGrowing(tile: WorldTile): boolean {
  const growth = tile.growth;
  if (!growth) return false;
  for (const id in growth) if (growth[id] < 100) return true;
  return false;
}

export function rebuildGrowthQueue(worldMap: WorldTile[][], turn: number): void {
  heap = [];
  queued.clear();
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
      enrolGrowth(tile, turn);
    }
  }
}
