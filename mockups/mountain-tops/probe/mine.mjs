import { distanceInside, TILE } from './field.mjs';

const CLEAR = 9;
const FEATHER = 30;
const FOOT = 23;
const STAND = 24;

const run = (x0, y0, x1, y1) => {
  const out = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y]);
  return out;
};

export const DIG = [
  ...run(76, 14, 76, 12),
  ...run(72, 12, 85, 12),
  ...run(85, 13, 85, 18),
  ...run(81, 11, 81, 11),
  ...run(80, 8, 82, 10),
  ...run(82, 7, 82, 4)
];

export const FOLK = [
  { kind: 'miner', at: [72, 12], flip: true },
  { kind: 'hauler', at: [78, 12] },
  { kind: 'smith', at: [80, 9] },
  { kind: 'cook', at: [82, 10], flip: true },
  { kind: 'miner', at: [82, 4] },
  { kind: 'guard', at: [76, 14] },
  { kind: 'hauler', at: [85, 16], flip: true },
  { kind: 'woodcutter', at: [20, 3] },
  { kind: 'farmer', at: [21, 2] }
];

export function excavate({ A, rock, mass, grain, M, LIFT, FW, FH, foot }) {
  const tiles = M / TILE;
  const gone = new Set(DIG.map(([tx, ty]) => `${tx + tiles},${ty + tiles}`));
  const left = (tx = 0, ty = 0) => mass(tx, ty) && !gone.has(`${tx},${ty}`);
  const xs = DIG.map(([tx]) => (tx + tiles) * TILE),
    ys = DIG.map(([, ty]) => (ty + tiles) * TILE);
  const pad = 3 * TILE;
  const box = {
    x0: Math.max(1, Math.min(...xs) - pad),
    x1: Math.min(FW - 1, Math.max(...xs) + TILE + pad),
    y0: Math.max(1, Math.min(...ys) - pad),
    y1: Math.min(FH - 1, Math.max(...ys) + TILE + pad)
  };
  const kept = Uint8Array.from(foot);
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) kept[y * FW + x] = foot[y * FW + x] && rock(left, x, y) ? 1 : 0;

  const colour = new Uint8Array(FW * FH * 3);
  const part = new Uint8Array(FW * FH);
  const PART = { floor: 1, face: 2, rimLit: 3, rimDark: 4 };
  const far = new Uint8Array(FW * FH).fill(1);
  const edgeUnder = (x, r) => {
    for (let y = r + LIFT - 1; y >= r; y--) if (kept[y * FW + x]) return y;
    return -1;
  };
  for (let r = box.y0; r < box.y1 - LIFT; r++)
    for (let x = box.x0; x < box.x1; x++) {
      const i = r * FW + x,
        under = (r + LIFT) * FW + x;
      let c = null;
      if (kept[under]) {
        if (!foot[under - FW] || !foot[under - 1] || !foot[under + 1]) continue;
        if (!kept[under - FW] || !kept[under - 1]) part[i] = PART.rimLit;
        else if (!kept[under + 1]) part[i] = PART.rimDark;
        continue;
      }
      const edge = edgeUnder(x, r);
      if (edge >= 0) {
        const fy = r - (edge - LIFT + 1);
        c = A.rockFace(x, r, fy, LIFT);
        if (!kept[edge * FW + x - 1]) c = A.lit(c, 1.14);
        else if (!kept[edge * FW + x + 1]) c = A.dark(c, 0.72);
        if (fy === LIFT - 1) c = A.dark(c, 0.6);
        part[i] = PART.face;
      } else if (foot[i]) {
        let t = 0.66 + (grain(x, r) - 0.6) * 1.1;
        for (let k = 1; k <= 6; k++) if (kept[(r - k) * FW + x]) t -= k < 3 ? 0.3 : 0.16;
        if (kept[(r + LIFT) * FW + x - 3]) t -= 0.16;
        c = A.rp(A.P.cave, t, x, r, 0.4);
        part[i] = PART.floor;
      } else continue;
      colour.set(c, i * 3);
      far[i] = 0;
    }
  const { dist: away } = distanceInside(far, FW, FH);

  const cover = (x, r) => {
    if (kept[(r + LIFT) * FW + x]) return r + LIFT;
    return edgeUnder(x, r);
  };
  const folk = new Uint8Array(FW * FH * 3);
  const ground = new Uint16Array(FW * FH);
  for (const f of FOLK) {
    const built = A.mkPawn(A.PAWNS[f.kind].o);
    const sprite = f.flip ? built.flip() : built;
    const ty = f.at[1] + tiles,
      ax = (f.at[0] + tiles) * TILE + TILE / 2,
      ay = ty * TILE + STAND,
      depth = ty * TILE + FOOT;
    for (let sy = 0; sy < sprite.h; sy++)
      for (let sx = 0; sx < sprite.w; sx++) {
        const c = sprite.c[sy * sprite.w + sx];
        if (!c) continue;
        const x = ax - sprite.ax + sx,
          r = ay - sprite.ay + sy;
        if (x < 0 || r < 0 || x >= FW || r >= FH - LIFT) continue;
        folk.set(c, (r * FW + x) * 3);
        ground[r * FW + x] = depth;
      }
  }

  const wobble = (x, y) => {
    const xi = Math.floor(x / 12),
      yi = Math.floor(y / 12),
      xf = x / 12 - xi,
      yf = y / 12 - yi;
    const a = A.hash(xi, yi, 401) * (1 - xf) + A.hash(xi + 1, yi, 401) * xf,
      b = A.hash(xi, yi + 1, 401) * (1 - xf) + A.hash(xi + 1, yi + 1, 401) * xf;
    return (a * (1 - yf) + b * yf - 0.5) * 12;
  };
  const seeThrough = (x, r) => {
    const d = away[r * FW + x];
    if (d >= CLEAR + FEATHER + 6) return false;
    const keep = (d + wobble(x, r) - CLEAR) / FEATHER;
    return keep <= A.dith(x, r) * 0.96 + 0.02;
  };
  return { part, PART, colour, folk, ground, cover, seeThrough };
}
