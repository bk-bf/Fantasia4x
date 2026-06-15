import type { WorldTile } from './types';

/**
 * Worker-side accumulator of tiles changed IN PLACE during a tick (ADR-021 §4c "worldMap deltas").
 *
 * The worldMap is 38k+ tiles. Re-cloning the whole array across the worker→main boundary every time
 * a single tile changes was the harvest-time TPS killer: `processResourceRegrowth` rebuilt the entire
 * map (and flipped its ref → full structured-clone re-send) on every tick a regrowth cooldown expired,
 * which during active 150-pawn harvesting is nearly every tick. The fix is to mutate the handful of
 * affected tiles in place (ADR-002 amendment — hot per-tick sim phases mutate in place) and ship only
 * those tiles as a delta.
 *
 * The sim is single-threaded inside the worker, so a module-level singleton buffer is safe: mutators
 * (`processResourceRegrowth`, …) call {@link markTileDirty}; the snapshot publisher drains it once per
 * flush via {@link drainTileDeltas}. A full worldMap send supersedes pending deltas → {@link clearTileDeltas}.
 */
export interface TileDelta {
  y: number;
  x: number;
  tile: WorldTile;
}

// Keyed by "y,x" so repeated changes to the same tile within a flush window collapse to one entry.
const dirty = new Map<string, TileDelta>();

/** Record that `worldMap[y][x]` was mutated in place this tick. */
export function markTileDirty(y: number, x: number, tile: WorldTile): void {
  dirty.set(y + ',' + x, { y, x, tile });
}

/** Drain accumulated tile deltas for the current flush, or `null` if none changed. */
export function drainTileDeltas(): TileDelta[] | null {
  if (dirty.size === 0) return null;
  const out = Array.from(dirty.values());
  dirty.clear();
  return out;
}

/** Discard pending deltas (a full worldMap send already carries the same changes). */
export function clearTileDeltas(): void {
  dirty.clear();
}
