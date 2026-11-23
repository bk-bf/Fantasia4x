'use strict';
const T = 16;
let SEASON = 'summer';

function cover(soil, grass, amount, fall) {
  return (x, y) => {
    const n = fbm(x * .04, y * .04, 3, 3), m = noise(x * .33, y * .33, 5), cov = n * .72 + m * .28;
    const g = SEASON === 'autumn' ? (fall || P.grassDry) : grass;
    if (cov < amount) {
      if (cov > amount - .016) return g[1];
      return rp(g, .1 + noise(x * .95, y * .3, 7) * .55 + n * .38, x, y, .5);
    }
    return rp(soil, .26 + noise(x * .3, y * .3, 9) * .3 + fbm(x * .07, y * .07, 13, 2) * .3, x, y, .5);
  };
}
const plain = (ramp, sc, lo, hi) => (x, y) => rp(ramp, lo + (hi - lo) * (noise(x * sc, y * sc, 9) * .45 + fbm(x * .06, y * .06, 13, 2) * .55), x, y, .6);

const GROUND = [
  { id: 'dirt', name: 'Barren Dirt', lvl: 4, f: plain(P.soil, .3, .3, .85), dec: [['pebble', .8, P.rockWarm], ['crack', .5, P.soil]] },
  { id: 'grass', name: 'Poor Soil', lvl: 5, f: cover(P.soilPoor, P.grassDry, .46), dec: [['tuft', 1.2, P.grassDry], ['pebble', .4, P.rockWarm]] },
  { id: 'tall_grass', name: 'Loam', lvl: 5, f: cover(P.soil, P.grassLoam, .57), dec: [['tuft', 1.6, P.grassLoam], ['flower', .12]] },
  { id: 'deep_grass', name: 'Rich Soil', lvl: 5, f: cover(P.soilRich, P.grass, .68, P.grassLoam), dec: [['tuft', 2.2, P.grass], ['flower', .2]] },
  { id: 'terra_preta', name: 'Terra Preta', lvl: 5, f: cover(P.preta, P.grass, .44, P.grassLoam), dec: [['tuft', 1, P.grass], ['pebble', .2, P.rock]] },
  { id: 'savanna', name: 'Savanna', lvl: 5, f: cover(P.soilPoor, P.savanna, .6, P.savanna), dec: [['tuft', 2.6, P.savanna], ['pebble', .2, P.rockWarm]] },
  { id: 'mossy_ground', name: 'Mossy Forest Ground', lvl: 5, f: cover(P.soilRich, P.moss, .58, P.moss), dec: [['leaf', .8], ['twig', .4], ['tuft', 1, P.moss]] },
  { id: 'tree', name: 'Forest Floor', lvl: 5, f: cover(P.litter, P.grass, .4, P.fallOrange), dec: [['leaf', 2.2], ['twig', .7], ['tuft', .5, P.grass]] },
  { id: 'moss', name: 'Moss', lvl: 3, f: cover(P.mud, P.mossSwamp, .58, P.mossSwamp), dec: [['tuft', 1.4, P.mossSwamp], ['puddle', .3]] },
  { id: 'mud', name: 'Mud', lvl: 2, f: (x, y) => { const t = noise(x * .14, y * .2, 51) * .6 + fbm(x * .05, y * .05, 53, 2) * .4; return t > .7 && noise(x * .5, y * .5, 55) > .55 ? P.mud[5] : rp(P.mud, t * .85, x, y, .4); }, dec: [['puddle', .7], ['twig', .2]] },
  { id: 'bog', name: 'Bog', lvl: 1.5, wet: 1, f: (x, y) => { const t = fbm(x * .07, y * .07, 57, 3); if (noise(x * .3, y * .3, 59) > .68 && t > .45) return rp(P.duck, noise(x, y, 61), x, y, .5); return rp(P.bog, t, x, y, .5); }, dec: [['lily', .9], ['bubble', .4], ['reedlet', .6]] },
  { id: 'clay', name: 'Clay', lvl: 3, f: (x, y) => { vor(x, y, 6, 63); if (VEDGE < .7) return P.clay[0]; return rp(P.clay, .3 + noise(x * .2, y * .2, 65) * .7, x, y, .4); }, dec: [['pebble', .3, P.rockWarm]] },
  { id: 'quicksand', name: 'Quicksand', lvl: 2, f: (x, y) => { const d = fbm(x * .06, y * .06, 67, 2); return rp(P.quick, .3 + .5 * Math.sin(d * 46) * .5 + d * .5, x, y, .5); }, dec: [['bubble', .5]] },
  { id: 'shallow_water', name: 'Shallow Water', lvl: 1, water: 1 },
  { id: 'water', name: 'Water', lvl: 0, water: 2 },
  { id: 'rapids', name: 'Rapids', lvl: 0, water: 3 },
  { id: 'riverbank', name: 'Riverbank', lvl: 3, f: plain(P.sand, .3, .15, .95), dec: [['pebble', 1.7, P.rock], ['stone', .4, P.rock], ['tuft', .5, P.grassLoam]] },
  { id: 'rocky', name: 'Rocky Ground', lvl: 5, f: (x, y) => { const id = vor(x, y, 5, 71); if (VEDGE < .6) return P.rockWarm[0]; return rp(P.rockWarm, .2 + id * .45 + noise(x * .1, y * .1, 73) * .3, x, y, .3); }, dec: [['stone', 1.1, P.rock], ['pebble', 1.4, P.rock], ['tuft', .3, P.grassDry]] },
  { id: 'cave', name: 'Cave', lvl: 4, f: (x, y) => { const id = vor(x, y, 7, 75); if (VEDGE < .6) return P.cave[0]; return rp(P.cave, .3 + id * .5 + noise(x * .1, y * .1, 77) * .3, x, y, .3); }, dec: [['pebble', .7, P.rock]] },
  { id: 'tilled', name: 'Tilled Soil', lvl: 4, hard: 1, f: (x, y) => P.tilled[clamp([0, 4, 3, 2][y & 3] - (hash(x >> 1, y >> 2, 81) > .7 ? 1 : 0), 0, 4)], dec: [] },
  { id: 'clay_blue', name: 'Blue Clay', lvl: 3, f: (x, y) => { vor(x, y, 6, 63); if (VEDGE < .7) return P.clayBlue[0]; return rp(P.clayBlue, .3 + noise(x * .2, y * .2, 65) * .7, x, y, .4); }, dec: [] },
];
const G = {}; GROUND.forEach((g, i) => G[g.id] = i);

function waterCol(x, y, kind, ph, edge) {
  const ramp = kind === 1 ? P.shallow : P.deep;
  let t = .12 + fbm(x * .045, y * .045, 31, 2) * .5;
  const rip = noise(x * .17 + 40, y * .55 - ph * .9, 33);
  if (rip > .7) t += .22; else if (rip < .25) t -= .1;
  if (kind === 1 && hash(x >> 1, y >> 1, 37) > .9) t -= .22;
  if (edge === 1) t -= .3;
  if (kind === 3) {
    const f = noise(x * .42 + 9, y * .11 - ph * 1.7, 35) + (noise(x * .9, y * .9 - ph * 2, 39) - .5) * .4;
    if (f > .68) return P.foam[f > .8 ? 2 : 1];
    if (f > .6) return P.shallow[4];
    t += .15;
  }
  if (edge === 2) return ph % 2 < 1 ? P.foam[1] : P.foam[0];
  if (SEASON === 'winter' && kind === 1 && fbm(x * .08, y * .08, 91, 2) > .5) return rp(P.ice, .4 + noise(x * .2, y * .2, 93) * .6, x, y, .4);
  return rp(ramp, t, x, y, .55);
}

const stoneTex = (ramp, bw, bh) => (x, y) => {
  const row = Math.floor(y / bh), xx = x + (row & 1) * (bw >> 1);
  if (y % bh === 0 || xx % bw === 0) return ramp[1];
  const h = hash(Math.floor(xx / bw), row, 101);
  return ramp[3 + Math.floor(h * 2.4) - (y % bh === bh - 1 ? 1 : 0)];
};
const rockCap = (x, y, dist) => {
  const id1 = vor(x, y, 13, 41), e1 = VEDGE, id2 = vor(x + 31, y + 17, 5, 42), e2 = VEDGE;
  let t = .66 + (id1 - .5) * .34 + (id2 - .5) * .16 + (fbm(x * .03, y * .03, 43, 2) - .5) * .3 - Math.min(dist, 4) * .03;
  if (e1 < 1) t -= .3; else if (e1 < 2.2 && id1 > .5) t += .12; else if (e2 < .6) t -= .1;
  if (SEASON === 'winter' && t > .7 && e1 >= 1) return P.snow[t > .84 ? 4 : t > .76 ? 3 : 2];
  return rp(P.rock, t, x, y, .3);
};
const rockFace = (x, y, fy, fh) => {
  const col = Math.floor((x + noise(x * .15, y * .1, 44) * 3) / 3);
  let t = .34 + hash(col, 3, 45) * .2 - fy / fh * .26 + (noise(x * .45, y * .14, 45) - .5) * .2;
  if (hash(col, 5, 46) > .72) t -= .14;
  if (fy === 0) return P.rock[6];
  if (fy === 1) t += .2;
  return rp(P.rockWarm, t, x, y, .35);
};
const faceOf = (tex, drop) => (x, y, fy) => { const c = tex(x, y); return fy === 0 ? c : dark(c, drop); };
const RUNE = [0b01110, 0b10101, 0b11011, 0b10101, 0b01110, 0b00100, 0b11111, 0b01010, 0b10001, 0b01110];

const WALLS = [null,
  { id: 'mountain', name: 'Mountain Wall', h: 12, rock: 1, ramp: P.rock, cap: rockCap, face: rockFace },
  { id: 'stone', name: 'Stone Block Wall', h: 7, ramp: P.stone, cap: stoneTex(P.stone, 8, 5), face: faceOf(stoneTex(P.stone, 8, 4), .72) },
  { id: 'mudbrick', name: 'Mud Brick Wall', h: 7, ramp: P.brick, cap: stoneTex(P.brick, 6, 3), face: faceOf(stoneTex(P.brick, 6, 3), .72) },
  { id: 'daub', name: 'Daub Wall', h: 7, ramp: P.daub, rim: P.plank[4],
    cap: (x, y) => rp(P.daub, .56 + (noise(x * .3, y * .3, 111) - .5) * .5 + (fbm(x * .08, y * .08, 112, 2) - .5) * .3, x, y, .5),
    face: (x, y, fy) => fy === 0 || x % 8 === 0 ? P.wood[fy === 0 ? 4 : 2] : (x + fy) % 8 === 4 ? P.wood[2] : rp(P.daub, .42 + (noise(x * .3, y * .3, 113) - .5) * .4, x, y, .4) },
  { id: 'wicker', name: 'Wicker Wall', h: 6, thin: 6, ramp: P.wicker,
    cap: (x, y) => x % 8 === 0 ? P.wood[4] : P.wicker[((x >> 1) + (y >> 1)) & 1 ? 4 : 2],
    face: (x, y, fy) => x % 8 === 0 ? P.wood[3] : P.wicker[((x >> 1) + fy) & 1 ? 3 : 1] },
  { id: 'branch', name: 'Branch Wall', h: 6, thin: 5, ramp: P.wood,
    cap: (x, y) => x % 3 === 0 ? P.wood[1] : P.wood[3 + Math.floor(hash(Math.floor(x / 3), y >> 2, 115) * 2.5)],
    face: (x, y, fy) => x % 3 === 0 ? P.wood[0] : fy === 2 ? P.cloth[2] : P.wood[2 + Math.floor(hash(Math.floor(x / 3), 3, 117) * 2.2)] },
  { id: 'concrete', name: 'Reinforced Concrete Wall', h: 8, ramp: P.concrete,
    cap: (x, y) => x % 16 === 0 || y % 16 === 0 ? P.concrete[2] : P.concrete[noise(x * .2, y * .2, 119) > .62 ? 3 : 4],
    face: (x, y, fy) => (x % 8 === 4 && fy === 2) ? P.iron[5] : (x % 8 === 4 && fy === 3) ? P.iron[1] : x % 16 === 0 ? P.concrete[1] : P.concrete[fy === 0 ? 4 : fy > 5 ? 1 : 2] },
  { id: 'runed', name: 'Runed Concrete Wall', h: 8, ramp: P.concrete, runed: 1,
    cap: (x, y) => (x % 16 === 8 && y % 4 < 2) ? P.mana[4] : x % 16 === 0 || y % 16 === 0 ? P.concrete[0] : P.concrete[noise(x * .2, y * .2, 119) > .62 ? 1 : 2],
    face: (x, y, fy) => { const lx = x % 16, r = RUNE[Math.floor(hash(x >> 4, y >> 4, 121) * 5) * 2 + (lx >= 8 ? 1 : 0)]; const cx = (lx % 8) - 1, cy = fy - 2; if (cx >= 0 && cx < 5 && cy >= 0 && cy < 5 && (r >> (4 - cx)) & 1 && cy % 2 === 0) return P.mana[4]; return P.concrete[fy === 0 ? 3 : fy > 5 ? 0 : 1]; } },
  { id: 'palisade', name: 'Palisade', h: 11, thin: 5, ramp: P.wood,
    cap: (x, y) => { const lx = x & 3, ly = y % 5; return lx === 0 ? P.wood[0] : ly < 1 ? P.plank[4] : lx === 1 ? P.plank[3] : P.plank[lx === 2 ? 2 : 1]; },
    face: (x, y, fy) => { const lx = x & 3; return lx === 0 ? P.wood[0] : fy === 6 ? P.leather[1] : P.wood[[0, 4, 3, 2][lx] - (hash(x, fy >> 1, 123) > .75 ? 1 : 0)]; } },
  { id: 'barricade', name: 'Barricade', h: 6, thin: 5, ramp: P.wood,
    cap: (x, y) => ((x + y) % 5 === 0) ? P.plank[4] : ((x - y + 64) % 5 === 0) ? P.plank[2] : P.wood[2],
    face: (x, y, fy) => ((x + fy) % 5 === 0) ? P.plank[3] : ((x - fy + 64) % 5 === 0) ? P.plank[1] : (x + fy) % 2 ? P.wood[1] : null },
];
const WL = {}; WALLS.forEach((w, i) => { if (w) WL[w.id] = i; });

const FLOORS = [null,
  { id: 'plank', name: 'Plank Floor', f: (x, y) => { const row = y >> 2, xx = x + hash(row, 0, 131) * 12; if ((y & 3) === 0) return P.plank[1]; if (Math.floor(xx) % 13 === 0) return P.plank[1]; return P.plank[2 + Math.floor(hash(Math.floor(xx / 13), row, 133) * 2.3) + ((y & 3) === 1 ? 1 : 0)]; } },
  { id: 'flagstone', name: 'Flagstone Floor', f: (x, y) => { const id = vor(x, y, 6, 135); if (VEDGE < .9) return P.stone[0]; return P.stone[2 + Math.floor(id * 2.6) + (VEDGE < 1.8 && id > .5 ? 1 : 0)]; } },
  { id: 'earth', name: 'Packed-Earth Floor', f: (x, y) => rp(P.soil, .66 + (noise(x * .2, y * .2, 137) - .5) * .3, x, y, .4) },
  { id: 'branchf', name: 'Branch Floor', f: (x, y) => (x & 1) ? P.wood[1 + (hash(x, y >> 3, 139) > .5 ? 1 : 0)] : P.wood[3 + Math.floor(hash(x, y >> 3, 141) * 2)] },
  { id: 'rush', name: 'Rush Floor', f: (x, y) => (y % 4 === 0) ? P.thatch[1] : P.thatch[2 + ((x + (y >> 2) * 2) % 4 < 2 ? 1 : 0) + (hash(x >> 1, y, 143) > .8 ? 1 : 0)] },
  { id: 'clayf', name: 'Rammed-Clay Floor', f: (x, y) => rp(P.clay, .5 + (noise(x * .15, y * .15, 145) - .5) * .4, x, y, .25) },
  { id: 'brickf', name: 'Mud-Brick Floor', f: (x, y) => { const c = stoneTex(P.brick, 8, 4)(x, y); return c === P.brick[1] ? P.brick[2] : c; } },
];
const FL = {}; FLOORS.forEach((w, i) => { if (w) FL[w.id] = i; });

const ROOFS = {
  thatch: (x, y, u) => { const row = Math.floor((y + (hash(x >> 1, 0, 151) > .5 ? 1 : 0)) / 4); let k = 3 + (hash(x, row, 153) > .6 ? 1 : 0) - (hash(x, row, 155) > .85 ? 1 : 0); if ((y & 3) === 3) k -= 2; return P.thatch[clamp(k + u, 0, 5)]; },
  tile: (x, y, u) => { const row = Math.floor(y / 4), xx = x + (row & 1) * 3; let k = 2 + (hash(Math.floor(xx / 6), row, 157) > .5 ? 1 : 0); if (y % 4 === 3) k -= 2; else if (xx % 6 === 0) k -= 1; else if (y % 4 === 0) k += 1; return P.rooftile[clamp(k + u, 0, 4)]; },
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
    const o = { spr, x: tx * T + 8 + (dx || 0), y: ty * T + 12 + (dy || 0) };
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

function renderWorld(w, opt) {
  SEASON = opt.season || 'summer';
  const W = w.W * T, H = w.H * T, winter = SEASON === 'winter';
  const alb = new Uint8ClampedArray(W * H * 3), em = new Uint8Array(W * H), own = new Uint8Array(W * H), wedge = new Uint8Array(W * H);
  const px = (x, y, c, e) => {
    if (x < 0 || y < 0 || x >= W || y >= H || !c) return;
    const i = y * W + x; alb[i * 3] = c[0]; alb[i * 3 + 1] = c[1]; alb[i * 3 + 2] = c[2]; em[i] = e || 0; own[i] = 0;
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

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = x >> 4, ty = y >> 4, ti = ty * w.W + tx, i = y * W + x;
    let c;
    if (w.floor[ti]) {
      c = FLOORS[w.floor[ti]].f(x, y);
      const lx = x & 15, ly = y & 15;
      if ((ly === 0 && !w.floor[ti - w.W] && !w.wAt(tx, ty - 1)) || (lx === 0 && !w.floor[ti - 1] && !w.wAt(tx - 1, ty)) || (ly === 15 && !w.floor[ti + w.W] && !w.wAt(tx, ty + 1)) || (lx === 15 && !w.floor[ti + 1] && !w.wAt(tx + 1, ty))) c = dark(c, .6);
    } else {
      const wx = x + (noise(x * .085, y * .085, 11) - .5) * 11 + (noise(x * .31, y * .31, 12) - .5) * 3.4;
      const wy = y + (noise(x * .085, y * .085, 14) - .5) * 11 + (noise(x * .31, y * .31, 15) - .5) * 3.4;
      let t = w.g[ti];
      const hard = GROUND[t].hard;
      if (!hard) { const t2 = typeAt(wx, wy); if (!GROUND[t2].hard) t = t2; }
      const g = GROUND[t];
      if (g.water) {
        let edge = 0;
        const up = hard ? t : typeAt(wx, wy - 3.2), near = Math.max(GROUND[typeAt(wx + 1.6, wy)].lvl, GROUND[typeAt(wx - 1.6, wy)].lvl, GROUND[typeAt(wx, wy + 1.6)].lvl, GROUND[typeAt(wx, wy - 1.6)].lvl);
        if (GROUND[up].lvl > 1.6) edge = 1;
        if (near > 1.6 && hash(x >> 1, y, 17) > .35) edge = 2;
        own[i] = g.water; wedge[i] = edge;
        c = waterCol(x, y, g.water, 0, edge);
      } else {
        c = g.f(x, y);
        if (!hard) {
          const up = GROUND[typeAt(wx, wy - 2.2)], dn = GROUND[typeAt(wx, wy + 2.2)];
          if (up.lvl > g.lvl + .4 && !up.water) c = dark(c, .7);
          else if (dn.lvl < g.lvl - .4 && dn.lvl < 2) c = dark(c, .82);
        }
        if (winter && !g.wet && !indoor[ti]) {
          const sn = fbm(x * .035, y * .035, 21, 2) * .86 + noise(x * .3, y * .3, 23) * .14;
          const thr = g.hard ? .5 : .4;
          if (sn > thr + (dith(x, y) - .5) * .06) c = sn < thr + .035 ? P.snow[1] : rp(P.snow, .62 + (sn - .5) * 1.6 + (noise(x * .1, y * .16, 25) - .5) * .5, x, y, .5);
        }
      }
    }
    alb[i * 3] = c[0]; alb[i * 3 + 1] = c[1]; alb[i * 3 + 2] = c[2];
  }

  const FLW = [P.red[4], P.gold[4], P.purple[4], P.cloth[5], hex('#e06bb5')];
  const dpx = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const ti = (y >> 4) * w.W + (x >> 4); if (w.floor[ti] || w.wall[ti]) return; px(x, y, c); };
  for (let ty = 0; ty < w.H; ty++) for (let tx = 0; tx < w.W; tx++) {
    const ti = ty * w.W + tx, g = GROUND[w.g[ti]];
    if (w.floor[ti] || w.wall[ti] || !g.dec) continue;
    let k = 0;
    for (const [kind, dens, ramp] of g.dec) {
      const cnt = Math.floor(dens + hash(tx, ty, 201 + k));
      for (let j = 0; j < cnt; j++) {
        k++;
        const x = tx * T + Math.floor(hash(tx, ty, 300 + k) * 16), y = ty * T + Math.floor(hash(tx, ty, 400 + k) * 16), h = hash(tx, ty, 500 + k);
        if (winter && kind !== 'stone' && h < .7) continue;
        const n = ramp ? ramp.length - 1 : 0;
        if (kind === 'tuft') { const r2 = SEASON === 'autumn' && ramp !== P.moss ? P.grassDry : ramp, m = r2.length - 1; dpx(x, y, r2[0]); dpx(x - 1, y - 1, r2[m - 2]); dpx(x, y - 1, r2[m - 1]); dpx(x, y - 2, r2[m]); dpx(x + 1, y - 1, r2[m - 2]); if (h > .5) dpx(x + 1, y - 2, r2[m - 1]); }
        else if (kind === 'pebble') { dpx(x, y, ramp[n - 1]); dpx(x + 1, y, ramp[n - 3]); dpx(x, y + 1, ramp[n - 4]); dpx(x + 1, y + 1, ramp[1]); }
        else if (kind === 'stone') { dpx(x, y, ramp[n]); dpx(x + 1, y, ramp[n - 1]); dpx(x + 2, y, ramp[n - 3]); dpx(x - 1, y + 1, ramp[n - 1]); dpx(x, y + 1, ramp[n - 2]); dpx(x + 1, y + 1, ramp[n - 3]); dpx(x + 2, y + 1, ramp[n - 4]); dpx(x, y + 2, ramp[1]); dpx(x + 1, y + 2, ramp[0]); dpx(x + 2, y + 2, ramp[0]); if (winter) dpx(x, y, P.snow[4]); }
        else if (kind === 'crack') { dpx(x, y, ramp[0]); dpx(x + 1, y + 1, ramp[0]); dpx(x + 2, y + 1, ramp[0]); if (h > .5) dpx(x + 3, y + 2, ramp[0]); }
        else if (kind === 'flower') { dpx(x, y, FLW[Math.floor(h * 5)]); dpx(x, y + 1, P.grass[2]); }
        else if (kind === 'leaf') { const c = (SEASON === 'summer' ? P.litter : P.fallOrange)[2 + Math.floor(h * 3)]; dpx(x, y, c); if (h > .4) dpx(x + 1, y, dark(c, .75)); }
        else if (kind === 'twig') { dpx(x, y, P.wood[3]); dpx(x + 1, y, P.wood[4]); dpx(x + 2, y - 1, P.wood[3]); dpx(x + 3, y - 1, P.wood[2]); }
        else if (kind === 'puddle') { for (let a = -2; a <= 2; a++) dpx(x + a, y, P.mud[0]); for (let a = -1; a <= 1; a++) dpx(x + a, y - 1, P.mud[0]); dpx(x - 1, y - 1, P.mud[5]); }
        else if (kind === 'lily') { const L = P.duck; dpx(x, y, L[2]); dpx(x + 1, y, L[1]); dpx(x - 1, y, L[1]); dpx(x, y + 1, L[0]); dpx(x - 1, y + 1, L[0]); if (h > .7) dpx(x, y - 1, P.cloth[5]); }
        else if (kind === 'bubble') { dpx(x, y, P.bog[4]); dpx(x + 1, y + 1, P.bog[0]); }
        else if (kind === 'reedlet') { for (let a = 0; a < 4 + h * 3; a++) dpx(x, y - a, P.grassLoam[2 + (a > 2 ? 1 : 0)]); dpx(x, y - 6, P.leather[2]); }
      }
    }
  }

  const sh = new Float32Array(W * H);
  const objs = w.objs.slice().sort((a, b) => a.y - b.y);
  for (const o of objs) {
    const s = o.spr.sh; if (!s) continue;
    const cx = o.x + s.dx, cy = o.y + s.dy;
    for (let y = Math.floor(cy - s.ry); y <= cy + s.ry; y++) for (let x = Math.floor(cx - s.rx); x <= cx + s.rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const nx = (x - cx) / s.rx, ny = (y - cy) / s.ry, q = nx * nx + ny * ny;
      if (q < 1) { const v = (s.k || 1) * clamp((1 - q) * 2.6, 0, 1); if (v > sh[y * W + x]) sh[y * W + x] = v; }
    }
  }
  const wh = (x, y) => { const m = w.wAt(x >> 4, y >> 4); return m ? WALLS[m].h : 0; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, ti = (y >> 4) * w.W + (x >> 4);
    if (w.wall[ti]) continue;
    let s = sh[i];
    if (x > 9 && y > 6) { if (wh(x - 3, y - 2) >= 4 || wh(x - 6, y - 4) >= 7 || wh(x - 9, y - 5) >= 10 || wh(x - 12, y - 7) >= 12) s = 1; }
    let k = 1;
    if (s > dith(x, y) * .9 + .05) k = .58;
    if (indoor[ti]) k *= .9;
    if (k < 1) { alb[i * 3] *= k; alb[i * 3 + 1] *= k; alb[i * 3 + 2] *= Math.min(1, k + .12); }
  }

  const blit = (s, x0, y0) => {
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) { const c = s.c[j * s.w + i]; if (c) px(x0 - s.ax + i, y0 - s.ay + j, c, s.e[j * s.w + i]); }
  };
  const snowOn = (x, y, thr) => winter && fbm(x * .07, y * .07, 27, 2) + (dith(x, y) - .5) * .1 > (thr || .5);
  const drawWall = (tx, ty) => {
    const ti = ty * w.W + tx, m = WALLS[w.wall[ti]], X = tx * T, Y = ty * T, h = m.h;
    const same = (a, b) => { const o = w.wAt(tx + a, ty + b); return o && (m.thin ? WALLS[o].thin : !WALLS[o].thin); };
    const any = (a, b) => !!w.wAt(tx + a, ty + b);
    const N = same(0, -1), S = same(0, 1), E = any(1, 0), Wn = any(-1, 0);
    const feat = w.feat[ti], ore = w.ore[ti];
    const mask = (lx, ly) => {
      if (!m.thin) return true;
      const d = m.thin, strip = ly >= 16 - d && (E || lx <= 10) && (Wn || lx >= 5), col = (N || S) && lx >= 5 && lx <= 10 && (N || ly >= 16 - d);
      return ((!(N || S) || E || Wn) && strip) || col;
    };
    for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
      if (!mask(lx, ly)) continue;
      const x = X + lx, y = Y + ly - h;
      let c = m.cap(x, y + h, dist[ti]), e = 0;
      if (!c) continue;
      if (m.runed && c === P.mana[4]) e = 255;
      if (ore) { const v = Math.abs(noise(x * .16, y * .16, 61 + ore.seed) - .5), on = noise(x * .5, y * .5, 63 + ore.seed); if (v < .065 || on > .72) { c = ore.ramp[clamp(Math.floor((v < .065 ? 2.4 - v * 26 : (on - .72) * 12) + hash(x, y, 3) * 1.2), 0, 3)]; if (ore.glow && (v < .02 || on > .85)) e = 140; } else if (v < .09) c = dark(c, .68); }
      if (feat === 1) c = P.plank[(lx % 4 === 0 || ly === 3 || ly === 12) ? 1 : 3];
      const eN = m.thin ? !mask(lx, ly - 1) && !(ly === 0 && N) : ly === 0 && !any(0, -1), eW = m.thin ? !mask(lx - 1, ly) && !(lx === 0 && Wn) : lx === 0 && !Wn;
      const eE = m.thin ? !mask(lx + 1, ly) && !(lx === 15 && E) : lx === 15 && !E;
      if (eN || eW) c = m.rim || m.ramp[m.ramp.length - 1]; else if (eE) c = dark(c, .7);
      if (!m.rock && snowOn(x, y, .5)) c = rp(P.snow, .75 + (noise(x * .2, y * .2, 29) - .5) * .5, x, y, .4);
      px(x, y, c, e);
    }
    if (!S) {
      for (let fy = 0; fy < h; fy++) for (let lx = 0; lx < 16; lx++) {
        if (!mask(lx, 15)) continue;
        const x = X + lx, y = Y + 16 - h + fy;
        let c = m.face(x, y, fy, h), e = 0;
        if (!c) continue;
        if (m.runed && c === P.mana[4]) e = 255;
        if (ore) { const v = Math.abs(noise(x * .16, y * .16, 61 + ore.seed) - .5), on = noise(x * .5, y * .5, 63 + ore.seed); if (v < .065 || on > .72) { c = dark(ore.ramp[clamp(Math.floor((v < .065 ? 2.4 - v * 26 : (on - .72) * 12) + hash(x, y, 3) * 1.2), 0, 3)], .85); if (ore.glow && (v < .02 || on > .85)) e = 120; } }
        if (feat === 1) { c = P.plank[lx < 3 || lx > 12 ? 0 : fy === 0 ? 1 : (lx % 3 === 0 ? 2 : 4)]; if (lx === 11 && fy === 3) c = P.iron[5]; }
        if (feat === 2 && lx >= 4 && lx <= 11 && fy >= 1 && fy <= 4) { c = (lx === 4 || lx === 11 || fy === 1 || lx === 7 || lx === 8) ? P.wood[1] : P.deep[fy === 2 ? 4 : 2]; if (c !== P.wood[1]) e = 254; }
        if ((lx === 0 && !Wn) || (m.thin && !mask(lx - 1, 15))) c = dark(c, 1.12); else if ((lx === 15 && !E) || (m.thin && !mask(lx + 1, 15))) c = dark(c, .75);
        if (fy === h - 1) c = dark(c, .72);
        px(x, y, c, e);
      }
    }
  };
  let oi = 0;
  for (let ty = 0; ty < w.H; ty++) {
    while (oi < objs.length && objs[oi].y < (ty + 1) * T) { const o = objs[oi++]; if (!o.spr.frames) blit(o.spr, o.x, o.y); }
    for (let tx = 0; tx < w.W; tx++) if (w.wall[ty * w.W + tx]) drawWall(tx, ty);
  }
  while (oi < objs.length) { const o = objs[oi++]; if (!o.spr.frames) blit(o.spr, o.x, o.y); }

  const hidden = [];
  if (opt.roofs) for (const r of w.roofs) {
    const x0 = r.x0 * T - 2, x1 = (r.x1 + 1) * T + 2, y0 = r.y0 * T - r.h - 5, y1 = (r.y1 + 1) * T - r.h + 2, tex = ROOFS[r.kind], mid = (y0 + y1) / 2, hw = (y1 - y0) / 2;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const v = (y - mid) / hw;
      let u = v < 0 ? 1 : -1;
      if (Math.abs(y - mid) < 1.5) u = 2;
      if (x < x0 + 2 || y === y0) u += 1;
      if (x >= x1 - 2) u -= 1;
      let c = tex(x, y, u);
      if (y >= y1 - 1) c = dark(c, .55);
      if (winter && v < .45 + (noise(x * .3, 0, 31) - .5) * .5 + (dith(x, y) - .5) * .2) c = rp(P.snow, (v < 0 ? .85 : .55) + (noise(x * .2, y * .2, 29) - .5) * .4, x, y, .4);
      px(x, y, c);
    }
    for (let y = y1; y < y1 + 4; y++) for (let x = x0 + 3; x < x1 + 4; x++) if (y < H && x < W && dith(x, y) > .3) { const i = y * W + x; alb[i * 3] *= .62; alb[i * 3 + 1] *= .62; alb[i * 3 + 2] *= .72; }
    hidden.push(r);
  }

  const lights = [], anim = [];
  for (const o of objs) {
    const cov = hidden.some(r => o.x >= r.x0 * T && o.x < (r.x1 + 1) * T && o.y >= r.y0 * T && o.y < (r.y1 + 1) * T);
    if (o.spr.emit && !cov) lights.push({ x: o.x + o.spr.emit.dx, y: o.y + o.spr.emit.dy, ...o.spr.emit });
    if (o.spr.frames && !cov) anim.push(o);
  }
  for (let ty = 0; ty < w.H; ty++) for (let tx = 0; tx < w.W; tx++) {
    const ti = ty * w.W + tx;
    if (w.feat[ti] === 2 && !w.wAt(tx, ty + 1)) lights.push({ x: tx * T + 8, y: ty * T + 18, rad: 26, col: [1, .7, .35], night: 1 });
    if (w.wall[ti] && WALLS[w.wall[ti]].runed && (tx + ty) % 2 === 0) lights.push({ x: tx * T + 8, y: ty * T + 10, rad: 20, col: [.3, .7, 1] });
    if (w.ore[ti] && w.ore[ti].glow && dist[ti] < 2) lights.push({ x: tx * T + 8, y: ty * T + 4, rad: 18, col: w.ore[ti].glow });
  }
  const water = [];
  for (let i = 0; i < own.length; i++) if (own[i]) water.push(i);
  return { W, H, alb, em, own, wedge, sh, lights, anim, water: Int32Array.from(water), blit: null };
}

const TIMES = {
  day: { amb: [1, 1, 1], lk: .22, vig: .16 },
  dusk: { amb: [.86, .6, .56], lk: .6, vig: .2 },
  night: { amb: [.24, .29, .5], lk: 1, vig: .24 },
};
function present(r, ctx, time, tick, noVig) {
  const { W, H } = r, tm = TIMES[time], n = W * H;
  if (!r.work) { r.work = new Uint8ClampedArray(r.alb.length); r.wem = new Uint8Array(n); r.L = new Float32Array(n * 3); r.img = ctx.createImageData(W, H); }
  const a = r.work, e = r.wem, L = r.L;
  a.set(r.alb); e.set(r.em);
  const ph = tick * .5;
  for (let k = 0; k < r.water.length; k++) {
    const i = r.water[k], x = i % W, y = (i / W) | 0;
    let c = waterCol(x, y, r.own[i], ph, r.wedge[i]);
    if (r.sh[i] > dith(x, y) * .9 + .05) c = dark(c, .62);
    a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2];
  }
  for (const o of r.anim) {
    const s = o.spr.frames[tick % o.spr.frames.length];
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const c = s.c[j * s.w + i]; if (!c) continue;
      const x = o.x - s.ax + i, y = o.y - s.ay + j; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const p = y * W + x; a[p * 3] = c[0]; a[p * 3 + 1] = c[1]; a[p * 3 + 2] = c[2]; e[p] = s.e[j * s.w + i];
    }
  }
  L.fill(0);
  for (let li = 0; li < r.lights.length; li++) {
    const l = r.lights[li];
    if (l.night && time === 'day') continue;
    let rad = l.rad * (time === 'day' ? .7 : 1);
    if (l.flicker) rad *= .9 + hash(tick, li, 7) * .2;
    if (l.pulse) rad *= .93 + .07 * Math.sin(tick * .5 + li);
    const x0 = Math.max(0, Math.floor(l.x - rad)), x1 = Math.min(W - 1, Math.ceil(l.x + rad)), y0 = Math.max(0, Math.floor(l.y - rad)), y1 = Math.min(H - 1, Math.ceil(l.y + rad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - l.x, (y - l.y) * 1.25) / rad;
      if (d >= 1) continue;
      const q = Math.floor((1 - d) * (1 - d) * 6 + dith(x, y)) / 6 * tm.lk, p = (y * W + x) * 3;
      L[p] += l.col[0] * q; L[p + 1] += l.col[1] * q; L[p + 2] += l.col[2] * q;
    }
  }
  const o = r.img.data, cx = (W - 1) / 2, cy = (H - 1) / 2, am = tm.amb, night = time !== 'day';
  for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    const p = i * 3, j = i * 4, ev = e[i];
    let r0 = am[0] + L[p], g0 = am[1] + L[p + 1], b0 = am[2] + L[p + 2];
    let cr = a[p], cg = a[p + 1], cb = a[p + 2];
    if (ev === 254) { if (night) { cr = 250; cg = 190; cb = 96; r0 = g0 = b0 = 1; } }
    else if (ev) { const k = ev / 255; r0 = Math.max(r0, k + am[0] * (1 - k)); g0 = Math.max(g0, k + am[1] * (1 - k)); b0 = Math.max(b0, k + am[2] * (1 - k)); }
    let v = clamp((Math.hypot((x - cx) / cx, (y - cy) / cy) - .62) / .8, 0, 1);
    v = noVig ? 0 : Math.min(4, Math.floor(v * v * (3 - 2 * v) * 4 + dith(x, y))) * tm.vig;
    const f = 1 - v;
    o[j] = cr * Math.min(r0, 1.5) * f; o[j + 1] = cg * Math.min(g0, 1.5) * f; o[j + 2] = cb * Math.min(b0, 1.5) * (f + v * .25); o[j + 3] = 255;
  }
  ctx.putImageData(r.img, 0, 0);
}
