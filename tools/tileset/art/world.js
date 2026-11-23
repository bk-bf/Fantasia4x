'use strict';
let SEASON = 'summer';

function grassTex(ramp, seed) {
  const n = ramp.length - 1;
  return (x, y) => {
    const big = pfbm(x, y, .021, seed, 3), mid = pn(x, y, .1, .1, seed + 5);
    let k = n - 3 + (big > .57 ? 1 : big < .43 ? -1 : 0);
    const off = Math.floor(hash(x, 0, seed + 7) * 6), yy = wrap(y + off, PER), cy = Math.floor(yy / 6), py = yy - cy * 6, h = hash(x, cy, seed + 9);
    if (h > .58) { if (py === 0) k += 2; else if (py < 4) k += 1; } else if (h < .2 && py > 2) k -= 1;
    if (mid > .76) k += 1; else if (mid < .2) k -= 1;
    return ramp[clamp(k, 0, n)];
  };
}
function soilTex(ramp, seed) {
  const n = ramp.length - 1;
  return (x, y) => {
    const big = pfbm(x, y, .03, seed, 2), m = pn(x, y, .15, .15, seed + 3), h = hash(x, y, seed + 5);
    let k = n - 3 + (big > .58 ? 1 : big < .4 ? -1 : 0) + (m > .74 ? 1 : m < .22 ? -1 : 0);
    if (h > .95) k += 1; else if (h < .06) k -= 1;
    return ramp[clamp(k, 0, n)];
  };
}
const covAt = (x, y) => pfbm(x, y, .02, 3, 3) * .72 + pn(x, y, .17, .17, 5) * .28;
function cover(soil, grass, amount) {
  return (x, y) => {
    const cov = covAt(x, y);
    if (cov < amount) { const c = grass(x, y); return cov > amount - .011 ? dark(c, .7) : c; }
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
  const id = pvor(x, y, sc, seed), e = VEDGE, nw = VDX + VDY < 0;
  if (e < 1) return ramp[0];
  let k = lo + Math.floor(id * 2.6);
  if (e < 2.4) k += nw ? 1 : -1;
  if (hash(x, y, seed + 3) > .95) k -= 1;
  return ramp[clamp(k, 0, ramp.length - 1)];
};
const bogTex = (x, y) => {
  const t = pfbm(x, y, .035, 57, 3);
  if (pn(x, y, .15, .15, 59) > .66 && t > .45) { const id = pvor(x, y, 3.2, 61); return VEDGE < .7 ? P.bog[1] : P.duck[clamp(Math.floor(id * 2) + (VDX + VDY < 0 ? 1 : 0), 0, 2)]; }
  let k = t > .58 ? 3 : t > .5 ? 2 : t > .42 ? 1 : 0;
  if (pn(x, y, .1, .7, 62) > .8) k += 1;
  return P.bog[clamp(k, 0, 4)];
};
const GROUND = [
  { id: 'dirt', f: GT.soil, dec: [['pebble', 2.2, P.rockWarm], ['stone', .5, P.rockWarm], ['crack', .8, P.soil], ['tuft', .3, P.grassDry]] },
  { id: 'grass', f: cover(GT.poor, GT.dry, .46), dec: [['tuft', 2.4, P.grassDry], ['pebble', 1, P.rockWarm], ['stone', .25, P.rockWarm]] },
  { id: 'tall_grass', f: cover(GT.soil, GT.loam, .57), dec: [['tuft', 3, P.grassLoam], ['flower', .35], ['clover', .5]] },
  { id: 'deep_grass', f: cover(GT.rich, GT.lush, .68), dec: [['tuft', 3.6, P.grass], ['flower', .5], ['clover', .8]] },
  { id: 'savanna', f: cover(GT.poor, GT.sav, .6), dec: [['tuft', 4, P.savanna], ['pebble', .5, P.rockWarm]] },
  { id: 'mossy_ground', f: cover(GT.rich, GT.moss, .58), dec: [['leaf', 2.5], ['twig', .9], ['tuft', 1.6, P.moss], ['shroomlet', .25]] },
  { id: 'tree', f: cover(GT.litter, GT.lush, .4), dec: [['leaf', 6], ['twig', 1.5], ['tuft', 1, P.grass], ['shroomlet', .2]] },
  { id: 'mud', f: GT.mud, dec: [['puddle', 1.2], ['twig', .4]] },
  { id: 'moss', f: cover(GT.mud, GT.swamp, .58), dec: [['tuft', 2.6, P.mossSwamp], ['puddle', .5]] },
  { id: 'bog', f: bogTex, dec: [['lily', 1.6], ['bubble', .8], ['reedlet', 1]] },
  { id: 'clay', f: plates(P.clay, 10, 63, 1), dec: [['pebble', .6, P.rockWarm]] },
  { id: 'shallow_water', f: (x, y) => waterCol(x, y, 1) },
  { id: 'water', f: (x, y) => waterCol(x, y, 2) },
  { id: 'rapids', f: (x, y) => waterCol(x, y, 3) },
  { id: 'riverbank', f: GT.sand, dec: [['pebble', 4, P.rock], ['stone', 1, P.rock], ['tuft', .8, P.grassLoam]] },
  { id: 'rocky', f: plates(P.rockWarm, 11, 71, 1), dec: [['stone', 1.6, P.rock], ['pebble', 3, P.rock], ['tuft', .6, P.grassDry]] },
  { id: 'cave', f: plates(P.cave, 13, 75, 1), dec: [['pebble', 1.6, P.rock], ['stone', .4, P.rock]] },
  { id: 'tilled', f: (x, y) => { const py = y & 7; let k = [0, 1, 3, 4, 4, 3, 2, 1][py]; if (hash(x >> 1, y >> 1, 81) > .8) k -= 1; if (hash(x, y, 83) > .95) k += 1; return P.tilled[clamp(k, 0, 4)]; }, dec: [] },
];

function waterBase(x, y, kind) {
  let t = .12 + pfbm(x, y, .022, 31, 2) * .5;
  if (kind === 1 && pvor(x, y, 7, 37) > .8 && VEDGE > 1.4) t -= .2;
  return t;
}
function waterTone(x, y, kind, ph = 0) {
  let t = waterBase(x, y, kind);
  const rip = pn(x, y, .085, .27, 33, 40, -ph * .9);
  if (rip > .7) t += .2; else if (rip < .25) t -= .1;
  if (pn(x, y, .11, 1.1, 39, 0, ph * .7) > .84) t += .16;
  return t;
}
const rapidsFoam = (x, y, ph = 0) => pn(x, y, .21, .055, 35, 9, -ph * 1.7) + (pn(x, y, .5, .45, 39, 0, -ph * 2) - .5) * .4;
function waterCol(x, y, kind, ph = 0) {
  const t = waterTone(x, y, kind, ph);
  if (kind === 3) {
    const f = rapidsFoam(x, y, ph);
    if (f > .68) return P.foam[f > .8 ? 2 : 1];
    if (f > .6) return P.shallow[4];
    return rp(P.deep, t + .15, x, y, .45);
  }
  return rp(kind === 1 ? P.shallow : P.deep, t, x, y, .45);
}

let RH = new Float64Array(0);
function rockH(x, y) {
  if (RH.length !== PER * PER) RH = new Float64Array(PER * PER).fill(-1);
  const i = wrap(y, PER) * PER + wrap(x, PER);
  if (RH[i] >= 0) return RH[i];
  let r = 0, a = .5, f = .013, n = 0;
  for (let o = 0; o < 4; o++) { const v = 1 - Math.abs(2 * pn(x, y, f, f, 141 + o * 9) - 1); r += a * v * v; n += a; a *= .5; f *= 2.1; }
  pvor(x, y, 34, 151);
  const hh = r / n * .62 + clamp(1 - Math.hypot(VDX, VDY) / 24, 0, 1) * .38;
  return RH[i] = hh + Math.floor(hh * 7) / 7 * .55;
}
const rockTone = (x, y) => {
  const hC = rockH(x, y), dx = rockH(x + 1, y) - rockH(x - 1, y), dy = rockH(x, y + 1) - rockH(x, y - 1);
  let t = .6 + (hC - .75) * .3 + (dx * .55 + dy * .6) * 4.4 - .09 + (hash(wrap(x, PER), wrap(y, PER), 44) - .5) * .07;
  if (Math.abs(pn(x, y, .035, .035, 161) - .5) < .012 && pn(x, y, .01, .01, 163) > .42) t -= .3;
  return t;
};
const rockTop = (x, y) => rp(P.rock, rockTone(x, y), x, y, .3);
const rockFace = (x, y, fy, fh) => {
  let t = .4 - fy / fh * .24 + (pn(x, y, .22, .045, 44) - .5) * .5 + (pn(x, y, .07, .02, 48) - .5) * .3;
  if (Math.abs(pn(x, y, .06, .06, 49) - .5) < .02) t -= .3;
  if (fy === 0) return P.rock[6];
  if (fy === 1) t += .2;
  return rp(P.rock, t * .8, x, y, .3);
};
const oreAt = (ramp, seed, x, y, c) => {
  const blob = pfbm(x, y, .028, 61 + seed, 2), id = pvor(x, y, 6, 63 + seed), e = VEDGE, nw = VDX + VDY < 0;
  if (blob < .47 || id < .42 + (.62 - blob) * 1.6) return null;
  if (e < .9) return dark(c, .5);
  const k = 1 + (nw ? 1 : 0) + (e < 2 ? (nw ? 1 : -1) : 0) + (hash(x, y, 9) > .93 ? 1 : 0);
  return ramp[clamp(k, 0, 3)];
};
const veinAt = (x, y) => {
  const id = pvor(x, y, 6, 63), e = VEDGE, nw = VDX + VDY < 0, dx = -VDX, dy = -VDY;
  const k = e < .9 ? -1 : clamp(1 + (nw ? 1 : 0) + (e < 2 ? (nw ? 1 : -1) : 0) + (hash(x, y, 9) > .93 ? 1 : 0), 0, 3);
  return { blob: pfbm(x + dx, y + dy, .028, 61, 2), id, k, dx, dy };
};

function pstone(ramp, bw, bh, o) {
  const seed = o.seed || 0, n = ramp.length - 1, b = o.b === undefined ? n - 2 : o.b, cols = PER / bw;
  return (x, y) => {
    const row = Math.floor(y / bh), xx = x + (row & 1) * (bw >> 1) + Math.floor(hash(row, seed, 2) * 3), col = wrap(Math.floor(xx / bw), cols), lx = wrap(xx, bw), ly = y - row * bh;
    if (ly === bh - 1 || lx === bw - 1) return ramp[Math.max(0, b - 3)];
    const h = hash(col, row, seed + 3);
    let k = b + (h > .68 ? 1 : h < .25 ? -1 : 0);
    if (ly === 0 || lx === 0) k += 1; else if (ly === bh - 2 || lx === bw - 2) k -= 1;
    if (hash(x, y, seed + 5) > .94) k -= 1;
    if (h > .86 && Math.abs(lx - ly * 1.4 - bw * .25) < .8) k -= 2;
    return ramp[clamp(k, 0, n)];
  };
}
function pwood(ramp, o) {
  const pw = o.pw, seed = o.seed || 0, n = ramp.length - 1, b = o.b, len = o.len;
  return (x, y) => {
    const a = y, c = x, pl = Math.floor(a / pw), pa = a - pl * pw;
    if (pw > 2 && pa === pw - 1) return ramp[Math.max(0, b - 2)];
    const e = (c + Math.floor(hash(pl, seed, 5) * len)) % len;
    if (e === 0) return ramp[Math.max(0, b - 2)];
    if (e === 2 && pa === (pw >> 1)) return ramp[0];
    const h = hash(pl, seed, 1);
    let k = b + (h > .62 ? 1 : h < .22 ? -1 : 0);
    if (pa === 0) k += 1;
    if (pn(c, a, .2, 1.4, seed + 3, pl * 7.3, 0) > .7) k -= 1;
    return ramp[clamp(k, 0, n)];
  };
}
const daubTex = (b, seed) => (x, y) => { const m = pfbm(x, y, .06, seed, 2), h = hash(x, y, seed + 2); let k = b + (m > .6 ? 1 : m < .38 ? -1 : 0); if (h > .96) k -= 1; if (pn(x, y, .2, .25, seed + 4) > .78) k -= 1; return P.daub[clamp(k, 0, 5)]; };
const thTex = M.thatch(P.thatch, { rh: 7, seed: 4 });
const TILES = {
  'rock/mountain': rockTop,
  'wall/stone': pstone(P.stone, 16, 8, { b: 4, seed: 3 }),
  'wall/daub': daubTex(4, 111),
  'floor/plank': pwood(P.plank, { pw: 8, len: 32, b: 3, seed: 2 }),
  'floor/flagstone': plates(P.stone, 12, 135, 2),
  'floor/earth': (x, y) => lit(GT.soil(x, y), 1.12),
};

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
