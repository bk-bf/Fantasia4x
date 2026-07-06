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
  /**
   * What changed on the tile — routes the RENDER repaint on the main thread:
   *  • 'terrain' (the default) — regrowth/harvest/mining/building etc. → the ADR-026 incremental
   *    terrain+resource repaint (and the snow cell, since features affect sprite eligibility).
   *  • 'snow' — ONLY `tile.snow`/`tile.ice` moved (accumulateSnow, debug sliders) → repaints ONLY the
   *    blended snow layer. This is what stops a snow-onset wave (every snowable tile crossing a render
   *    bucket in one tick) from re-baking the whole terrain/resource grid — the snow-hiccup fix.
   * A tile hit by BOTH kinds in one flush window keeps 'terrain' (the superset repaint).
   */
  kind: 'terrain' | 'snow';
}

// Keyed by "y,x" so repeated changes to the same tile within a flush window collapse to one entry.
const dirty = new Map<string, TileDelta>();

/** Record that `worldMap[y][x]` was mutated in place this tick. */
export function markTileDirty(
  y: number,
  x: number,
  tile: WorldTile,
  kind: 'terrain' | 'snow' = 'terrain'
): void {
  const key = y + ',' + x;
  // 'terrain' wins a collision — it repaints the snow cell too, but not vice versa.
  const prev = dirty.get(key);
  dirty.set(key, { y, x, tile, kind: prev?.kind === 'terrain' ? 'terrain' : kind });
}

/** Drain accumulated tile deltas for the current flush, or `null` if none changed. */
export function drainTileDeltas(): TileDelta[] | null {
  if (dirty.size === 0) return null;
  const out = Array.from(dirty.values());
  dirty.clear();
  return out;
}

/**
 * Drain ALL terrain deltas but at most `snowBudget` SNOW deltas, leaving the rest of the snow deltas
 * queued for later flushes. A whole-map snow onset/melt (or the debug slider) marks ~one delta PER TILE
 * in a single tick; shipping all ~150k in one snapshot cost ~800ms on the main thread (structured-clone
 * deserialize + merge). Capping the snow deltas per flush spreads that wave across snapshots so no single
 * postMessage is huge. Terrain deltas are NEVER held back (they're gameplay-latency-sensitive and few).
 * Returns `null` when nothing was drained this flush. Snow deltas keep `snowRev` bumping each flush they
 * ship, so the main thread stays triggered until the queue empties.
 */
export function drainTileDeltasBudgeted(snowBudget: number): TileDelta[] | null {
  if (dirty.size === 0) return null;
  const out: TileDelta[] = [];
  let snow = 0;
  for (const [key, d] of dirty) {
    if (d.kind === 'snow') {
      if (snow >= snowBudget) continue; // hold this snow delta for a later flush
      snow++;
    }
    out.push(d);
    dirty.delete(key); // safe to delete the current entry mid-iteration
  }
  return out.length ? out : null;
}

/** Discard pending deltas (a full worldMap send already carries the same changes). */
export function clearTileDeltas(): void {
  dirty.clear();
}
