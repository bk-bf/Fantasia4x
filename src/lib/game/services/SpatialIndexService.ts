/**
 * SpatialIndexService — in-process uniform-grid index for nearest-entity queries (ADR-008).
 *
 * The sim's nearest-entity scans (`nearestPawn`, `nearestPredatorThreat`, `nearestAdjacentHostile`)
 * were each O(n) over all pawns/mobs, run per-entity per-tick → O(n²). Profiling put `nearestPawn`
 * alone at ~4.4% of sim-worker time. This bins entities into fixed cells once, so a query expands
 * cell-rings outward from the origin and stops as soon as no unsearched cell can hold anything
 * closer than the best hit so far.
 *
 * ADR-008 keeps spatial logic behind a service interface. The chosen IMPLEMENTATION here is plain
 * TypeScript (not Rust/WASM) on purpose: the R1 spike showed that any per-tick Rust core pays a
 * position-marshalling boundary tax that erased the compute win (rust-soa was only ~1.2–1.4× over
 * mutable JS). A nearest-entity index would need that same ~290-entity sync every tick, so an
 * in-process grid — zero boundary cost — is the right tool. Callers still depend only on this
 * interface, so a future WASM impl could drop in if the boundary math ever changes.
 *
 * Indexes are built fresh by the caller right before the loop that queries them (e.g. once per
 * `stepEntities` pass), so they always reflect current positions — no cross-tick cache, no
 * invalidation, no staleness.
 */

/** Distance metric over a delta. */
export type DistanceMetric = (dx: number, dy: number) => number;

/** 4-connected / cardinal distance. */
export const MANHATTAN: DistanceMetric = (dx, dy) => Math.abs(dx) + Math.abs(dy);
/** 8-connected / king-move distance (matches the sim's `dist()` for mobs). */
export const CHEBYSHEV: DistanceMetric = (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy));

export interface NearestOptions<T> {
  /** Distance metric (default MANHATTAN). */
  metric?: DistanceMetric;
  /** Inclusive max tile distance to consider (default Infinity). */
  maxDist?: number;
  /** Optional predicate; only items returning true are candidates. */
  filter?: (item: T) => boolean;
}

export interface SpatialIndex<T> {
  /** Nearest item to (x, y) satisfying `opts`, or null if none. */
  nearest(x: number, y: number, opts?: NearestOptions<T>): T | null;
  readonly size: number;
}

export interface SpatialIndexService {
  /**
   * Bucket `items` into a uniform grid by their (getX, getY) tile position. `cellSize` trades ring
   * count (larger = fewer rings for far queries) against per-cell scan size (smaller = fewer items
   * touched for tight `maxDist` queries like adjacency).
   */
  build<T>(
    items: readonly T[],
    getX: (item: T) => number,
    getY: (item: T) => number,
    cellSize?: number
  ): SpatialIndex<T>;
}

// Tile coords are non-negative grid indices (< a few thousand); pack the cell coord pair into one
// numeric Map key. STRIDE comfortably exceeds any cell count for our map sizes.
const STRIDE = 1 << 16;
const cellKey = (cx: number, cy: number): number => cx * STRIDE + cy;

class UniformGrid<T> implements SpatialIndex<T> {
  private readonly cells = new Map<number, T[]>();
  private readonly cs: number;
  private readonly getX: (item: T) => number;
  private readonly getY: (item: T) => number;
  // Occupied-cell extent, so ring expansion terminates instead of scanning the whole plane.
  private minCX = Infinity;
  private maxCX = -Infinity;
  private minCY = Infinity;
  private maxCY = -Infinity;
  public size = 0;

  constructor(
    items: readonly T[],
    getX: (item: T) => number,
    getY: (item: T) => number,
    cellSize: number
  ) {
    this.cs = cellSize;
    this.getX = getX;
    this.getY = getY;
    for (const item of items) {
      const cx = Math.floor(getX(item) / cellSize);
      const cy = Math.floor(getY(item) / cellSize);
      const k = cellKey(cx, cy);
      let bucket = this.cells.get(k);
      if (!bucket) this.cells.set(k, (bucket = []));
      bucket.push(item);
      if (cx < this.minCX) this.minCX = cx;
      if (cx > this.maxCX) this.maxCX = cx;
      if (cy < this.minCY) this.minCY = cy;
      if (cy > this.maxCY) this.maxCY = cy;
      this.size++;
    }
  }

  nearest(x: number, y: number, opts?: NearestOptions<T>): T | null {
    if (this.size === 0) return null;
    const metric = opts?.metric ?? MANHATTAN;
    const maxDist = opts?.maxDist ?? Infinity;
    const filter = opts?.filter;
    const cs = this.cs;
    const qcx = Math.floor(x / cs);
    const qcy = Math.floor(y / cs);

    // How far (in cell rings) the occupied area extends from the query cell — the hard stop.
    const maxRing = Math.max(
      qcx - this.minCX,
      this.maxCX - qcx,
      qcy - this.minCY,
      this.maxCY - qcy
    );

    let best: T | null = null;
    let bestDist = Infinity;

    for (let r = 0; r <= maxRing; r++) {
      // Lower bound on tile distance for any point in ring r (or any further ring): a cell at
      // chebyshev cell-distance r is at least (r-1)*cs+1 tiles away on its nearest axis, and both
      // metrics are ≥ that single-axis gap. So once we have a hit closer than this, stop.
      const ringMin = r === 0 ? 0 : (r - 1) * cs + 1;
      if (ringMin > maxDist) break;
      if (best !== null && bestDist < ringMin) break;
      this.scanRing(qcx, qcy, r, (item) => {
        if (filter && !filter(item)) return;
        const d = metric(this.getX(item) - x, this.getY(item) - y);
        if (d <= maxDist && d < bestDist) {
          bestDist = d;
          best = item;
        }
      });
    }
    return best;
  }

  /** Visit every item in the square cell-ring at chebyshev cell-distance `r` from (cx, cy). */
  private scanRing(cx: number, cy: number, r: number, visit: (item: T) => void): void {
    if (r === 0) {
      this.scanCell(cx, cy, visit);
      return;
    }
    for (let dx = -r; dx <= r; dx++) {
      // Top and bottom edges of the ring.
      this.scanCell(cx + dx, cy - r, visit);
      this.scanCell(cx + dx, cy + r, visit);
    }
    for (let dy = -r + 1; dy <= r - 1; dy++) {
      // Left and right edges (corners already done above).
      this.scanCell(cx - r, cy + dy, visit);
      this.scanCell(cx + r, cy + dy, visit);
    }
  }

  private scanCell(cx: number, cy: number, visit: (item: T) => void): void {
    const bucket = this.cells.get(cellKey(cx, cy));
    if (!bucket) return;
    for (let i = 0; i < bucket.length; i++) visit(bucket[i]);
  }
}

class SpatialIndexServiceImpl implements SpatialIndexService {
  build<T>(
    items: readonly T[],
    getX: (item: T) => number,
    getY: (item: T) => number,
    cellSize = 8
  ): SpatialIndex<T> {
    return new UniformGrid(items, getX, getY, cellSize);
  }
}

export const spatialIndexService: SpatialIndexService = new SpatialIndexServiceImpl();
