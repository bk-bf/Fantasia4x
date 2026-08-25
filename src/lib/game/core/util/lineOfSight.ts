export type SightCell = { blocksSight?: boolean } | undefined;

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
    if (x === bx && y === by) return true;
    if (map[y]?.[x]?.blocksSight) return false;
  }
}
