export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function euclideanSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function euclidean(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(euclideanSq(ax, ay, bx, by));
}

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
