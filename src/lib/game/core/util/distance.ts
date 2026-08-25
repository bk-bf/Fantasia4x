// Grid distance metrics — the single home for the distance math that used to be inlined ~40× across
// the pawn / mob / job target-finding code (entityHelpers, pawnHelpers, JobService, combat, hauling…).
//
// Scalar args (NOT point objects) on purpose: the hot per-tick AI loops (findNearestPrey, the
// predator-threat scan, mob movement) call these thousands of times a tick, so they must allocate
// nothing — passing `(ax, ay, bx, by)` avoids the temporary `{x,y}` a point-object signature forces.
// Pick the metric the old call used: Manhattan (4-neighbour / orthogonal step cost), Chebyshev
// (8-neighbour / "king move", what most range + adjacency checks use), or Euclidean.

/** Manhattan (taxicab) distance — |dx| + |dy|. Orthogonal-only step cost. */
export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/** Chebyshev (chessboard / "king move") distance — max(|dx|, |dy|). The 8-neighbour grid metric used
 *  by most range, adjacency and ring checks. */
export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Squared Euclidean distance — dx² + dy². Prefer this for "which is nearer" comparisons (no sqrt). */
export function euclideanSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** True Euclidean distance — √(dx² + dy²). Use `euclideanSq` when you only need to compare. */
export function euclidean(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(euclideanSq(ax, ay, bx, by));
}

/**
 * Linear nearest-by-metric scan: the smallest-`metric` item in `items`, or `null` if empty / nothing
 * within `maxDist`. Collapses the dozens of hand-rolled `let best; let bestDist = Infinity; for (…)`
 * loops scattered across the target-finders into one helper. Ties keep the FIRST item (matches the
 * old `d < bestDist`).
 *
 * Scope: use this for the COLD-path finders (buildings, zones, deposit points — a handful of
 * candidates, a few calls per tick). The per-tick HOT mob loops (findNearestPrey, predator scan) keep
 * their explicit loops — they need bespoke weighting/gating and must stay allocation-free, so they
 * call the scalar metrics above directly rather than allocate a `metric` closure per scan.
 */
export function findNearestBy<T>(
  items: Iterable<T>,
  metric: (item: T) => number,
  maxDist = Infinity
): T | null {
  let best: T | null = null;
  let bestDist = maxDist;
  for (const item of items) {
    const d = metric(item);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}
