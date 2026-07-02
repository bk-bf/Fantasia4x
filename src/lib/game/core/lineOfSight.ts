/** Minimal shape `hasLineOfSight` reads — the `blocksSight` tile flag baked alongside `walkable`. */
export type SightCell = { blocksSight?: boolean } | undefined;

/**
 * Combat line-of-sight (Part VII occluder model): a bounded Bresenham walk from shooter (ax,ay) to
 * target (bx,by). If any INTERMEDIATE cell carries the baked `blocksSight` flag (a wall / natural rock
 * — set the way `walkable` is, so this reads ONE field per cell, no per-cell building lookup) the shot
 * is blocked. The two endpoints are never tested: a shooter may fire from behind their own cover and a
 * target hugging a wall is still hittable. Per-shot, read-only, ≤ weapon-range cells, cadence-gated —
 * combat-local, NOT the parked WASM fog-of-war raycast (ADR-019). Pure geometry over core tile data,
 * so it lives in core — shared by ranged combat (systems) and mob aggro/hunt AI (services).
 */
export function hasLineOfSight(
  map: SightCell[][],
  ax: number,
  ay: number,
  bx: number,
  by: number
): boolean {
  if (ax === bx && ay === by) return true;
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx - dy;
  let x = ax;
  let y = ay;
  for (;;) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x === bx && y === by) return true; // reached the target tile (endpoint never blocks)
    if (map[y]?.[x]?.blocksSight) return false; // an intermediate occluder breaks the line
  }
}
