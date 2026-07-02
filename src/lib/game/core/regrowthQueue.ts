/* filepath: src/lib/game/core/regrowthQueue.ts */
/**
 * Regrowth schedule — a min-heap of `(turn, x, y)` for the soonest-expiring resource cooldowns.
 *
 * ENGINE-PERFORMANCE-II §S2. `processResourceRegrowth` used to scan the WHOLE worldMap every tick just
 * to check whether any cooldown had expired (562,500 tiles at 750² → ~886ms/tick in the trace). This
 * heap lets the engine ask "is anything due this tick?" in O(1) (`peekRegrowthTurn`) and process only
 * the due tiles in O(#due · log n).
 *
 * Fed from two places:
 *   • the harvest set-site (`jobs/harvest.ts`) pushes a tile's soonest cooldown when it's set — during
 *     play the worldMap ref is stable (in-place mutation), so new cooldowns can't be discovered by a
 *     rescan;
 *   • `rebuildRegrowthQueue(worldMap)` scans ONCE on a map REPLACE (load / regen / test), so cooldowns
 *     already on disk are scheduled.
 *
 * Entries are advisory: a tile may be re-harvested before it regrows, or already processed — such
 * STALE entries just pop and are skipped (the consumer re-checks the tile's live cooldowns). After
 * processing a tile the consumer re-pushes it with its next-soonest remaining expiry.
 */

import type { WorldTile } from '../core/types';

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

/** Schedule a tile to be re-checked at `turn` (its soonest cooldown expiry). */
export function pushRegrowth(turn: number, x: number, y: number): void {
  heap.push({ turn, x, y });
  siftUp(heap.length - 1);
}

/** Turn of the soonest scheduled entry, or `Infinity` if the queue is empty. */
export function peekRegrowthTurn(): number {
  return heap.length > 0 ? heap[0].turn : Infinity;
}

/** Remove + return the soonest entry, or `undefined` if empty. */
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

/** The soonest expiry turn among a tile's cooldowns, or `Infinity` if none. */
export function minCooldownExpiry(cooldowns: Record<string, number> | undefined): number {
  if (!cooldowns) return Infinity;
  let min = Infinity;
  for (const k in cooldowns) {
    const v = cooldowns[k];
    if (v < min) min = v;
  }
  return min;
}

/** Reset the schedule (tests / hard resets). */
export function clearRegrowthQueue(): void {
  heap = [];
}

/**
 * Rebuild the schedule from a worldMap — called once on a map REPLACE (load / regen / test). Scans the
 * map (O(map), but only on replace, never per-tick) and pushes each tile's soonest cooldown.
 */
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
