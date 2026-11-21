export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Area {
  left: number;
  right: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 8;
const EDGE = 6;
const CASCADE = 26;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

export function placeWindow(placed: Rect[], w: number, h: number, area: Area): Point {
  const x0 = area.left + GAP;
  const x1 = area.width - area.right - GAP;
  const fits = (edge: number) => (c: Point) =>
    c.x + w <= edge &&
    c.y + h <= area.height - EDGE &&
    !placed.some((r) => overlaps({ x: c.x, y: c.y, w, h }, r));
  const spots: Point[] = [
    { x: w > x1 - x0 ? Math.max(4, Math.round((area.width - w) / 2)) : x0, y: area.top },
    ...placed.map((r) => ({ x: r.x + r.w + GAP, y: r.y })),
    ...placed.map((r) => ({ x: r.x, y: r.y + r.h + GAP }))
  ];
  const p = spots.find(fits(x1)) ??
    spots.find(fits(area.width - EDGE)) ?? {
      x: x0 + CASCADE * placed.length,
      y: area.top + CASCADE * placed.length
    };
  return { x: p.x, y: Math.max(4, Math.min(p.y, area.height - h - EDGE)) };
}

export function centreWindow(w: number, h: number, area: Area): Point {
  return {
    x: Math.round((area.width - w) / 2),
    y: Math.max(area.top, Math.round((area.height - h) / 2.4))
  };
}

export function dragTo(p: Point, w: number, area: Area): Point {
  return {
    x: Math.min(Math.max(p.x, 40 - w), area.width - 40),
    y: Math.min(Math.max(p.y, 0), area.height - 28)
  };
}
