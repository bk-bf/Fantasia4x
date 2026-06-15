import type { Pawn } from './types';

/**
 * O(1) pawn lookup by id, replacing the `gameState.pawns.find(p => p.id === id)` linear scans that
 * were ~12% of worker CPU (the `find` hot line — 140 mobs each scanning 150 pawns for a hunt target,
 * + the per-pawn state/morale passes). A `Map<id, Pawn>` is memoised on the **pawns array reference**:
 * it rebuilds only when the array ref changes (pawn add/remove, or an immutable rebuild). The hot
 * callers query a STABLE array across many lookups — the mob FSM during `stepEntities` (pawns are
 * read-only there) and `processPawnTurn` (in-place updates keep the same array ref) — so one O(n)
 * build serves hundreds of O(1) gets per tick.
 *
 * Safe with the ADR-002 in-place mutation model: the map stores live pawn references, so in-place
 * field mutation is reflected automatically; only add/remove changes the array ref and invalidates.
 * Single-threaded (worker/main) so the module-level cache needs no locking; querying a different
 * array (e.g. a freshly-rebuilt state mid-tick) just rebuilds — worst case O(n), same as `.find`.
 */
let cachedArr: readonly Pawn[] | null = null;
let cachedMap = new Map<string, Pawn>();

export function pawnById(pawns: readonly Pawn[], id: string): Pawn | undefined {
  if (pawns !== cachedArr) {
    cachedMap = new Map();
    for (const p of pawns) cachedMap.set(p.id, p);
    cachedArr = pawns;
  }
  return cachedMap.get(id);
}
