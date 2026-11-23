'use strict';
const T = 32;
let SEASON = 'summer', GRASS = 0;

function grassTex(ramp, seed) {
  const n = ramp.length - 1;
  return (x, y) => {
    const big = fbm(x * .021, y * .021, seed, 3), mid = noise(x * .1, y * .1, seed + 5);
    let k = n - 3 + (big > .57 ? 1 : big < .43 ? -1 : 0);
    const off = Math.floor(hash(x, 0, seed + 7) * 6), cy = Math.floor((y + off) / 6), py = (y + off) - cy * 6, h = hash(x, cy, seed + 9);
    if (h > .58) { if (py === 0) k += 2; else if (py < 4) k += 1; } else if (h < .2 && py > 2) k -= 1;
    if (mid > .76) k += 1; else if (mid < .2) k -= 1;
    return ramp[clamp(k, 0, n)];
  };
}
function soilTex(ramp, seed) {
  const n = ramp.length - 1;
  return (x, y) => {
    const big = fbm(x * .03, y * .03, seed, 2), m = noise(x * .15, y * .15, seed + 3), h = hash(x, y, seed + 5);
    let k = n - 3 + (big > .58 ? 1 : big < .4 ? -1 : 0) + (m > .74 ? 1 : m < .22 ? -1 : 0);
    if (h > .95) k += 1; else if (h < .06) k -= 1;
    return ramp[clamp(k, 0, n)];
  };
}
const covAt = (x, y) => fbm(x * .02, y * .02, 3, 3) * .72 + noise(x * .17, y * .17, 5) * .28;
function cover(soil, grass, amount, fall) {
  return (x, y) => {
    const cov = covAt(x, y), g = SEASON === 'autumn' && fall ? fall : grass;
    if (cov < amount) { GRASS = 1; const c = g(x, y); return cov > amount - .011 ? dark(c, .7) : c; }
    const c = soil(x, y);
    return covAt(x, y - 3) < amount ? dark(c, .68) : c;
  };
}
const GT = {
  dry: grassTex(P.grassDry, 41), loam: grassTex(P.grassLoam, 43), lush: grassTex(P.grass, 45), sav: grassTex(P.savanna, 47), moss: grassTex(P.moss, 49),
  swamp: grassTex(P.mossSwamp, 63),
  soil: soilTex(P.soil, 51), poor: soilTex(P.soilPoor, 53), rich: soilTex(P.soilRich, 55), litter: soilTex(P.litter, 57), sand: soilTex(P.sand, 59), mud: soilTex(P.mud, 61),
};
const plates = (ramp, sc, seed, lo) => (x, y) => {
  const id = vor(x, y, sc, seed), e = VEDGE, nw = VDX + VDY < 0;
  if (e < 1) return ramp[0];
  let k = lo + Math.floor(id * 2.6);
  if (e < 2.4) k += nw ? 1 : -1;
  if (hash(x, y, seed + 3) > .95) k -= 1;
  return ramp[clamp(k, 0, ramp.length - 1)];
};
const bogTex = (x, y) => {
  const t = fbm(x * .035, y * .035, 57, 3);
  if (noise(x * .15, y * .15, 59) > .66 && t > .45) { const id = vor(x, y, 3.2, 61); return VEDGE < .7 ? P.bog[1] : P.duck[clamp(Math.floor(id * 2) + (VDX + VDY < 0 ? 1 : 0), 0, 2)]; }
  let k = t > .58 ? 3 : t > .5 ? 2 : t > .42 ? 1 : 0;
  if (noise(x * .1, y * .7, 62) > .8) k += 1;
  return P.bog[clamp(k, 0, 4)];
};
const tilledTex = (x, y) => {
  const yy = y + (noise(x * .06, y * .03, 85) - .5) * 3.2, py = ((Math.floor(yy) % 8) + 8) % 8;
  let t = [.04, .34, .7, .9, .62, .46, .26, .1][py];
  if (py >= 2 && py <= 5) t += (noise(x * .42, y * .5, 87) - .5) * .5;
  if (py === 3 && hash(x >> 1, y, 81) > .55) t -= .22;
  t += (fbm(x * .035, y * .035, 89, 2) - .5) * .22;
  if (hash(x, y, 83) > .975) t += .3; else if (hash(x, y, 93) > .97) t -= .3;
  return rp(P.tilled, t, x, y, .9);
};
const GROUND = [
  { id: 'dirt', name: 'Barren Dirt', lvl: 4, f: GT.soil, dec: [['pebble', 2.2, P.rockWarm], ['stone', .5, P.rockWarm], ['crack', .8, P.soil], ['tuft', .3, P.grassDry]] },
  { id: 'grass', name: 'Poor Soil', lvl: 5, f: cover(GT.poor, GT.dry, .46), dec: [['tuft', 2.4, P.grassDry], ['pebble', 1, P.rockWarm], ['stone', .25, P.rockWarm]] },
  { id: 'tall_grass', name: 'Loam', lvl: 5, f: cover(GT.soil, GT.loam, .57, GT.dry), dec: [['tuft', 3, P.grassLoam], ['flower', .35], ['clover', .5]] },
  { id: 'deep_grass', name: 'Rich Soil', lvl: 5, f: cover(GT.rich, GT.lush, .68, GT.loam), dec: [['tuft', 3.6, P.grass], ['flower', .5], ['clover', .8]] },
  { id: 'savanna', name: 'Savanna', lvl: 5, f: cover(GT.poor, GT.sav, .6), dec: [['tuft', 4, P.savanna], ['pebble', .5, P.rockWarm]] },
  { id: 'mossy_ground', name: 'Mossy Forest Ground', lvl: 5, f: cover(GT.rich, GT.moss, .58), dec: [['leaf', 2.5], ['twig', .9], ['tuft', 1.6, P.moss], ['shroomlet', .25]] },
  { id: 'tree', name: 'Forest Floor', lvl: 5, f: cover(GT.litter, GT.lush, .4, GT.dry), dec: [['leaf', 6], ['twig', 1.5], ['tuft', 1, P.grass], ['shroomlet', .2]] },
  { id: 'mud', name: 'Mud', lvl: 2, f: GT.mud, dec: [['puddle', 1.2], ['twig', .4]] },
  { id: 'moss', name: 'Moss', lvl: 3, f: cover(GT.mud, GT.swamp, .58), dec: [['tuft', 2.6, P.mossSwamp], ['puddle', .5]] },
  { id: 'bog', name: 'Bog', lvl: 1.5, wet: 1, f: bogTex, dec: [['lily', 1.6], ['bubble', .8], ['reedlet', 1]] },
  { id: 'clay', name: 'Clay', lvl: 3, f: plates(P.clay, 10, 63, 1), dec: [['pebble', .6, P.rockWarm]] },
  { id: 'shallow_water', name: 'Shallow Water', lvl: 1, water: 1 },
  { id: 'water', name: 'Water', lvl: 0, water: 2 },
  { id: 'rapids', name: 'Rapids', lvl: 0, water: 3 },
  { id: 'riverbank', name: 'Riverbank', lvl: 3, f: GT.sand, dec: [['pebble', 4, P.rock], ['stone', 1, P.rock], ['tuft', .8, P.grassLoam]] },
  { id: 'rocky', name: 'Rocky Ground', lvl: 5, f: plates(P.rockWarm, 11, 71, 1), dec: [['stone', 1.6, P.rock], ['pebble', 3, P.rock], ['tuft', .6, P.grassDry]] },
  { id: 'cave', name: 'Cave', lvl: 4, f: plates(P.cave, 13, 75, 1), dec: [['pebble', 1.6, P.rock], ['stone', .4, P.rock]] },
  { id: 'tilled', name: 'Tilled Soil', lvl: 4, hard: 1, f: tilledTex, dec: [] },
];
const G = {}; GROUND.forEach((g, i) => G[g.id] = i);

function waterBase(x, y, kind) {
  if (SEASON === 'winter' && kind === 1 && fbm(x * .04, y * .04, 91, 2) > .5) return 9;
  let t = .12 + fbm(x * .022, y * .022, 31, 2) * .5;
  if (kind === 1 && vor(x, y, 7, 37) > .8 && VEDGE > 1.4) t -= .2;
  return t;
}
function waterCol(x, y, kind, ph, edge, bt) {
  let t = bt === undefined ? waterBase(x, y, kind) : bt;
  if (edge === 2) return P.foam[(Math.floor(ph) + (x >> 2)) & 1 ? 1 : 2];
  if (edge === 3) return P.foam[0];
  if (t >= 9) return rp(P.ice, .4 + noise(x * .1, y * .1, 93) * .6, x, y, .3);
  const rip = noise(x * .085 + 40, y * .27 - ph * .9, 33);
  if (rip > .7) t += .2; else if (rip < .25) t -= .1;
  if (noise(x * .11, y * 1.1 + ph * .7, 39) > .84) t += .16;
  if (edge === 1) t -= .28;
  if (kind === 3) {
    const f = noise(x * .21 + 9, y * .055 - ph * 1.7, 35) + (noise(x * .5, y * .45 - ph * 2, 39) - .5) * .4;
    if (f > .68) return P.foam[f > .8 ? 2 : 1];
    if (f > .6) return P.shallow[4];
    t += .15;
  }
  return rp(kind === 1 ? P.shallow : P.deep, t, x, y, .45);
}

const rockCap = (x, y, dist) => {
  const id1 = vor(x, y, 25, 41), e1 = VEDGE, nw = VDX + VDY < 0, id2 = vor(x + 31, y + 17, 9, 42), e2 = VEDGE;
  let k = 4 + (id1 - .5) * 2 + (id2 - .5) * 1.2 + (fbm(x * .015, y * .015, 43, 2) - .5) * 1.6 - Math.min(dist, 3) * .2;
  if (e1 < 1.3) k -= 2.4; else if (e1 < 3.2) k += nw ? 1 : -1; else if (e2 < .8) k -= .9;
  if (hash(x, y, 44) > .96) k -= 1;
  if (SEASON === 'winter' && k > 4.2 && e1 >= 1.3) return P.snow[k > 5 ? 4 : 3];
  return P.rock[clamp(Math.round(k), 0, 6)];
};
const rockFace = (x, y, fy, fh) => {
  let t = .4 - fy / fh * .24 + (noise(x * .22, y * .045, 44) - .5) * .5 + (noise(x * .07 + 9, y * .02, 48) - .5) * .3;
  if (Math.abs(noise(x * .06, y * .06, 49) - .5) < .02) t -= .3;
  if (fy === 0) return P.rock[6];
  if (fy === 1) t += .2;
  return rp(P.rock, t * .8, x, y, .3);
};
const stCap = M.stone(P.stone, 16, 10, { b: 4, seed: 3 }), stFace = M.stone(P.stone, 16, 8, { b: 3, seed: 5 });
const daubTex = (b, seed) => (x, y) => { const m = fbm(x * .06, y * .06, seed, 2), h = hash(x, y, seed + 2); let k = b + (m > .6 ? 1 : m < .38 ? -1 : 0); if (h > .96) k -= 1; if (noise(x * .2, y * .25, seed + 4) > .78) k -= 1; return P.daub[clamp(k, 0, 5)]; };
const dCap = daubTex(4, 111), dFace = daubTex(3, 113), beamV = M.wood(P.wood, { dir: 'v', pw: 4, b: 3, seed: 7 }), beamH = M.wood(P.wood, { pw: 4, b: 3, seed: 9 });
const WALLS = [null,
  { id: 'mountain', name: 'Mountain Wall', h: 22, rock: 1, ramp: P.rock, cap: rockCap, face: rockFace },
  { id: 'stone', name: 'Stone Block Wall', h: 14, ramp: P.stone, cap: stCap,
    face: (x, y, fy, h) => { let c = dark(stFace(x, y), .8); if (fy >= h - 3 && hash(x, fy, 131) > .45 + (h - fy) * .12) c = P.moss[1 + (hash(x, y, 133) > .5 ? 1 : 0)]; return c; } },
  { id: 'daub', name: 'Daub Wall', h: 14, ramp: P.daub, rim: P.plank[4],
    cap: (x, y) => dCap(x, y),
    face: (x, y, fy, h) => { const lx = x & 31; if (fy < 2 || fy >= h - 2) return beamH(x, y); if (lx < 3 || lx > 28) return beamV(x, y); if (Math.abs(lx - 3 - (fy - 2) * 2.5) < 1.3 || Math.abs(lx - 28 + (fy - 2) * 2.5) < 1.3) return P.wood[2]; return dark(dFace(x, y), .9); } },
  { id: 'palisade', name: 'Palisade', h: 20, thin: 11, ramp: P.wood,
    cap: (x, y) => {
      const lx = x & 7, tx = x & 31, ty = y & 31, side = lx < 2 ? 4 : lx < 4 ? 5 : lx < 6 ? 3 : 2;
      if (ty >= 21) { const r = ty - 21; if (lx === 7) return r > 6 ? P.wood[0] : null; if (r < 6 && Math.abs(lx - 3) > r * .62 + .3) return null; return r < 2 ? P.plank[5] : P.wood[clamp(side - (r < 6 && lx > 3 ? 1 : 0) + (r < 6 && lx < 3 ? 0 : 0), 0, 5)]; }
      const py = y & 7, hw = 1.4 + py * 1.05, dx = tx - 15.5; if (Math.abs(dx) > hw) return null; if (py === 7) return P.wood[1]; return py < 2 ? P.plank[5] : P.wood[clamp((dx < -2 ? 5 : dx < 2 ? 4 : 2) - (py > 5 ? 1 : 0), 0, 5)];
    },
    face: (x, y, fy, h) => { const lx = x & 7; if (lx === 7) return P.wood[0]; if (fy === 8 || fy === 9) return P.leather[fy === 8 ? 3 : 1]; let k = [4, 5, 4, 3, 3, 2, 1][lx]; if (noise(x * 1.2, fy * .2, 123) > .68) k -= 1; return P.wood[clamp(k, 0, 5)]; } },
];
const WL = {}; WALLS.forEach((w, i) => { if (w) WL[w.id] = i; });

const FLOORS = [null,
  { id: 'plank', name: 'Plank Floor', f: (x, y) => {
    const row = Math.floor(y / 8), py = y - row * 8, L = 41, xx = x + [0, 17, 31, 9, 24, 38, 13, 28, 4, 20, 35][((row % 11) + 11) % 11], pi = Math.floor(xx / L), px = xx - pi * L, h = hash(pi, row, 1);
    if (py === 7 || px === 0) return P.plank[1];
    if ((px === 2 || px === L - 2) && py === 3) return P.plank[0];
    let k = 3 + (h > .62 ? 1 : h < .22 ? -1 : 0); if (py === 0) k += 1; if (noise(xx * .2 + row * 7.3, py * 1.4, 5) > .7) k -= 1;
    return P.plank[clamp(k, 0, 5)];
  } },
  { id: 'flagstone', name: 'Flagstone Floor', f: plates(P.stone, 12, 135, 2) },
  { id: 'earth', name: 'Packed-Earth Floor', f: (x, y) => lit(GT.soil(x, y), 1.12) },
];
const FL = {}; FLOORS.forEach((w, i) => { if (w) FL[w.id] = i; });
const thTex = M.thatch(P.thatch, { rh: 7, seed: 4 });
const ROOFS = {
  thatch: (x, y, u) => { const c = thTex(x, y); return u > 0 ? lit(c, 1 + u * .13) : dark(c, 1 + u * .16); },
  tile: (x, y, u) => {
    const row = Math.floor(y / 7), xx = x + (row & 1) * 5, col = Math.floor(xx / 10), lx = xx - col * 10, ly = y - row * 7, d = [3, 2, 1, 0, 0, 0, 0, 1, 2, 3][lx];
    let k;
    if (ly > 6 - d) { const x2 = x + ((row + 1) & 1) * 5; k = 1 + (hash(Math.floor(x2 / 10), row + 1, 157) > .55 ? 1 : 0); }
    else { k = 2 + (hash(col, row, 157) > .55 ? 1 : 0); if (ly === 6 - d) k -= 2; else if (lx > 1 && lx < 4) k += 1; else if (lx > 6) k -= 1; if (ly === 0 && lx > 2 && lx < 7) k -= 1; }
    const c = P.rooftile[clamp(k, 0, 4)]; return u > 0 ? lit(c, 1 + u * .13) : dark(c, 1 + u * .16);
  },
};

class World {
  constructor(W, H, fill) {
    this.W = W; this.H = H;
    this.g = new Uint8Array(W * H).fill(fill || 0);
    this.wall = new Uint8Array(W * H); this.floor = new Uint8Array(W * H); this.feat = new Uint8Array(W * H);
    this.ore = new Array(W * H).fill(null); this.roofs = []; this.objs = [];
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  gAt(x, y) { return this.g[clamp(y, 0, this.H - 1) * this.W + clamp(x, 0, this.W - 1)]; }
  wAt(x, y) { return this.in(x, y) ? this.wall[y * this.W + x] : 0; }
  put(spr, tx, ty, dx, dy) {
    const o = { spr, x: tx * T + 16 + (dx || 0), y: ty * T + 23 + (dy || 0) };
    this.objs.push(o); return o;
  }
  room(x0, y0, x1, y1, wall, floor, roof) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * this.W + x;
      if (x === x0 || x === x1 || y === y0 || y === y1) this.wall[i] = wall; else this.floor[i] = floor;
    }
    if (roof) this.roofs.push({ x0, y0, x1, y1, kind: roof, h: WALLS[wall].h });
  }
}

const FLW = [P.red[4], P.gold[4], P.purple[4], P.cloth[5], hex('#e06bb5'), P.blue[4]];
function decal(kind, x, y, h, ramp, d, winter) {
  const n = ramp ? ramp.length - 1 : 0;
  if (kind === 'tuft') {
    const r = SEASON === 'autumn' && ramp !== P.moss ? P.grassDry : ramp, m = r.length - 1, hs = [2, 4, 6, 4, 3, 5, 2];
    for (let i = 0; i < 7; i++) { const bh = hs[i] + Math.floor(hash(x + i, y, 5) * 2), lean = i < 3 ? -1 : i > 4 ? 1 : 0; for (let j = 0; j < bh; j++) d(x + i - 3 + (j > bh - 3 ? lean : 0), y - j, r[j === bh - 1 ? m : j > bh - 4 ? m - 1 : m - 2 - (i & 1)]); }
    d(x - 3, y + 1, r[0]); d(x - 1, y + 1, r[0]); d(x + 1, y + 1, r[0]); d(x + 3, y + 1, r[0]);
  } else if (kind === 'pebble') {
    d(x, y, ramp[n - 1]); d(x + 1, y, ramp[n - 2]); d(x + 2, y, ramp[n - 3]); d(x, y + 1, ramp[n - 2]); d(x + 1, y + 1, ramp[n - 3]); d(x + 2, y + 1, ramp[1]); d(x + 1, y + 2, ramp[0]); d(x + 2, y + 2, ramp[0]);
  } else if (kind === 'stone') {
    const w = 5 + Math.floor(h * 4), hh = 4 + Math.floor(h * 2);
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
      const nx = (i + .5) / w * 2 - 1, ny = (j + .5) / hh * 2 - 1; if (nx * nx + ny * ny > 1.05) continue;
      let k = n - 2 - Math.round((nx + ny) * 1.6); if (j === 0 || (i === 0 && j < hh - 1)) k += 1;
      d(x + i, y + j, ramp[clamp(k, 1, n)]);
    }
    for (let i = 1; i < w + 1; i++) d(x + i, y + hh, ramp[0]);
    if (winter) for (let i = 1; i < w - 1; i++) d(x + i, y, P.snow[4]);
  } else if (kind === 'crack') {
    let cx = x, cy = y; for (let i = 0; i < 7 + h * 6; i++) { d(cx, cy, ramp[0]); if (hash(x, i, 7) > .5) cx++; else cy++; if (i === 4) d(cx + 1, cy - 1, ramp[0]); }
  } else if (kind === 'flower') {
    const c = FLW[Math.floor(h * FLW.length)];
    d(x, y, c); d(x + 1, y, dark(c, .78)); d(x, y - 1, lit(c, 1.15)); d(x - 1, y, c); d(x, y + 1, dark(c, .7)); d(x, y, P.gold[4]); d(x, y + 2, P.grass[2]); d(x, y + 3, P.grass[2]); d(x + 1, y + 3, P.grass[3]);
  } else if (kind === 'clover') {
    for (let i = 0; i < 5; i++) { const cx = x + Math.floor(hash(x, i, 3) * 7), cy = y + Math.floor(hash(y, i, 4) * 4); d(cx, cy, P.grass[4]); d(cx + 1, cy, P.grass[3]); d(cx, cy + 1, P.grass[2]); }
  } else if (kind === 'leaf') {
    const c = (SEASON === 'summer' ? P.litter : P.fallOrange)[2 + Math.floor(h * 3)];
    d(x, y, c); d(x + 1, y, c); d(x + 1, y + 1, dark(c, .72)); if (h > .5) d(x + 2, y + 1, dark(c, .72)); else d(x - 1, y - 1, lit(c, 1.15));
  } else if (kind === 'twig') {
    for (let i = 0; i < 8; i++) d(x + i, y - (i >> 2), P.wood[i & 1 ? 4 : 3]); d(x + 4, y - 2, P.wood[3]); d(x + 5, y - 3, P.wood[4]); d(x + 2, y + 1, P.wood[1]); d(x + 3, y + 1, P.wood[1]);
  } else if (kind === 'puddle') {
    for (let j = -2; j <= 2; j++) for (let i = -5; i <= 5; i++) if (i * i / 30 + j * j / 5 < 1) d(x + i, y + j, P.mud[j < 0 ? 0 : 1]);
    d(x - 2, y - 1, P.mud[5]); d(x - 1, y - 1, P.mud[5]); d(x + 2, y, P.mud[4]);
  } else if (kind === 'lily') {
    const L = P.duck;
    for (let j = -2; j <= 2; j++) for (let i = -4; i <= 4; i++) { if (i * i / 18 + j * j / 5 > 1 || (i > 1 && j === 0) || (i > 2 && Math.abs(j) < 2)) continue; d(x + i, y + j, L[j < 0 ? 2 : i > 1 ? 0 : 1]); }
    d(x - 2, y - 1, P.grassLoam[4]); for (let i = -3; i < 4; i++) d(x + i, y + 3, P.bog[0]);
    if (h > .65) { d(x - 1, y - 2, P.cloth[5]); d(x, y - 3, P.cloth[5]); d(x + 1, y - 2, P.cloth[4]); d(x, y - 2, P.gold[4]); }
  } else if (kind === 'bubble') {
    d(x, y, P.bog[4]); d(x + 1, y - 1, P.bog[4]); d(x + 2, y, P.bog[3]); d(x + 1, y + 1, P.bog[0]); d(x + 5, y + 2, P.bog[4]);
  } else if (kind === 'reedlet') {
    for (let k = 0; k < 3; k++) { const hh = 7 + Math.floor(hash(x, k, 3) * 7); for (let a = 0; a < hh; a++) d(x + k * 2, y - a, P.grassLoam[1 + k + (a > hh - 3 ? 1 : 0)]); if (k === 1) { d(x + 2, y - hh, P.leather[3]); d(x + 2, y - hh - 1, P.leather[2]); d(x + 2, y - hh - 2, P.leather[3]); } }
  } else if (kind === 'shroomlet') {
    const c = h > .5 ? P.leather : P.red;
    d(x, y, c[3]); d(x + 1, y, c[4]); d(x + 2, y, c[2]); d(x - 1, y + 1, c[2]); d(x + 3, y + 1, c[1]); d(x, y + 1, c[3]); d(x + 1, y + 1, c[2]); d(x + 2, y + 1, c[1]); d(x + 1, y + 2, P.cloth[4]); d(x + 1, y + 3, P.cloth[3]);
  }
}

function renderWorld(w, opt) {
  SEASON = opt.season || 'summer';
  const W = w.W * T, H = w.H * T, winter = SEASON === 'winter';
  const alb = new Uint8ClampedArray(W * H * 3), em = new Uint8Array(W * H), own = new Uint8Array(W * H), wedge = new Uint8Array(W * H);
  const dep = new Uint16Array(W * H), gm = new Uint8Array(W * H), rk = new Uint8Array(W * H);
  let KEY = 0, DG = 0;
  const px = (x, y, c, e) => {
    if (x < 0 || y < 0 || x >= W || y >= H || !c) return;
    const i = y * W + x; alb[i * 3] = c[0]; alb[i * 3 + 1] = c[1]; alb[i * 3 + 2] = c[2]; em[i] = e || 0; own[i] = 0; gm[i] = DG; dep[i] = KEY;
  };
  const indoor = new Uint8Array(w.W * w.H);
  for (const r of w.roofs) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) indoor[y * w.W + x] = 1;
  const dist = new Uint8Array(w.W * w.H).fill(9);
  for (let pass = 0; pass < 6; pass++) for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    const i = y * w.W + x;
    if (!w.wall[i]) { dist[i] = 0; continue; }
    let m = dist[i];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.in(x + a, y + b)) m = Math.min(m, dist[(y + b) * w.W + x + a] + 1);
    dist[i] = m;
  }
  const typeAt = (fx, fy) => w.gAt(Math.floor(fx / T), Math.floor(fy / T));
  const tileOf = (x, y) => Math.floor(y / T) * w.W + Math.floor(x / T);

  const hit = opt.cache && opt.cache[SEASON];
  if (hit) { alb.set(hit.alb); own.set(hit.own); wedge.set(hit.wedge); gm.set(hit.gm); rk.set(hit.rk); } else {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T), ti = ty * w.W + tx, i = y * W + x;
    let c;
    if (w.floor[ti]) {
      c = FLOORS[w.floor[ti]].f(x, y);
      const lx = x & 31, ly = y & 31;
      if ((ly === 0 && !w.floor[ti - w.W] && !w.wAt(tx, ty - 1)) || (lx === 0 && !w.floor[ti - 1] && !w.wAt(tx - 1, ty)) || (ly === 31 && !w.floor[ti + w.W] && !w.wAt(tx, ty + 1)) || (lx === 31 && !w.floor[ti + 1] && !w.wAt(tx + 1, ty))) c = dark(c, .55);
    } else {
      const wx = x + (noise(x * .042, y * .042, 11) - .5) * 22 + (noise(x * .155, y * .155, 12) - .5) * 7;
      const wy = y + (noise(x * .042, y * .042, 14) - .5) * 22 + (noise(x * .155, y * .155, 15) - .5) * 7;
      { const wm = w.wall[clamp(Math.floor(wy / T), 0, w.H - 1) * w.W + clamp(Math.floor(wx / T), 0, w.W - 1)]; rk[i] = wm && WALLS[wm].rock ? 1 : 0; }
      let t = w.g[ti];
      const hard = GROUND[t].hard;
      if (!hard) { const t2 = typeAt(wx, wy); if (!GROUND[t2].hard) t = t2; }
      const g = GROUND[t];
      if (g.water) {
        let edge = 0;
        const up = hard ? t : typeAt(wx, wy - 6);
        const near = (r) => Math.max(GROUND[typeAt(wx + r, wy)].lvl, GROUND[typeAt(wx - r, wy)].lvl, GROUND[typeAt(wx, wy + r)].lvl, GROUND[typeAt(wx, wy - r)].lvl);
        if (GROUND[up].lvl > 1.6) edge = 1;
        if (near(2) > 1.6) edge = 2; else if (near(4.5) > 1.6 && hash(x >> 1, y, 17) > .45) edge = 3;
        own[i] = g.water; wedge[i] = edge;
        c = waterCol(x, y, g.water, 0, edge);
      } else {
        GRASS = 0; c = g.f(x, y); gm[i] = GRASS;
        if (!hard) {
          const up = GROUND[typeAt(wx, wy - 4)], dn = GROUND[typeAt(wx, wy + 4)];
          if (up.lvl > g.lvl + .4 && !up.water) c = dark(c, .68);
          else if (dn.lvl < g.lvl - .4 && dn.lvl < 2) c = dark(c, .8);
        }
        if (winter && !g.wet && !indoor[ti]) {
          const sn = fbm(x * .018, y * .018, 21, 2) * .86 + noise(x * .15, y * .15, 23) * .14, thr = g.hard ? .5 : .4;
          if (sn > thr) gm[i] = 0;
          if (sn > thr) c = sn < thr + .02 ? P.snow[1] : rp(P.snow, .62 + (sn - .5) * 1.6 + (noise(x * .05, y * .08, 25) - .5) * .5, x, y, .3);
        }
      }
    }
    alb[i * 3] = c[0]; alb[i * 3 + 1] = c[1]; alb[i * 3 + 2] = c[2];
  }

  const dpx = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const ti = tileOf(x, y); if (w.floor[ti] || w.wall[ti] || own[y * W + x]) return; px(x, y, c); };
  for (let ty = 0; ty < w.H; ty++) for (let tx = 0; tx < w.W; tx++) {
    const ti = ty * w.W + tx, g = GROUND[w.g[ti]];
    if (w.floor[ti] || w.wall[ti] || !g.dec) continue;
    let k = 0;
    for (const [kind, dens, ramp] of g.dec) {
      const cnt = Math.floor(dens + hash(tx, ty, 201 + k));
      for (let j = 0; j < cnt; j++) {
        k++;
        const x = tx * T + Math.floor(hash(tx, ty, 300 + k) * T), y = ty * T + Math.floor(hash(tx, ty, 400 + k) * T), h = hash(tx, ty, 500 + k);
        if (winter && kind !== 'stone' && h < .75) continue;
        DG = kind === 'tuft' || kind === 'clover' ? 1 : 0; decal(kind, x, y, h, ramp, dpx, winter); DG = 0;
      }
    }
  }

  if (opt.cache) opt.cache[SEASON] = { alb: alb.slice(), own: own.slice(), wedge: wedge.slice(), gm: gm.slice(), rk: rk.slice() };
  }

  const sh = new Float32Array(W * H);
  const objs = w.objs.slice().sort((a, b) => a.y - b.y);
  for (const o of objs) {
    const s = o.spr.sh; if (!s) continue;
    const cx = o.x + s.dx, cy = o.y + s.dy;
    for (let y = Math.floor(cy - s.ry); y <= cy + s.ry; y++) for (let x = Math.floor(cx - s.rx); x <= cx + s.rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const nx = (x - cx) / s.rx, ny = (y - cy) / s.ry, q = nx * nx + ny * ny;
      if (q < 1) { const v = (s.k || 1) * clamp((1 - q) * 3.2, 0, 1); if (v > sh[y * W + x]) sh[y * W + x] = v; }
    }
  }
  const wh = (x, y) => { const m = w.wAt(Math.floor(x / T), Math.floor(y / T)); if (m && !WALLS[m].rock) return WALLS[m].h; return x >= 0 && y >= 0 && x < W && y < H && rk[y * W + x] ? 22 : 0; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, ti = tileOf(x, y);
    if (w.wall[ti] && !WALLS[w.wall[ti]].rock) continue;
    let s = sh[i];
    if (x > 20 && y > 14) { if (wh(x - 5, y - 3) >= 6 || wh(x - 10, y - 6) >= 12 || wh(x - 15, y - 9) >= 18 || wh(x - 19, y - 12) >= 22) s = 1; }
    let k = 1;
    if (s > dith(x, y) * .7 + .15) k = .56;
    if (indoor[ti]) k *= .9;
    if (k < 1) { alb[i * 3] *= k; alb[i * 3 + 1] *= k; alb[i * 3 + 2] *= Math.min(1, k + .12); }
  }

  const blit = (s, x0, y0) => {
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) { const c = s.c[j * s.w + i]; if (c) px(x0 - s.ax + i, y0 - s.ay + j, c, s.e[j * s.w + i]); }
  };
  const snowOn = (x, y, thr) => winter && fbm(x * .035, y * .035, 27, 2) + (dith(x, y) - .5) * .06 > (thr || .5);
  const oreAt = (ore, x, y, c, face) => {
    const blob = fbm(x * .028, y * .028, 61 + ore.seed, 2), id = vor(x, y, 6, 63 + ore.seed), e = VEDGE, nw = VDX + VDY < 0;
    if (blob < .47 || id < .42 + (.62 - blob) * 1.6) return null;
    if (e < .9) return dark(c, .5);
    let k = 1 + (nw ? 1 : 0) + (e < 2 ? (nw ? 1 : -1) : 0) + (hash(x, y, 9) > .93 ? 1 : 0) - (face ? 1 : 0);
    return ore.ramp[clamp(k, 0, 3)];
  };
  const drawWall = (tx, ty) => {
    const ti = ty * w.W + tx, m = WALLS[w.wall[ti]], X = tx * T, Y = ty * T, h = m.h;
    if (m.rock) return;
    const same = (a, b) => { const o = w.wAt(tx + a, ty + b); return o && (m.thin ? WALLS[o].thin : !WALLS[o].thin); };
    const any = (a, b) => !!w.wAt(tx + a, ty + b);
    const N = same(0, -1), S = same(0, 1), E = any(1, 0), Wn = any(-1, 0), feat = w.feat[ti], ore = w.ore[ti];
    const mask = (lx, ly) => {
      if (!m.thin) return true;
      const d = m.thin, strip = ly >= T - d && (E || lx <= 21) && (Wn || lx >= 10), col = (N || S) && lx >= 10 && lx <= 21 && (N || ly >= T - d);
      return ((!(N || S) || E || Wn) && strip) || col;
    };
    for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) {
      if (!mask(lx, ly)) continue;
      const x = X + lx, y = Y + ly - h;
      let c = m.cap(x, y + h, dist[ti]), e = 0;
      if (!c) continue;
      if (ore) { const oc = oreAt(ore, x, y + h, c, 0); if (oc) { c = oc; if (ore.glow && oc === ore.ramp[3]) e = 150; } }
      if (feat === 1 && ly >= T - 4) c = ly === T - 4 ? P.plank[5] : beamH(x, y);
      const eN = m.thin ? !mask(lx, ly - 1) && !(ly === 0 && N) : ly === 0 && !any(0, -1), eW = m.thin ? !mask(lx - 1, ly) && !(lx === 0 && Wn) : lx === 0 && !Wn;
      const eE = m.thin ? !mask(lx + 1, ly) && !(lx === T - 1 && E) : lx === T - 1 && !E;
      if (eN || eW) c = m.rim || m.ramp[m.ramp.length - 1]; else if (eE) c = dark(c, .66);
      else if (!m.thin && ((ly === 1 && !any(0, -1)) || (lx === 1 && !Wn))) c = lit(c, 1.12);
      if (!m.rock && snowOn(x, y, .5)) c = rp(P.snow, .75 + (noise(x * .1, y * .1, 29) - .5) * .5, x, y, .3);
      px(x, y, c, e);
    }
    if (S && !m.thin) return;
    for (let fy = 0; fy < h; fy++) for (let lx = 0; lx < T; lx++) {
      if (!mask(lx, T - 1) || (S && lx >= 10 && lx <= 21)) continue;
      const x = X + lx, y = Y + T - h + fy;
      let c = m.face(x, y, fy, h), e = 0;
      if (!c) continue;
      if (ore && fy > 1) { const oc = oreAt(ore, x, y, c, 1); if (oc) { c = oc; if (ore.glow && oc === ore.ramp[2]) e = 120; } }
      if (feat === 1) {
        if (lx < 5 || lx > 26) c = P.wood[lx === 4 || lx === 27 ? 1 : 3];
        else if (fy === 0) c = P.wood[1];
        else { c = P.plank[(lx - 5) % 6 === 5 ? 1 : 3 + ((lx - 5) % 6 === 0 ? 1 : 0) - (noise(lx * 1.3, fy * .3, 5) > .7 ? 1 : 0)]; if (fy === 3 || fy === h - 4) c = P.iron[lx % 5 === 2 ? 6 : 3]; if (lx >= 22 && lx <= 23 && fy >= 6 && fy <= 8) c = P.iron[fy === 6 ? 6 : 4]; }
      }
      if (feat === 2 && lx >= 9 && lx <= 22 && fy >= 2 && fy <= h - 4) {
        const edge = lx === 9 || lx === 22 || fy === 2 || fy === h - 4, mid = ((h - 2) >> 1) + 1;
        c = edge ? P.wood[lx === 9 || fy === 2 ? 4 : 2] : lx <= 13 ? (hash(lx, fy, 211) > .9 ? P.wood[0] : P.ink) : fy === mid ? P.wood[1] : P.plank[(lx - 14) % 3 === 2 ? 1 : 3 - (noise(lx * 1.3, fy * .4, 213) > .7 ? 1 : 0) + (lx === 14 ? 1 : 0)];
      }
      if ((lx === 0 && !Wn) || (m.thin && !mask(lx - 1, T - 1))) c = lit(c, 1.14); else if ((lx === T - 1 && !E) || (m.thin && !mask(lx + 1, T - 1))) c = dark(c, .72);
      if (fy === h - 1) c = dark(c, .62);
      px(x, y, c, e);
    }
  };
  const HQ = new Float32Array(W * H).fill(-1);
  const rockH = (x, y) => {
    x = clamp(x, 0, W - 1); y = clamp(y, 0, H - 1);
    const i = y * W + x; if (HQ[i] >= 0) return HQ[i];
    let r = 0, a = .5, f = .013, n = 0;
    for (let o = 0; o < 4; o++) { const v = 1 - Math.abs(2 * noise(x * f, y * f, 141 + o * 9) - 1); r += a * v * v; n += a; a *= .5; f *= 2.1; }
    vor(x, y, 34, 151);
    const hh = r / n * .62 + clamp(1 - Math.hypot(VDX, VDY) / 24, 0, 1) * .38;
    return HQ[i] = hh + Math.floor(hh * 7) / 7 * .55;
  };
  const rockRow = by => {
    for (let bx = 0; bx < W; bx++) {
      const i = by * W + bx; if (!rk[i]) continue;
      const bti = tileOf(bx, by), ore = w.wall[bti] ? w.ore[bti] : null, L0 = bx > 0 && !rk[i - 1], R0 = bx < W - 1 && !rk[i + 1], U0 = by > 0 && !rk[i - W];
      const hC = rockH(bx, by), dx = rockH(bx + 1, by) - rockH(bx - 1, by), dy = rockH(bx, by + 1) - rockH(bx, by - 1);
      let t = .6 + (hC - .75) * .3 + (dx * .55 + dy * .6) * 4.4 - Math.min(dist[bti], 3) * .03 + (hash(bx, by, 44) - .5) * .07;
      if (Math.abs(noise(bx * .035, by * .035, 161) - .5) < .012 && noise(bx * .01, by * .01, 163) > .42) t -= .3;
      if (U0 || L0) t += .26; else if (R0) t -= .2;
      let c = winter && t > .6 && !U0 ? P.snow[t > .74 ? 4 : 3] : rp(P.rock, t, bx, by, .3), e = 0;
      if (ore) { const oc = oreAt(ore, bx, by, c, 0); if (oc) { c = oc; if (ore.glow && oc === ore.ramp[3]) e = 150; } }
      px(bx, by - 22, c, e);
      if (by === H - 1 || !rk[i + W]) for (let fy = 0; fy < 22; fy++) {
        const y = by - 21 + fy; let fc = rockFace(bx, y, fy, 22), fe = 0;
        if (ore && fy > 1) { const oc = oreAt(ore, bx, y, fc, 1); if (oc) { fc = oc; if (ore.glow && oc === ore.ramp[2]) fe = 120; } }
        if (L0) fc = lit(fc, 1.14); else if (R0) fc = dark(fc, .72);
        if (fy === 21) fc = dark(fc, .6);
        px(bx, y, fc, fe);
      }
    }
  };
  const still = o => !o.spr.frames && !o.spr.sway;
  let oi = 0;
  for (let by = 0; by < H; by++) {
    while (oi < objs.length && objs[oi].y <= by) { const o = objs[oi++]; if (still(o)) { KEY = Math.round(o.y); blit(o.spr, o.x, o.y); } }
    KEY = by; rockRow(by);
    if ((by & 31) === 31) { KEY = by + 1; const ty = by >> 5; for (let tx = 0; tx < w.W; tx++) if (w.wall[ty * w.W + tx]) drawWall(tx, ty); }
  }
  while (oi < objs.length) { const o = objs[oi++]; if (still(o)) { KEY = Math.round(o.y); blit(o.spr, o.x, o.y); } }

  const hidden = [], mode = opt.roofs === true ? 'full' : opt.roofs || '';
  if (mode) for (const r of w.roofs) {
    const x0 = r.x0 * T - 4, x1 = (r.x1 + 1) * T + 4, y0 = r.y0 * T - r.h - 12, y1 = (r.y1 + 1) * T - r.h + 4, tex = ROOFS[r.kind], mid = (y0 + y1) / 2, hw = (y1 - y0) / 2;
    KEY = (r.y1 + 1) * T;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (mode === 'cut') { const d = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y); if (d >= 12 && 1 - (d - 12) / 22 <= dith(x, y) * .96 + .02) continue; }
      const v = (y - mid) / hw;
      let u = v < 0 ? 1 : -1;
      if (Math.abs(y - mid) < 2.5) u = 2.4;
      if (x < x0 + 3 || y === y0) u += 1;
      if (x >= x1 - 3) u -= 1;
      let c = tex(x, y, u);
      if (y >= y1 - 2) c = dark(c, .5);
      if (winter && v < .45 + (noise(x * .15, 0, 31) - .5) * .5 + (dith(x, y) - .5) * .1) c = rp(P.snow, (v < 0 ? .85 : .55) + (noise(x * .1, y * .1, 29) - .5) * .4, x, y, .3);
      px(x, y, c);
    }
    for (let y = y1; y < y1 + 8; y++) for (let x = x0 + 6; x < x1 + 8; x++) if (y < H && x < W && dith(x, y) > .25) { const i = y * W + x; alb[i * 3] *= .6; alb[i * 3 + 1] *= .6; alb[i * 3 + 2] *= .7; }
    if (mode === 'full') hidden.push(r);
  }

  const lights = [], anim = [];
  for (const o of objs) {
    const cov = hidden.some(r => o.x >= r.x0 * T && o.x < (r.x1 + 1) * T && o.y >= r.y0 * T && o.y < (r.y1 + 1) * T);
    if (o.spr.emit && !cov) lights.push({ x: o.x + o.spr.emit.dx, y: o.y + o.spr.emit.dy, ...o.spr.emit });
    if (o.spr.frames && !cov) anim.push(o);
  }
  const sway = [], leafy = [];
  for (const o of objs) {
    const sp = o.spr; if (!sp.sway) continue;
    sway.push({ pk: packSpr(sp), w: sp.w, h: sp.h, ay: sp.ay, x0: Math.round(o.x - sp.ax), y0: Math.round(o.y - sp.ay), key: Math.round(o.y), amp: sp.sway, ph: o.x * .045 + o.y * .02, bx: o.x, by: o.y });
    if (sp.leaf) leafy.push({ x: o.x, y: o.y, ramp: sp.leaf, top: sp.ay });
  }
  for (let ty = 0; ty < w.H; ty++) for (let tx = 0; tx < w.W; tx++) {
    const ti = ty * w.W + tx;
    if (w.feat[ti] === 2 && !w.wAt(tx, ty + 1)) lights.push({ x: tx * T + 16, y: ty * T + 38, rad: 52, col: [1, .7, .35], night: 1 });
    if (w.ore[ti] && w.ore[ti].glow && dist[ti] < 2) lights.push({ x: tx * T + 16, y: ty * T + 8, rad: 36, col: w.ore[ti].glow });
  }
  const water = [];
  for (let i = 0; i < own.length; i++) if (own[i]) water.push(i);
  const wb = new Float32Array(water.length);
  for (let k = 0; k < water.length; k++) wb[k] = waterBase(water[k] % W, (water[k] / W) | 0, own[water[k]]);
  const alb32 = new Uint32Array(W * H);
  for (let i = 0, p = 0; i < alb32.length; i++, p += 3) alb32[i] = 0xff000000 | (alb[p + 2] << 16) | (alb[p + 1] << 8) | alb[p];
  for (const o of anim) for (const f of o.spr.frames) packSpr(f);
  return { W, H, alb32, em, own, wedge, sh, lights, anim, water: Int32Array.from(water), wb, dep, gm, sway, leafy, season: SEASON };
}

const pack = c => (0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
function packSpr(s) {
  if (s.pk) return s.pk;
  const n = s.w * s.h, c32 = new Uint32Array(n), ra = new Int16Array(s.h), rb = new Int16Array(s.h);
  for (let j = 0; j < s.h; j++) { let lo = s.w, hi = 0; for (let i = 0; i < s.w; i++) { const c = s.c[j * s.w + i]; if (c) { c32[j * s.w + i] = pack(c); if (i < lo) lo = i; hi = i + 1; } } ra[j] = lo; rb[j] = hi; }
  return s.pk = { c32, e: s.e, ra, rb, g: {} };
}
const TIMES = {
  day: { amb: [1, 1, 1], lk: .22, vig: .16 },
  dusk: { amb: [.86, .6, .56], lk: .6, vig: .2 },
  night: { amb: [.24, .29, .5], lk: 1, vig: .24 },
};
function gradePx(c, ev, am, night) {
  if (ev === 254) return night ? 0xff60befa : c;
  let fr = am[0], fg = am[1], fb = am[2];
  if (ev) { const k = ev / 255; fr = k + fr * (1 - k); fg = k + fg * (1 - k); fb = k + fb * (1 - k); }
  return (0xff000000 | (Math.min(255, ((c >> 16) & 255) * fb) << 16) | (Math.min(255, ((c >> 8) & 255) * fg) << 8) | Math.min(255, (c & 255) * fr)) >>> 0;
}
function gradeArr(src, ev, time, off) {
  if (time === 'day') return src;
  const am = TIMES[time].amb, out = new Uint32Array(src.length);
  for (let i = 0; i < src.length; i++) { const c = src[i]; if (c) out[i] = gradePx(c, ev ? ev[off ? i % off : i] : 0, am, true); }
  return out;
}
const sprG = (pk, time) => pk.g[time] || (pk.g[time] = gradeArr(pk.c32, pk.e, time));
function particles(r, ts, dt, time, X0, X1, Y0, Y1, a, e, gust) {
  const { W, H } = r, P0 = r.parts || (r.parts = []), winter = r.season === 'winter', area = (X1 - X0) * (Y1 - Y0), am = TIMES[time].amb, night = time !== 'day';
  const vis = r.leafy.filter(t => t.x > X0 - 40 && t.x < X1 + 40 && t.y > Y0 && t.y < Y1 + 80);
  const want = { leaf: winter ? 0 : Math.min(320, Math.round(vis.length * (r.season === 'autumn' ? 1.5 : .45))), snow: winter ? Math.min(700, Math.round(area / 2400)) : 0, fly: time === 'night' && !winter ? Math.min(90, Math.round(area / 22000)) : 0 };
  const have = { leaf: 0, snow: 0, fly: 0 };
  for (const p of P0) have[p.k]++;
  for (let n = have.leaf; n < want.leaf && vis.length; n++) { const t = vis[Math.floor(Math.random() * vis.length)], c = t.ramp[2 + Math.floor(Math.random() * 3)]; P0.push({ k: 'leaf', x: t.x + (Math.random() - .5) * 44, gy: t.y - 8 + Math.random() * 22, z: (have.leaf < want.leaf * .5 ? Math.random() : 1) * (t.top * .35 + Math.random() * t.top * .4), vz: 8 + Math.random() * 9, ph: Math.random() * 6.28, c, c2: dark(c, .7), rest: 0 }); }
  for (let n = have.snow; n < want.snow; n++) P0.push({ k: 'snow', x: X0 - 60 + Math.random() * (X1 - X0 + 60), gy: Y0 + Math.random() * (Y1 - Y0 + 120), z: (r.snowed ? 120 + Math.random() * 60 : Math.random() * 180), vz: 22 + Math.random() * 16, ph: Math.random() * 6.28, c: P.snow[Math.random() > .4 ? 4 : 3], rest: 0 });
  r.snowed = winter;
  for (let n = have.fly, tries = 0; n < want.fly && tries < 40; tries++) { const x = Math.floor(X0 + Math.random() * (X1 - X0)), y = Math.floor(Y0 + Math.random() * (Y1 - Y0)); if (!r.gm[y * W + x]) continue; n++; P0.push({ k: 'fly', x, gy: y, z: 5 + Math.random() * 10, ph: Math.random() * 6.28, life: 5 + Math.random() * 9 }); }
  const put = (x, y, c, em) => { x = Math.round(x); y = Math.round(y); if (x < X0 || x >= X1 || y < Y0 || y >= Y1) return; const p = y * W + x; a[p] = gradePx(pack(c), em || 0, am, night); if (em) e[p] = em; };
  let m = 0;
  for (const p of P0) {
    const g = gust(p.x | 0, p.gy | 0);
    if (p.k === 'fly') {
      p.life -= dt; if (p.life < 0) continue;
      p.x += Math.sin(ts * .9 + p.ph) * 7 * dt; p.gy += Math.cos(ts * .7 + p.ph * 1.3) * 5 * dt;
      if (Math.sin(ts * 2.2 + p.ph) > -.2) { const y = p.gy - p.z + Math.sin(ts * 1.6 + p.ph) * 2; put(p.x, y, [226, 240, 120], 255); put(p.x + 1, y, [120, 150, 60], 150); put(p.x, y + 1, [120, 150, 60], 150); put(p.x - 1, y, [120, 150, 60], 150); put(p.x, y - 1, [120, 150, 60], 150); }
    } else {
      if (p.z > 0) { p.z -= p.vz * dt * (p.k === 'leaf' ? .8 + Math.sin(ts * 3 + p.ph) * .5 : 1); p.x += (14 + g * 50) * dt * (p.k === 'snow' ? .7 : 1) + Math.sin(ts * 4 + p.ph) * 10 * dt; p.gy += Math.sin(ts * 2 + p.ph) * 4 * dt; }
      else { p.z = 0; p.rest += dt; if (p.k === 'leaf' && g > .7) p.x += 30 * dt; }
      if (p.rest > (p.k === 'snow' ? .4 : 3) || p.x > X1 + 80 || p.x < X0 - 120 || p.gy > Y1 + 160 || p.gy < Y0 - 80) continue;
      const y = p.gy - p.z;
      if (p.k === 'snow') { put(p.x, y, p.c); if (p.ph > 4) put(p.x + 1, y, P.snow[2]); }
      else { const fl = p.z > 0 && (Math.floor(ts * 5 + p.ph) & 1); put(p.x, y, p.c); if (fl) put(p.x, y + 1, p.c2); else put(p.x + 1, y, p.c2); }
    }
    P0[m++] = p;
  }
  P0.length = m;
}
const WF = 16, WX = 4;
function lightAdd(r, l, L, rad, lk) {
  const { W, H } = r, x0 = Math.max(0, Math.floor(l.x - rad)), x1 = Math.min(W - 1, Math.ceil(l.x + rad)), y0 = Math.max(0, Math.floor(l.y - rad)), y1 = Math.min(H - 1, Math.ceil(l.y + rad));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - l.x, (y - l.y) * 1.25) / rad;
    if (d >= 1) continue;
    const q = Math.floor((1 - d) * (1 - d) * 7 + dith(x, y)) / 7 * lk;
    if (!q) continue;
    const p = (y * W + x) * 3;
    L[p] += l.col[0] * q; L[p + 1] += l.col[1] * q; L[p + 2] += l.col[2] * q;
  }
}
function lightMul(r, time, x0, y0, x1, y1, scan) {
  const { W, H } = r, tm = TIMES[time], Ls = r.L, Ld = r.Ld, mul = r.mul, vg = r.vg, am = tm.amb, vk = tm.vig, neu = r.neu, CW = r.CW, k0 = 32 / am[0], k1 = 32 / am[1], k2 = 32 / am[2];
  for (let y = y0; y <= y1; y++) for (let x = x0, i = y * W + x0, p = i * 3; x <= x1; x++, i++, p += 3) {
    const v = vg[i] * vk, f = 1 - v;
    mul[p] = Math.min(255, Math.min(1.5, am[0] + Ls[p] + Ld[p]) * f * k0); mul[p + 1] = Math.min(255, Math.min(1.5, am[1] + Ls[p + 1] + Ld[p + 1]) * f * k1); mul[p + 2] = Math.min(255, Math.min(1.5, am[2] + Ls[p + 2] + Ld[p + 2]) * (f + v * .25) * k2);
  }
  for (let cy = y0 >> 4; cy <= y1 >> 4; cy++) for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) {
    let ok = scan ? 1 : 0;
    for (let y = cy * 16; y < Math.min(H, cy * 16 + 16) && ok; y++) for (let x = cx * 16, p = (y * W + x) * 3; x < Math.min(W, cx * 16 + 16); x++, p += 3) if (mul[p] !== 32 || mul[p + 1] !== 32 || mul[p + 2] !== 32) { ok = 0; break; }
    neu[cy * CW + cx] = ok;
  }
}
function lightPass(r, time, tick) {
  const { W, H } = r, tm = TIMES[time], on = l => !(l.night && time === 'day'), isDyn = l => time !== 'day' && l.flicker, k0 = time === 'day' ? .7 : 1;
  if (r.ltime !== time) {
    r.ltime = time; r.L.fill(0); r.Ld.fill(0);
    for (const l of r.lights) if (on(l) && !isDyn(l)) lightAdd(r, l, r.L, l.rad * k0, tm.lk);
    lightMul(r, time, 0, 0, W - 1, H - 1, 1);
    r.dyn = r.lights.filter(l => on(l) && isDyn(l)).map(l => {
      const m = l.rad * k0 * 1.1, x0 = Math.max(0, Math.floor(l.x - m)), y0 = Math.max(0, Math.floor(l.y - m * .82)), x1 = Math.min(W - 1, Math.ceil(l.x + m)), y1 = Math.min(H - 1, Math.ceil(l.y + m * .82)), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const vars = [.92, 1, 1.08].map(k => { const rad = l.rad * k0 * k, f = new Float32Array(bw * bh * 3); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const d = Math.hypot(x0 + x - l.x, (y0 + y - l.y) * 1.25) / rad; if (d >= 1) continue; const q = Math.floor((1 - d) * (1 - d) * 7 + dith(x0 + x, y0 + y)) / 7 * tm.lk, p = (y * bw + x) * 3; f[p] = l.col[0] * q; f[p + 1] = l.col[1] * q; f[p + 2] = l.col[2] * q; } return f; });
      return { x0, y0, x1, y1, bw, bh, vars };
    });
  }
  const Ld = r.Ld;
  for (const d of r.dyn) for (let y = d.y0; y <= d.y1; y++) Ld.fill(0, (y * W + d.x0) * 3, (y * W + d.x1 + 1) * 3);
  r.dyn.forEach((d, li) => { const f = d.vars[Math.floor(hash(tick, li, 7) * 3)], rw = d.bw * 3; for (let y = 0; y < d.bh; y++) { let p = ((d.y0 + y) * W + d.x0) * 3, q = y * rw; for (let i = 0; i < rw; i++) Ld[p++] += f[q++]; } });
  for (const d of r.dyn) lightMul(r, time, d.x0, d.y0, d.x1, d.y1, 0);
}
function waterFrames(r, calm) {
  const { W } = r, wl = r.water, n = wl.length, F = calm ? 1 : WF + WX, wf = r.wf = new Uint32Array(n * F);
  for (let f = 0; f < F; f++) { const ph = f * .26; for (let k = 0; k < n; k++) { const i = wl[k], x = i % W, y = (i / W) | 0; let c = waterCol(x, y, r.own[i], ph, r.wedge[i], r.wb[k]); if (r.sh[i] > dith(x, y) * .7 + .15) c = dark(c, .62); wf[f * n + k] = pack(c); } }
}
function present(r, ctx, time, ts, o) {
  o = o || {};
  const { W, H } = r, n = W * H, cl = o.clip || { x0: 0, y0: 0, x1: W, y1: H }, calm = !!o.calm, pf = o.prof, now = () => performance.now();
  const X0 = clamp(cl.x0, 0, W), X1 = clamp(cl.x1, 0, W), Y0 = clamp(cl.y0, 0, H), Y1 = clamp(cl.y1, 0, H);
  if (X1 <= X0 || Y1 <= Y0) return;
  if (!r.work) {
    r.work = new Uint32Array(n); r.wem = new Uint8Array(n); r.L = new Float32Array(n * 3); r.Ld = new Float32Array(n * 3); r.mul = new Uint8Array(n * 3); r.img = ctx.createImageData(W, H); r.out = new Uint32Array(r.img.data.buffer); r.vg = new Uint8Array(n); r.gph = new Uint8Array(n);
    r.CW = Math.ceil(W / 16); r.neu = new Uint8Array(r.CW * Math.ceil(H / 16)); r.gb = {}; r.gw = {};
    for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) r.gph[i] = (x * .85 - y * .3 + noise(x * .006, y * .008, 171) * 520 + noise(x * .05, y * .05, 173) * 26) & 255;
    waterFrames(r, calm);
  }
  const a = r.work, e = r.wem, mul = r.mul, gph = r.gph, out = r.out, dep = r.dep;
  let t0 = pf ? now() : 0; const lap = k => { if (pf) { const t = now(); pf[k] = (pf[k] || 0) + t - t0; t0 = t; } };
  const base = r.gb[time] || (r.gb[time] = gradeArr(r.alb32, r.em, time)), wf = r.gw[time] || (r.gw[time] = gradeArr(r.wf, null, time));
  const tick = Math.floor(ts * 6), lk = time + tick;
  if (r.lkey !== lk) { lightPass(r, time, tick); r.lkey = lk; }
  lap('light');
  a.set(base.subarray(Y0 * W, Y1 * W), Y0 * W); e.set(r.em.subarray(Y0 * W, Y1 * W), Y0 * W);
  lap('base');
  const tint = calm ? 0 : Math.floor(ts * 40) & 255;
  lap('grass');
  const wl = r.water, wn = wl.length, i0 = Y0 * W, i1 = Y1 * W;
  if (calm) { for (let k = 0; k < wn; k++) a[wl[k]] = wf[k]; } else {
    const d = Math.floor(ts * 8) % WF, fa = d * wn, fb = (d + WF) * wn, fr = d < WX ? (d + 1) / (WX + 1) : 2;
    for (let k = 0; k < wn; k++) { const i = wl[k]; if (i < i0 || i >= i1) continue; a[i] = fr > 1 || B4[(((i / W) & 3) << 2) | (i % W & 3)] < fr * 16 ? wf[fa + k] : wf[fb + k]; }
  }
  lap('water');
  const gust = (x, y) => { const pv = (gph[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)] - tint) & 255; if (pv < 150) return 0; const s = Math.sin((pv - 150) / 105 * Math.PI); return s * s; };
  for (const s of r.sway) {
    if (s.x0 > X1 + 6 || s.x0 + s.w < X0 - 6 || s.y0 >= Y1 || s.y0 + s.h <= Y0) continue;
    const A = calm ? 0 : s.amp * (Math.sin(ts * 1.25 + s.ph) * .3 + gust(s.bx | 0, s.by | 0) * 1.2);
    const c32 = sprG(s.pk, time), se = s.pk.e, ra = s.pk.ra, rb = s.pk.rb, sw = s.w, key = s.key, ay = s.ay;
    for (let j = 0; j < s.h; j++) {
      const Y = s.y0 + j; if (Y < Y0 || Y >= Y1 || rb[j] <= ra[j]) continue;
      const hf = (ay - j + (j % 3)) / ay, off = hf > 0 ? Math.round(A * hf * Math.sqrt(hf)) : 0, xs = s.x0 + off, iA = Math.max(ra[j], X0 - xs), iB = Math.min(rb[j], X1 - xs), row = Y * W + xs;
      for (let i = iA, k = j * sw + iA; i < iB; i++, k++) {
        const c = c32[k]; if (!c) continue;
        const p = row + i; if (dep[p] > key) continue;
        a[p] = c; e[p] = se[k];
      }
    }
  }
  lap('sway');
  for (const ob of r.anim) {
    const s = ob.spr.frames[Math.floor(ts * 6) % ob.spr.frames.length], c32 = sprG(s.pk, time);
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const c = c32[j * s.w + i]; if (!c) continue;
      const x = ob.x - s.ax + i, y = ob.y - s.ay + j; if (x < X0 || y < Y0 || x >= X1 || y >= Y1) continue;
      const p = y * W + x; a[p] = c; e[p] = s.e[j * s.w + i];
    }
  }
  if (!calm) particles(r, ts, Math.min(.25, o.dt || .05), time, X0, X1, Y0, Y1, a, e, gust);
  lap('parts');
  const neu = r.neu, CW = r.CW;
  const slow = (xa, xb, y) => {
    for (let x = xa, i = y * W + xa, p = i * 3; x < xb; x++, i++, p += 3) {
      const c = a[i];
      if (e[i]) { out[i] = c; continue; }
      out[i] = (0xff000000 | (Math.min(255, (((c >> 16) & 255) * mul[p + 2]) >> 5) << 16) | (Math.min(255, (((c >> 8) & 255) * mul[p + 1]) >> 5) << 8) | Math.min(255, ((c & 255) * mul[p]) >> 5)) >>> 0;
    }
  };
  for (let y = Y0; y < Y1; y++) {
    const cy = (y >> 4) * CW;
    let x = X0;
    while (x < X1) {
      const isN = neu[cy + (x >> 4)];
      let xe = Math.min(X1, ((x >> 4) + 1) * 16);
      while (xe < X1 && neu[cy + (xe >> 4)] === isN) xe = Math.min(X1, xe + 16);
      if (isN) out.set(a.subarray(y * W + x, y * W + xe), y * W + x); else slow(x, xe, y);
      x = xe;
    }
  }
  lap('final');
  ctx.putImageData(r.img, 0, 0, X0, Y0, X1 - X0, Y1 - Y0);
  lap('put');
}
