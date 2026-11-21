export const TILE = 32;
export const PATCH = 4;
export const LIFT = 22;
export const REACH = 10;
export const CELL_W = TILE + 2 * REACH;
export const CELL_H = REACH + LIFT + TILE + REACH;
export const CELL_X = -REACH;
export const CELL_Y = -REACH - LIFT;
export const PERIOD = TILE * PATCH;
export const TOP_SIZE = 1024;
export const TOP_MARK = [255, 0, 255];
const RIM_SHIFT = [0, 0.26, -0.2];
export const NEIGHBOURS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1]
];

const BIT = Object.fromEntries(
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((k, i) => [k, 1 << i])
);
const QUARTERS = [
  ['N', 'E', 'NE'],
  ['S', 'E', 'SE'],
  ['S', 'W', 'SW'],
  ['N', 'W', 'NW']
];
const MAX_INSET = 14;
const ROUND = 10;
const JUNCTION = 7;
const SEEDS = { vertical: 171, horizontal: 181 };
const HALF = TILE / 2;
const SIDES = [
  { dx: 0, dy: -1, vertical: false },
  { dx: 0, dy: 1, vertical: false },
  { dx: -1, dy: 0, vertical: true },
  { dx: 1, dy: 0, vertical: true }
];

export function blobLayout(layout = 0) {
  let out = layout & (BIT.N | BIT.E | BIT.S | BIT.W);
  for (const [v, h, d] of QUARTERS) if (layout & BIT[v] && layout & BIT[h]) out |= layout & BIT[d];
  return out;
}

export const BLOB_LAYOUTS = [...new Set(Array.from({ length: 256 }, (_, m) => blobLayout(m)))].sort(
  (a, b) => a - b
);

export function layoutMass(layout = 0, cx = 0, cy = 0) {
  const grid = [false, false, false, false, true, false, false, false, false];
  NEIGHBOURS.forEach(
    ([dx, dy], bit) => (grid[(dy + 1) * 3 + dx + 1] = (layout & (1 << bit)) !== 0)
  );
  return (tx = 0, ty = 0) => {
    const dx = tx - cx + 1,
      dy = ty - cy + 1;
    return dx >= 0 && dx < 3 && dy >= 0 && dy < 3 && grid[dy * 3 + dx];
  };
}

const wrap = (v = 0, q = PERIOD) => ((v % q) + q) % q;
const reach = (k = 0) => Math.max(0, Math.min(REACH, k - 2, TILE - 3 - k));

function notch(dx = 0, dy = 0, iv = 0, ih = 0) {
  if (dx >= iv || dy >= ih) return true;
  const r = Math.min(iv, ih) - 1;
  if (r <= 0) return false;
  const cx = iv - r,
    cy = ih - r;
  return dx > cx && dy > cy && (dx - cx) ** 2 + (dy - cy) ** 2 > r * r;
}

function corner(dx = 0, dy = 0, iv = 0, ih = 0) {
  if (dx < iv || dy < ih) return false;
  const r = Math.min(ROUND, HALF - 1 - iv, HALF - 1 - ih);
  const a = dx - Math.max(iv, 0),
    b = dy - Math.max(ih, 0);
  if (r <= 0 || a >= r || b >= r) return true;
  return (r - a) ** 2 + (r - b) ** 2 <= r * r;
}

const colour = [0, 0, 0];
const ART_SHAPE = {
  P: { rock: [colour] },
  clamp: (v = 0, lo = 0, hi = 0) => Math.min(hi, Math.max(lo, v)),
  pn: (x = 0, y = 0, fx = 0, fy = 0, seed = 0) => x + y + fx + fy + seed,
  rockFace: (x = 0, y = 0, fy = 0, fh = 0) => [x, y, fy + fh],
  rp: (ramp = [colour], t = 0, x = 0, y = 0, d = 0) => ramp[Math.round(t + x + y + d)],
  lit: (c = colour, k = 0) => c.map((v) => v * k),
  dark: (c = colour, k = 0) => c.map((v) => v * k)
};

export function rockArt(A = ART_SHAPE) {
  const offsets = new Float64Array(2 * PATCH * PERIOD).fill(NaN);
  const offset = (along = 0, edge = 0, seed = 0) => {
    const a = wrap(along),
      e = wrap(edge);
    const i = ((seed === SEEDS.vertical ? 0 : 1) * PATCH + e / TILE) * PERIOD + a;
    if (Number.isNaN(offsets[i])) {
      const o =
        1 +
        (A.pn(a, e, 0.042, 0.042, seed) - 0.5) * 30 +
        (A.pn(a, e, 0.155, 0.155, seed + 1) - 0.5) * 4 +
        JUNCTION * Math.cos((Math.PI * (a % TILE)) / TILE) ** 2;
      const r = reach(a % TILE);
      const out = o >= 0 ? o : r > 0 ? -r * Math.tanh(-o / r) : 1;
      offsets[i] = A.clamp(out, r > 0 ? -r : 1, MAX_INSET);
    }
    return offsets[i];
  };
  const vertical = (y = 0, ex = 0) => offset(y, ex, SEEDS.vertical);
  const horizontal = (x = 0, ey = 0) => offset(x, ey, SEEDS.horizontal);

  function footprint(mass = (tx = 0, ty = 0) => tx === ty, x = 0, y = 0) {
    const tx = Math.floor(x / TILE),
      ty = Math.floor(y / TILE);
    const sx = x - tx * TILE < HALF ? -1 : 1,
      sy = y - ty * TILE < HALF ? -1 : 1;
    const ex = (sx < 0 ? tx : tx + 1) * TILE,
      ey = (sy < 0 ? ty : ty + 1) * TILE;
    const dx = Math.abs(x + 0.5 - ex),
      dy = Math.abs(y + 0.5 - ey);
    const iv = vertical(y, ex),
      ih = horizontal(x, ey);
    const h = mass(tx + sx, ty),
      v = mass(tx, ty + sy);
    if (h && v) return mass(tx + sx, ty + sy) || notch(dx, dy, Math.max(iv, 1), Math.max(ih, 1));
    if (h) return dy >= ih;
    if (v) return dx >= iv;
    return corner(dx, dy, iv, ih);
  }

  function owner(mass = (tx = 0, ty = 0) => tx === ty, x = 0, y = 0) {
    const tx = Math.floor(x / TILE),
      ty = Math.floor(y / TILE);
    if (mass(tx, ty)) return footprint(mass, x, y) ? [tx, ty] : null;
    const lx = x - tx * TILE,
      ly = y - ty * TILE;
    for (const { dx, dy, vertical: v } of SIDES) {
      const ox = tx + dx,
        oy = ty + dy;
      if (!mass(ox, oy)) continue;
      const depth = v ? (dx < 0 ? lx : TILE - 1 - lx) : dy < 0 ? ly : TILE - 1 - ly;
      if (depth >= REACH) continue;
      const edge = v ? (dx < 0 ? tx : tx + 1) * TILE : (dy < 0 ? ty : ty + 1) * TILE;
      const s = v ? vertical(y, edge) : horizontal(x, edge);
      if (depth + 0.5 >= -s) continue;
      const fx = v ? edge - (dx < 0 ? 1 : 0) : x,
        fy = v ? y : edge - (dy < 0 ? 1 : 0);
      if (footprint(mass, fx, fy)) return [ox, oy];
    }
    return null;
  }

  const rock = (mass = (tx = 0, ty = 0) => tx === ty, x = 0, y = 0) => owner(mass, x, y) !== null;

  function paintPixel(
    mass = (tx = 0, ty = 0) => tx === ty,
    x = 0,
    y = 0,
    put = (px = 0, py = 0, c = colour) => {
      void [px, py, c];
    }
  ) {
    const open = { l: !rock(mass, x - 1, y), r: !rock(mass, x + 1, y), u: !rock(mass, x, y - 1) };
    const rim = open.u || open.l ? 1 : open.r ? 2 : 0;
    put(x, y - LIFT, [TOP_MARK[0], TOP_MARK[1] + rim, TOP_MARK[2]]);
    if (rock(mass, x, y + 1)) return;
    for (let fy = 0; fy < LIFT; fy++) {
      const fyy = y - LIFT + 1 + fy;
      let c = A.rockFace(x, fyy, fy, LIFT);
      if (open.l) c = A.lit(c, 1.14);
      else if (open.r) c = A.dark(c, 0.72);
      if (fy === LIFT - 1) c = A.dark(c, 0.6);
      put(x, fyy, c);
    }
  }

  function paintTile(
    mass = (tx = 0, ty = 0) => tx === ty,
    tx = 0,
    ty = 0,
    put = (px = 0, py = 0, c = colour) => {
      void [px, py, c];
    }
  ) {
    for (let ly = -REACH; ly < TILE + REACH; ly++)
      for (let lx = -REACH; lx < TILE + REACH; lx++) {
        const x = tx * TILE + lx,
          y = ty * TILE + ly;
        const o = owner(mass, x, y);
        if (o && o[0] === tx && o[1] === ty) paintPixel(mass, x, y, put);
      }
  }

  function paintOwned(
    mass = (tx = 0, ty = 0) => tx === ty,
    owns = (tx = 0, ty = 0) => tx === ty,
    area = { x0: 0, x1: 0, y0: 0, y1: 0 },
    put = (px = 0, py = 0, c = colour) => {
      void [px, py, c];
    }
  ) {
    for (let y = area.y0; y < area.y1; y++)
      for (let x = area.x0; x < area.x1; x++) {
        const o = owner(mass, x, y);
        if (o && owns(o[0], o[1])) paintPixel(mass, x, y, put);
      }
  }

  function piece(layout = 0) {
    const w = PATCH * CELL_W;
    const px = new Uint8ClampedArray(w * PATCH * CELL_H * 4);
    for (let cy = 0; cy < PATCH; cy++)
      for (let cx = 0; cx < PATCH; cx++)
        paintTile(layoutMass(layout, cx, cy), cx, cy, (x = 0, y = 0, c = colour) => {
          const col = cx * CELL_W + x - cx * TILE - CELL_X,
            row = cy * CELL_H + y - cy * TILE - CELL_Y;
          const i = (row * w + col) * 4;
          px[i] = c[0];
          px[i + 1] = c[1];
          px[i + 2] = c[2];
          px[i + 3] = 255;
        });
    return px;
  }

  return { rock, owner, paintTile, paintOwned, piece };
}

export function rockTop(
  A = {
    rockTone: (x = 0, y = 0) => x + y,
    rp: (ramp = [0], t = 0, x = 0, y = 0, d = 0) => ramp[Math.round(t + x + y + d)]
  }
) {
  const steps = [0, 1, 2, 3, 4, 5, 6];
  const px = new Uint8Array(TOP_SIZE * TOP_SIZE * 4);
  for (let y = 0; y < TOP_SIZE; y++)
    for (let x = 0; x < TOP_SIZE; x++) {
      const t = A.rockTone(x, y),
        i = (y * TOP_SIZE + x) * 4;
      RIM_SHIFT.forEach((shift, c) => (px[i + c] = A.rp(steps, t + shift, x, y, 0.3)));
      px[i + 3] = 255;
    }
  return px;
}
