'use strict';
const BY = 44;
const WP = (seed, dir, b) => M.wood(P.plank, { pw: 5, seed, dir, b: b === undefined ? 3 : b }), WD = (seed, dir, b) => M.wood(P.wood, { pw: 5, seed, dir, b: b === undefined ? 3 : b });
const ST = (seed, b) => M.stone(P.stone, 9, 5, { seed, b: b === undefined ? 4 : b }), BR = (ramp, seed, b) => M.stone(ramp, 7, 4, { seed, b: b === undefined ? 3 : b });
const flatc = c => () => c;
function flame2(s, cx, by, w, h, fr, ramp) {
  ramp = ramp || P.fire;
  for (let dx = -w; dx <= w; dx++) {
    const hh = Math.max(2, h * (1 - Math.pow(Math.abs(dx) / (w + 1), 1.5)) + (hash(dx, fr, 3) - .5) * h * .3);
    for (let j = 0; j < hh; j++) {
      const f = j / hh, wob = Math.round(Math.sin(j * .45 + fr * 2.1 + dx * .3) * f * 2.2), a = Math.abs(dx) / w;
      let k = f < .3 && a < .45 ? 4 : f < .5 && a < .7 ? 3 : f < .78 ? 2 : 1;
      if (a > .8) k = Math.min(k, 1);
      s.set(cx + dx + wob, by - j, ramp[k], 255);
    }
  }
}
const bx2 = (s, x, w, d, h, top, front, o) => { s.slab(x, BY + 1 - h - d, w, d, h, top, front, o); return BY + 1 - h - d; };
function table2(s, x, w, d, legH, top, leg) {
  const y0 = BY + 1 - legH - 3 - d;
  for (const lx of [x + 1, x + w - 4]) { s.rect(lx, BY + 1 - legH, 3, legH, leg[2]); s.rect(lx, BY + 1 - legH, 1, legH, leg[4]); s.rect(lx + 2, BY + 1 - legH, 1, legH, leg[1]); }
  s.rect(x + 4, BY - legH + 3, w - 8, 1, leg[1]);
  s.slab(x, y0, w, d, 3, top, top);
  return y0;
}
const smoke2 = (s, x, y, n, r) => { for (let i = 0; i < n; i++) { const sx = x + Math.round((r() - .5) * 5) + i, sy = y - i * 4; s.set(sx, sy, P.furGrey[4]); s.set(sx + 1, sy, P.furGrey[3]); s.set(sx, sy - 1, P.furGrey[3]); } };
function logEnd2(s, x, y, r) { s.oval(x, y, r, r * .92, (px, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .78 ? P.wood[2] : q < .16 ? P.plank[2] : (Math.floor(q * 6.5) & 1) ? P.plank[4] : P.plank[5]; }); s.set(x + 1, y - 1, P.plank[2]); }
function stoneRing(s, cx, cy, rx, ry, n, back) {
  for (let a = 0; a < n; a++) {
    const t = a / n * 6.283 + .2, sn = Math.sin(t);
    if ((sn < 0) !== back) continue;
    const x = cx + Math.cos(t) * rx, y = cy + sn * ry;
    s.ball(x, y, 2.9, 2.3, 5 + sn, P.rock, { d: .1, facet: 3, seed: a, bias: .06 });
  }
}
function bed2(s, frame, blanket, o) {
  o = o || {};
  const x = 9, w = 22, y = 14;
  s.fill(x, y + 6, w, 26, WD(3, 'v', 2));
  s.fill(x + 2, y + 7, w - 4, 23, o.hay ? ((px, py) => P.hay[clamp(2 + (noise(px * .9, py * .4, 3) > .55 ? 1 : 0) - (noise(px * .7 + 5, py * .5, 5) > .65 ? 1 : 0), 0, 4)]) : M.cloth(P.cloth, 4, 3));
  if (!o.hay) { s.oval(20, y + 11.5, 7, 3.4, (px, py, nx, ny) => P.cloth[ny > .3 ? 4 : 5]); s.rect(14, y + 15, 12, 1, P.cloth[2]); }
  const bl = M.cloth(blanket, 2, 7);
  for (let j = 0; j < 14; j++) for (let i = 0; i < w - 4; i++) { let c = bl(x + 2 + i, y + 16 + j); if (j === 0) c = blanket[blanket.length - 1]; else if (j === 1) c = lit(c, 1.2); else if (j === 2) c = dark(c, .7); if (i > w - 8) c = dark(c, .8); if (o.stripe && (j === 6 || j === 7)) c = o.stripe[j === 6 ? 4 : 2]; s.set(x + 2 + i, y + 16 + j, c); }
  s.fill(x, y + 30, w, 3, WP(1, 'v', 2)); s.rect(x, y + 30, w, 1, frame[4]);
  if (!o.hay) { s.fill(x, y, w, 7, WP(4, 'v', 3)); s.rect(x, y, w, 1, frame[5]); s.rect(x, y + 6, w, 1, frame[1]); s.rect(x - 1, y - 2, 3, 10, frame[3]); s.rect(x - 1, y - 2, 1, 10, frame[5]); s.rect(x + w - 2, y - 2, 3, 10, frame[2]); s.rect(x - 1, y - 2, 3, 1, frame[5]); s.rect(x + w - 2, y - 2, 3, 1, frame[4]); }
  s.rect(x, y + 6, 1, 26, frame[4]); s.rect(x + w - 1, y + 6, 1, 26, frame[1]);
}

const BUILDS = {
  campfire: { name: 'Campfire', cat: 'production', frames: 3, emit: { dx: 0, dy: -10, rad: 170, col: [1, .6, .24], flicker: 1 }, f(s, r, fr) {
    stoneRing(s, 20, 38, 12, 5, 12, true);
    s.oval(20, 38, 9, 3.6, (x, y) => hash(x, y + fr, 3) > .7 ? P.fire[1] : P.furDark[hash(x, y, 5) > .5 ? 1 : 0], 0);
    for (let i = 0; i < 9; i++) s.set(13 + hash(i, fr, 1) * 14, 36 + hash(i, fr, 2) * 4, P.fire[1 + (i % 3)], 255);
    s.thick(9, 40, 30, 34, 3, P.wood, 3); s.thick(10, 34, 31, 40, 3, P.wood, 2); s.oval(9.5, 41, 1.8, 1.8, () => P.plank[4]); s.oval(31, 41, 1.8, 1.8, () => P.plank[3]);
    flame2(s, 20, 37, 6, 19, fr);
    for (let i = 0; i < 3; i++) s.set(14 + hash(fr, i, 1) * 12, 8 + hash(fr, i, 2) * 8, P.fire[3], 255);
    stoneRing(s, 20, 38, 12, 5, 12, false);
  } },
  hearth: { name: 'Stone Hearth', cat: 'production', frames: 3, emit: { dx: 0, dy: -4, rad: 130, col: [1, .6, .24], flicker: 1 }, f(s, r, fr) {
    const y0 = bx2(s, 4, 32, 9, 20, ST(1), ST(2, 4), { fd: .82 });
    s.fill(11, y0 + 2, 18, 5, flatc(P.stone[0])); s.rect(11, y0 + 2, 18, 1, P.ink);
    for (let j = 0; j < 14; j++) for (let i = 0; i < 18; i++) { const nx = (i - 8.5) / 9, ny = (13 - j) / 13; if (nx * nx + ny * ny * .8 < 1) s.set(11 + i, y0 + 15 + j, hash(i, j, 3) > .9 ? P.stone[0] : P.ink); }
    s.thick(13, BY - 1, 26, BY - 3, 2, P.wood, 2); s.thick(14, BY - 4, 25, BY - 1, 2, P.wood, 3);
    flame2(s, 20, BY - 2, 5, 11, fr);
    s.rect(4, y0 + 9, 32, 2, P.stone[5]); s.rect(4, y0 + 11, 32, 1, P.stone[1]);
  } },
  featherbed: { name: 'Feather Bed', cat: 'shelter', flat: 1, f(s) { bed2(s, P.plank, P.red, { stripe: P.gold }); } },
  woolbed: { name: 'Wool-Tick Bed', cat: 'shelter', flat: 1, f(s) { bed2(s, P.plank, P.blue, { stripe: P.cloth }); } },
  haybed: { name: 'Hay Bed', cat: 'shelter', flat: 1, f(s) { bed2(s, P.wood, P.cloth, { hay: 1 }); } },
  table: { name: 'Hewn Table', cat: 'furniture', emit: { dx: 9, dy: -22, rad: 34, col: [1, .7, .3], flicker: 1, night: 1 }, f(s) {
    const y0 = table2(s, 5, 30, 14, 8, WP(2, 'h', 4), P.plank);
    s.oval(13, y0 + 6, 5, 3, (x, y, nx, ny) => P.cloth[nx * nx + ny * ny < .45 ? 3 : 5]); s.oval(13, y0 + 5.6, 2.6, 1.4, () => P.furTan[2]); s.set(12, y0 + 5, P.furTan[4]);
    s.tube(22, y0 + 6, 4, 5, () => P.copper[3]); s.rect(22, y0 + 6, 4, 1, P.copper[1]); s.rect(26, y0 + 7, 1, 3, P.copper[2]);
    s.oval(18.5, y0 + 11, 3.6, 1.8, (x, y, nx, ny) => P.savanna[ny < 0 ? 4 : 2]);
    s.rect(29, y0 + 2, 2, 5, P.cloth[5]); s.rect(30, y0 + 2, 1, 5, P.cloth[3]); s.set(29, y0, P.fire[3], 255); s.set(29, y0 + 1, P.fire[4], 255); s.set(29, y0 - 1, P.fire[2], 255);
  } },
  stool: { name: 'Log Stool', cat: 'furniture', f(s) {
    s.tube(13, BY - 9, 14, 10, (x, y) => P.wood[3 - (noise(x * 1.3, y * .2, 4) > .66 ? 1 : 0)]);
    s.oval(20, BY - 9, 7.5, 3.4, (x, y, nx, ny) => { const q = Math.hypot(nx, ny); return P.plank[q < .2 ? 2 : (Math.floor(q * 5) & 1) ? 5 : 4]; });
  } },
  cupboard: { name: 'Larder Cupboard', cat: 'furniture', f(s) {
    const y0 = bx2(s, 6, 28, 6, 30, WP(5, 'h', 4), WP(6, 'v', 3), { fd: .86 });
    for (const dx of [8, 21]) { s.rect(dx, y0 + 9, 11, 24, P.plank[1]); s.fill(dx + 1, y0 + 10, 9, 22, WP(7 + dx, 'v', 3)); s.rect(dx + 1, y0 + 10, 9, 1, P.plank[4]); s.rect(dx + 2, y0 + 12, 7, 18, P.plank[2]); s.fill(dx + 3, y0 + 13, 5, 16, WP(9, 'v', 3)); }
    s.rect(18, y0 + 20, 1, 3, P.iron[6]); s.rect(21, y0 + 20, 1, 3, P.iron[5]); s.rect(8, y0 + 12, 1, 3, P.iron[3]); s.rect(31, y0 + 12, 1, 3, P.iron[3]); s.rect(8, y0 + 27, 1, 3, P.iron[3]); s.rect(31, y0 + 27, 1, 3, P.iron[3]);
    s.tube(9, y0 - 6, 6, 8, () => P.clay[3]); s.rect(10, y0 - 7, 4, 1, P.clay[1]); s.tube(17, y0 - 4, 5, 6, () => P.clayBlue[3]); s.oval(28, y0 - 1, 4, 3, () => P.cloth[4]);
  } },
  rug: { name: 'Bear Rug', cat: 'furniture', flat: 1, f(s) {
    const fur = M.fur(P.furBrown, 3, 5);
    for (const [x, y] of [[8, 20], [28, 20], [7, 40], [29, 40]]) { s.oval(x + 1.5, y, 3.4, 4, fur); s.set(x, y + 3, P.bone[5]); s.set(x + 2, y + 4, P.bone[4]); }
    s.oval(20, 31, 11, 13, fur); s.ball(20, 14, 6, 5.4, 1, P.furBrown, { n: .3, ns: .9, d: .2 });
    s.oval(15, 9.5, 2, 2, () => P.furBrown[4]); s.oval(25, 9.5, 2, 2, () => P.furBrown[2]); s.ball(20, 17, 3, 2.4, 2, P.furTan, { d: .2 });
    s.set(17, 13, P.ink); s.set(23, 13, P.ink); s.rect(19, 16, 2, 2, P.ink); s.set(18, 19, P.bone[5]); s.set(22, 19, P.bone[5]);
  } },
  carpenter: { name: "Plank Carpenter's Bench", cat: 'production', f(s) {
    const y0 = table2(s, 3, 34, 13, 9, WP(3, 'h', 4), P.wood);
    s.fill(6, y0 + 2, 22, 4, WP(8, 'h', 5)); s.rect(6, y0 + 6, 22, 1, P.plank[1]); s.rect(6, y0 + 2, 1, 4, P.plank[5]);
    s.rect(9, y0 + 9, 14, 2, P.iron[6]); for (let i = 0; i < 14; i += 2) s.set(9 + i, y0 + 11, P.iron[3]); s.rect(23, y0 + 8, 5, 4, P.wood[3]); s.rect(24, y0 + 9, 3, 2, P.wood[1]);
    s.rect(30, y0 + 1, 5, 5, P.iron[4]); s.rect(30, y0 + 1, 5, 1, P.iron[6]); s.rect(31, y0 + 6, 3, 2, P.iron[2]); s.rect(35, y0 + 3, 3, 1, P.iron[5]);
    s.thick(30, y0 + 11, 34, y0 + 8, 2, P.wood, 4); s.rect(33, y0 + 6, 4, 3, P.plank[4]);
    for (let i = 0; i < 7; i++) { const x = 6 + hash(i, 1, 3) * 28, y = BY - hash(i, 2, 3) * 3; s.set(x, y, P.plank[5]); s.set(x + 1, y, P.plank[4]); }
    s.rect(8, BY - 5, 24, 1, P.wood[3]); s.rect(11, BY - 8, 3, 3, P.iron[4]); s.rect(17, BY - 7, 6, 2, P.plank[4]);
  } },
  anvil: { name: 'Iron Anvil', cat: 'production', f(s) {
    s.tube(11, BY - 10, 18, 11, (x, y) => P.wood[3 - (noise(x * 1.3, y * .2, 4) > .66 ? 1 : 0)]); s.oval(20, BY - 10, 9.5, 3.6, (x, y, nx, ny) => P.plank[Math.hypot(nx, ny) < .3 ? 3 : 4]);
    s.rect(13, BY - 13, 14, 3, P.iron[2]); s.rect(13, BY - 13, 14, 1, P.iron[4]); s.rect(15, BY - 17, 10, 4, P.iron[3]); s.rect(15, BY - 17, 2, 4, P.iron[4]); s.rect(23, BY - 17, 2, 4, P.iron[1]);
    s.rect(8, BY - 22, 22, 2, P.iron[6]); s.rect(8, BY - 20, 22, 3, P.iron[4]); s.rect(8, BY - 17, 22, 1, P.iron[2]); s.rect(8, BY - 22, 1, 5, P.iron[5]);
    for (let i = 0; i < 7; i++) { s.rect(30 + i, BY - 22 + (i > 3 ? 1 : 0), 1, Math.max(1, 4 - (i >> 1)), P.iron[i < 3 ? 5 : 4]); s.set(30 + i, BY - 22 + (i > 3 ? 1 : 0), P.iron[6]); }
    s.rect(11, BY - 21, 2, 1, P.ink);
    s.thick(4, BY, 7, BY - 16, 2, P.wood, 4); s.rect(3, BY - 21, 7, 5, P.iron[4]); s.rect(3, BY - 21, 7, 1, P.iron[6]); s.rect(9, BY - 21, 1, 5, P.iron[2]);
    s.set(22, BY - 23, P.fire[3], 255); s.set(25, BY - 24, P.fire[2], 255);
  } },
  bloomery: { name: 'Clay-Brick Bloomery', cat: 'production', emit: { dx: 0, dy: -16, rad: 90, col: [1, .5, .2], flicker: 1 }, f(s, r) {
    const br = BR(P.brick, 3, 3);
    for (let j = 0; j < 32; j++) { const w = 14 + Math.round(j / 31 * 8); s.tube(20 - (w >> 1), BY - 31 + j, w, 1, br); }
    s.oval(20, BY - 31, 7, 2.6, (x, y, nx, ny) => Math.hypot(nx, ny) < .66 ? null : P.brick[4]); s.oval(20, BY - 31, 4.6, 1.6, () => P.fire[2], 255); s.rect(18, BY - 32, 4, 1, P.fire[4], 255);
    for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) { const nx = (i - 4.5) / 5, ny = (9 - j) / 9; if (nx * nx + ny * ny < 1) s.set(15 + i, BY - 9 + j, ny < .5 && Math.abs(nx) < .6 ? P.fire[ny < .25 ? 4 : 3] : ny < .75 ? P.fire[1] : P.ink, ny < .75 ? 255 : 0); }
    s.rect(14, BY - 10, 12, 1, P.brick[5]);
    smoke2(s, 20, BY - 35, 3, r);
    for (let j = 0; j < 8; j++) { const w = 4 + j; s.rect(31, BY - 8 + j, Math.min(w, 9), 1, P.leather[j < 2 ? 5 : j < 6 ? 3 : 1]); } s.rect(31, BY - 9, 6, 1, P.plank[5]); s.rect(31, BY, 9, 1, P.plank[2]); s.rect(27, BY - 3, 4, 2, P.iron[4]);
    for (let i = 0; i < 6; i++) { s.set(6 + hash(i, 3, 7) * 7, BY - hash(i, 4, 7) * 3, P.iron[2 + (i % 3)]); }
  } },
  kiln: { name: "Potter's Kiln", cat: 'production', emit: { dx: 0, dy: -4, rad: 70, col: [1, .5, .2], flicker: 1 }, f(s, r) {
    s.ball(20, BY - 13, 15, 15, 0, P.clay, { n: .2, d: .15 }); for (let x = 0; x < 40; x++) for (let y = BY + 1; y < 52; y++) s.set(x, y, null);
    for (let y = BY - 26; y < BY; y += 5) for (let x = 5; x < 36; x++) { const c = s.get(x, y); if (c) s.set(x, y, dark(c, .78)); }
    for (let j = 0; j < 11; j++) for (let i = 0; i < 12; i++) { const nx = (i - 5.5) / 6, ny = (10 - j) / 10; if (nx * nx + ny * ny < 1) s.set(14 + i, BY - 10 + j, ny < .55 && Math.abs(nx) < .6 ? P.fire[ny < .25 ? 4 : 2] : P.ink, ny < .55 ? 255 : 0); }
    s.rect(13, BY - 11, 14, 1, P.clay[4]); s.oval(20, BY - 27, 3.4, 1.4, () => P.ink); smoke2(s, 20, BY - 30, 4, r);
  } },
  well: { name: 'Draw Well', cat: 'production', f(s) {
    s.tube(5, BY - 12, 30, 13, ST(4, 3));
    s.oval(20, BY - 12, 15, 6.4, ST(5, 5)); s.oval(20, BY - 12, 11, 4.2, (x, y, nx, ny) => ny < -.5 ? P.ink : P.deep[ny > .3 && Math.abs(nx) < .5 ? 3 : 1]); s.rect(16, BY - 11, 4, 1, P.deep[5]);
    for (const x of [6, 31]) { s.rect(x, BY - 40, 3, 30, P.wood[x < 20 ? 3 : 2]); s.rect(x, BY - 40, 1, 30, P.wood[x < 20 ? 5 : 3]); }
    s.tube(8, BY - 34, 24, 4, (x, y) => P.plank[3]); s.rect(8, BY - 30, 24, 1, P.ink); s.rect(32, BY - 33, 4, 1, P.iron[4]); s.rect(35, BY - 33, 1, 5, P.iron[5]);
    for (let j = 0; j < 9; j++) { const hw = 19 - j * 1.6; for (let x = Math.round(20 - hw); x <= 20 + hw; x++) s.set(x, BY - 37 - j, thTex(x, BY - 37 - j + (x >> 3))); } s.rect(1, BY - 37, 39, 1, P.thatch[0]);
    s.rect(19, BY - 30, 1, 14, P.cloth[3]); s.rect(20, BY - 30, 1, 14, P.cloth[1]);
    s.tube(16, BY - 20, 8, 7, (x, y) => P.plank[3]); s.rect(16, BY - 18, 8, 1, P.iron[4]); s.rect(16, BY - 20, 8, 1, P.plank[1]);
  } },
  drying: { name: 'Drying Rack', cat: 'furniture', f(s) {
    for (const x of [5, 32]) { s.rect(x, BY - 28, 3, 29, P.wood[x < 20 ? 3 : 2]); s.rect(x, BY - 28, 1, 29, P.wood[5]); }
    s.tube(4, BY - 28, 32, 3, (x, y) => P.wood[3]); s.tube(6, BY - 15, 28, 2, (x, y) => P.wood[3]);
    const hide = (x, y, w, h, ramp) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const inset = (j < 2 || j > h - 3) && (i < 1 || i > w - 2); if (inset) continue; s.set(x + i, y + j, ramp[clamp(3 + (i === 0 ? 1 : i > w - 3 ? -1 : 0) - (noise(i * .6, j * .5, x) > .65 ? 1 : 0), 0, 5)]); } s.rect(x + 1, y, 1, 2, P.cloth[4]); s.rect(x + w - 2, y, 1, 2, P.cloth[4]); };
    hide(8, BY - 25, 10, 16, P.leather); hide(21, BY - 25, 10, 14, P.furTan);
    for (let x = 9; x < 31; x += 4) { s.rect(x, BY - 13, 2, 6, P.grassLoam[3]); s.rect(x, BY - 13, 1, 6, P.grassLoam[4]); s.set(x, BY - 14, P.cloth[4]); }
  } },
  loom: { name: 'Beam Weaving Frame', cat: 'production', f(s) {
    for (const x of [5, 32]) { s.rect(x, BY - 36, 3, 37, P.plank[x < 20 ? 3 : 2]); s.rect(x, BY - 36, 1, 37, P.plank[5]); }
    s.tube(4, BY - 36, 32, 4, (x, y) => P.plank[3]); s.tube(5, BY - 8, 30, 3, (x, y) => P.plank[3]);
    for (let x = 9; x < 31; x++) { for (let y = BY - 32; y < BY - 19; y++) s.set(x, y, P.cloth[x & 1 ? 5 : 2]); for (let y = BY - 19; y < BY - 8; y++) { const band = Math.floor((y - (BY - 19)) / 3) % 2; s.set(x, y, (band ? P.red : P.blue)[clamp(3 - (x > 26 ? 1 : 0) + (x === 9 ? 1 : 0) - ((x + y) % 4 === 0 ? 1 : 0), 0, 4)]); } }
    s.tube(7, BY - 20, 26, 2, (x, y) => P.wood[4]); s.rect(12, BY - 23, 8, 2, P.wood[3]); s.rect(12, BY - 23, 2, 2, P.cloth[5]);
  } },
  logpile: { name: 'Stacked logs', cat: 'stock', f(s) {
    const log = (x, y, w, sd) => {
      for (let j = 0; j < 7; j++) for (let i = 0; i < w; i++) s.set(x + i, y + j, P.wood[clamp([4, 5, 4, 3, 2, 1, 0][j] - (noise(i * .22 + sd * 7, j * 1.3, sd) > .68 ? 1 : 0), 0, 5)]);
      s.oval(x + 1.5, y + 3.5, 2.6, 3.5, (px, py, nx, ny) => { const q = Math.hypot(nx, ny); return q > .8 ? P.wood[2] : q < .25 ? P.plank[2] : P.plank[q < .55 ? 5 : 4]; });
      for (let j = 1; j < 6; j++) s.set(x + w, y + j, P.wood[0]);
      s.rect(x + 7 + (sd * 5) % (w - 14), y + 2, 2, 1, P.wood[1]);
    };
    for (const x of [6, 33]) { s.rect(x, BY - 20, 2, 21, P.wood[2]); s.rect(x, BY - 20, 1, 21, P.wood[4]); }
    log(5, BY - 18, 29, 1); log(3, BY - 12, 31, 2); log(6, BY - 6, 29, 3); log(6, BY - 23, 28, 4); log(4, BY - 17, 30, 5); log(7, BY - 28, 26, 6);
    s.set(2, BY, P.plank[5]); s.set(37, BY - 1, P.plank[4]); s.set(20, BY + 1, P.plank[5]);
  } },
  stonepile: { name: 'Cut stone', cat: 'stock', f(s) { const a = M.flat(P.stone, 4, 3), b = M.flat(P.stone, 3, 5); s.slab(3, BY - 12, 16, 6, 7, a, b); s.slab(21, BY - 11, 15, 5, 7, a, b); s.slab(10, BY - 24, 18, 6, 7, a, b); s.line(6, BY - 4, 10, BY - 2, P.stone[1]); s.line(24, BY - 16, 21, BY - 13, P.stone[1]); } },
  sacks: { name: 'Grain sacks', cat: 'stock', f(s) {
    for (const [x, y, rr, z] of [[11, BY - 8, 8.6, 0], [28, BY - 7, 8, 0], [19, BY - 21, 8, 2]]) {
      s.ball(x, y, rr, rr * .98, z, P.cloth, { n: .22, ns: .5, d: .15, bias: -.04 });
      s.rect(x - 2, y - rr - 2, 4, 3, P.cloth[4]); s.rect(x - 2, y - rr + 1, 4, 1, P.leather[3]); s.set(x - 3, y - rr - 3, P.cloth[5]); s.set(x + 2, y - rr - 3, P.cloth[3]);
      for (let j = -4; j < 5; j += 2) s.set(x + 3, y + j, P.cloth[1]);
    }
    for (let x = 0; x < 40; x++) for (let y = BY + 1; y < 52; y++) s.set(x, y, null);
    s.set(17, BY, P.hay[4]); s.set(19, BY, P.hay[3]); s.set(22, BY - 1, P.hay[4]);
  } },
  crate: { name: 'Crate', cat: 'stock', f(s) {
    const y0 = bx2(s, 6, 28, 12, 16, WP(4, 'v', 4), WP(6, 'h', 3), { fd: .84 });
    s.rect(6, y0 + 12, 28, 2, P.plank[4]); s.rect(6, BY - 1, 28, 2, P.plank[1]); s.rect(6, y0 + 12, 3, 17, P.plank[4]); s.rect(31, y0 + 12, 3, 17, P.plank[1]);
    for (let i = 0; i < 22; i++) s.set(9 + i, y0 + 14 + Math.round(i * .64), P.plank[1]); for (const [x, y] of [[7, y0 + 13], [32, y0 + 13], [7, BY - 1], [32, BY - 1]]) s.set(x, y, P.iron[5]);
  } },
  barrel: { name: 'Barrel', cat: 'stock', f(s) {
    const st = M.wood(P.plank, { dir: 'v', pw: 4, b: 3, seed: 3 });
    for (let j = 0; j < 22; j++) { const bulge = Math.round(Math.sin(j / 21 * 3.1416) * 2); s.tube(10 - bulge, BY - 21 + j, 20 + bulge * 2, 1, j === 4 || j === 5 || j === 16 || j === 17 ? flatc(P.iron[j === 4 || j === 16 ? 5 : 3]) : st); }
    s.oval(20, BY - 22, 10, 4, (x, y, nx, ny) => Math.hypot(nx, ny) > .8 ? P.plank[5] : st(x, y)); s.rect(19, BY - 23, 2, 2, P.wood[1]);
  } },
  armchair: { name: 'Armchair', cat: 'furniture', f(s) {
    s.fill(8, BY - 32, 24, 18, M.cloth(P.red, 2, 3)); s.rect(8, BY - 32, 24, 1, P.red[4]); s.rect(8, BY - 32, 1, 18, P.red[3]); s.rect(31, BY - 32, 1, 18, P.red[0]);
    for (const [x, y] of [[14, BY - 26], [20, BY - 23], [26, BY - 26]]) { s.set(x, y, P.gold[3]); s.set(x, y + 1, P.red[0]); }
    s.slab(10, BY - 14, 20, 8, 6, M.cloth(P.red, 3, 5), M.cloth(P.red, 2, 7));
    for (const x of [5, 30]) s.slab(x, BY - 20, 5, 5, 16, WP(2, 'v', 4), WP(3, 'v', 3));
  } },
  tailor: { name: "Steel-Tooled Tailor's Bench", cat: 'production', f(s) {
    const y0 = table2(s, 4, 32, 13, 9, WP(3, 'h', 4), P.plank);
    s.fill(6, y0 + 2, 14, 5, (x, y, i, j) => P.red[[4, 3, 3, 2, 1][j]]); s.oval(6.5, y0 + 4.5, 1.6, 2.6, (x, y, nx, ny) => P.red[Math.hypot(nx, ny) < .5 ? 1 : 4]); s.fill(18, y0 + 3, 7, 7, M.cloth(P.red, 2, 3));
    s.slab(24, y0 + 1, 10, 4, 2, M.cloth(P.blue, 3, 2), M.cloth(P.blue, 2, 4));
    s.line(8, y0 + 9, 14, y0 + 11, P.iron[6]); s.line(8, y0 + 11, 14, y0 + 9, P.iron[5]); s.oval(7, y0 + 9, 1.5, 1.2, () => P.wood[4]); s.oval(7, y0 + 12, 1.5, 1.2, () => P.wood[3]);
    for (const [x, c] of [[27, P.gold], [30, P.green], [33, P.cloth]]) { s.rect(x, y0 + 8, 2, 4, c[c.length - 2]); s.rect(x, y0 + 8, 2, 1, P.wood[4]); s.rect(x, y0 + 11, 2, 1, P.wood[2]); }
  } },
  spinning: { name: 'Bronze-Spindle Spinning Wheel', cat: 'production', f(s) {
    const wx = 14, wy = BY - 20, R = 12;
    s.thick(6, BY, wx - 2, wy, 2, P.plank, 3); s.thick(22, BY, wx + 1, wy, 2, P.plank, 2);
    for (let a = 0; a < 8; a++) { const t = a / 8 * 6.283 + .2; s.line(wx, wy, wx + Math.cos(t) * (R - 1), wy + Math.sin(t) * (R - 1), P.plank[a < 4 ? 2 : 4]); }
    for (let a = 0; a < 100; a++) { const t = a / 100 * 6.283, li = Math.cos(t - 3.9) > 0; s.set(wx + Math.cos(t) * R, wy + Math.sin(t) * R, P.wood[li ? 5 : 2]); s.set(wx + Math.cos(t) * (R - 1), wy + Math.sin(t) * (R - 1), P.wood[li ? 4 : 1]); }
    s.oval(wx, wy, 2, 2, () => P.copper[4]); s.set(wx, wy, P.copper[1]);
    s.slab(22, BY - 12, 14, 3, 2, WP(2, 'h', 4), WP(3, 'h', 3)); s.rect(24, BY - 7, 2, 8, P.plank[3]); s.rect(33, BY - 7, 2, 8, P.plank[1]);
    s.rect(32, BY - 22, 2, 10, P.copper[4]); s.rect(32, BY - 22, 1, 10, P.copper[5]); s.ball(33, BY - 19, 3.6, 4.4, 2, P.cloth, { d: .15, n: .3 });
    s.line(wx + 8, wy - 9, 31, BY - 20, P.cloth[4]); s.rect(8, BY - 1, 14, 2, P.plank[2]);
  } },
  smelter: { name: 'Clay-Brick Smelting Hearth', cat: 'production', frames: 3, emit: { dx: -2, dy: -8, rad: 100, col: [1, .55, .2], flicker: 1 }, f(s, r, fr) {
    const y0 = bx2(s, 5, 26, 12, 13, BR(P.brick, 2, 4), BR(P.brick, 4, 3), { fd: .84 });
    s.fill(8, y0 + 2, 20, 8, (x, y) => hash(x, y + fr, 3) > .72 ? P.fire[1 + (hash(x, y, 5) > .5 ? 1 : 0)] : P.furDark[hash(x, y, 7) > .5 ? 1 : 0]); s.rect(8, y0 + 2, 20, 1, P.ink);
    for (let i = 0; i < 8; i++) s.set(9 + hash(i, fr, 2) * 18, y0 + 3 + hash(i, fr, 4) * 6, P.fire[3], 255);
    flame2(s, 18, y0 + 8, 5, 12, fr);
    for (let j = 0; j < 9; j++) s.rect(32, BY - 9 + j, Math.min(4 + j, 7), 1, P.leather[j < 2 ? 5 : j < 7 ? 3 : 1]); s.rect(32, BY - 10, 5, 1, P.plank[5]); s.rect(29, BY - 4, 3, 2, P.iron[4]);
  } },
  stonecutter: { name: "Granite Stonecutter's Bench", cat: 'production', f(s) {
    const y0 = table2(s, 4, 32, 13, 9, WP(5, 'h', 4), P.wood);
    s.slab(8, y0 - 6, 16, 8, 7, M.flat(P.stone, 4, 3), M.flat(P.stone, 3, 5)); s.line(11, y0 - 4, 16, y0 - 1, P.stone[1]); s.line(16, y0 - 1, 20, y0 - 2, P.stone[1]);
    s.thick(27, y0 + 9, 32, y0 + 3, 2, P.iron, 5); s.rect(31, y0 + 1, 2, 2, P.iron[6]);
    s.rect(27, y0 + 2, 3, 6, P.wood[3]); s.slab(25, y0 - 1, 7, 3, 2, WD(1, 'h', 4), WD(2, 'h', 3));
    for (let i = 0; i < 9; i++) { const x = 5 + hash(i, 1, 9) * 30, y = BY - hash(i, 2, 9) * 3; s.set(x, y, P.stone[5]); s.set(x + 1, y, P.stone[3]); }
  } },
  ingots: { name: 'Ingots', cat: 'stock', f(s) {
    const bar = (x, y, c) => { const n = c.length - 1; s.rect(x + 1, y, 10, 2, c[n]); s.rect(x, y + 2, 12, 3, c[n - 2]); s.rect(x, y + 2, 12, 1, c[n - 1]); s.rect(x + 11, y + 2, 1, 3, c[1]); s.rect(x, y + 4, 12, 1, c[1]); s.set(x + 2, y, P.cloth[5]); };
    bar(4, BY - 4, P.copper); bar(17, BY - 4, P.iron); bar(24, BY - 9, P.iron); bar(11, BY - 9, P.copper); bar(17, BY - 14, P.gold); bar(4, BY - 14, P.iron);
  } },
  butcher: { name: "Iron Butcher's Table", cat: 'production', f(s) {
    const y0 = table2(s, 4, 32, 13, 9, WP(7, 'h', 4), P.plank);
    for (let i = 0; i < 26; i++) s.set(6 + hash(i, 1, 5) * 26, y0 + 2 + hash(i, 2, 5) * 9, P.red[hash(i, 3, 5) > .5 ? 1 : 2]);
    s.oval(13, y0 + 6, 6, 3.6, (x, y, nx, ny) => Math.hypot(nx, ny) > .7 ? P.cloth[5] : P.red[nx < 0 ? 3 : 2]); s.oval(13, y0 + 6, 1.6, 1.2, () => P.bone[5]); s.rect(18, y0 + 5, 4, 2, P.bone[5]); s.set(22, y0 + 4, P.bone[4]); s.set(22, y0 + 7, P.bone[4]);
    s.rect(25, y0 + 2, 8, 6, P.iron[4]); s.rect(25, y0 + 2, 8, 1, P.iron[6]); s.rect(25, y0 + 7, 8, 1, P.iron[6]); s.rect(27, y0 + 8, 2, 4, P.wood[2]); s.set(31, y0 + 3, P.ink);
    s.rect(14, BY - 1, 5, 2, P.red[1]);
  } },
  smoking: { name: 'Smoking Rack', cat: 'production', emit: { dx: 0, dy: -2, rad: 36, col: [1, .5, .2] }, f(s, r) {
    s.thick(6, BY, 19, BY - 38, 2, P.wood, 4); s.thick(33, BY, 20, BY - 38, 2, P.wood, 2); s.thick(19, BY - 2, 19, BY - 38, 2, P.wood, 3);
    s.fill(10, BY - 26, 20, 2, (x, y, i, j) => P.wood[j ? 2 : 4]); s.rect(17, BY - 39, 5, 2, P.cloth[3]);
    for (const [x, h] of [[12, 9], [16, 11], [23, 10], [27, 8]]) { s.rect(x, BY - 24, 1, 2, P.cloth[4]); for (let j = 0; j < h; j++) { const w = j < 2 || j > h - 3 ? 1 : 2; s.rect(x - (w > 1 ? 1 : 0), BY - 22 + j, w + 1, 1, P.furGrey[j % 3 === 0 ? 3 : 4]); s.set(x + 1, BY - 22 + j, P.furGrey[2]); } s.set(x - 1, BY - 22 + h, P.furGrey[3]); s.set(x + 1, BY - 22 + h, P.furGrey[3]); }
    s.oval(20, BY - 1, 7, 2.4, (x, y) => hash(x, y, 3) > .6 ? P.fire[1] : P.furDark[1]); s.set(18, BY - 2, P.fire[3], 255); s.set(22, BY - 1, P.fire[2], 255); smoke2(s, 20, BY - 6, 3, r);
  } },
  hides: { name: 'Hides', cat: 'stock', f(s) {
    const L = [[P.furTan, 0], [P.furGrey, 1], [P.furBrown, 0], [P.leather, 1]];
    for (let j = 0; j < 4; j++) { const [c, o] = L[j], y = BY - 5 - j * 5, fur = M.fur(c, 3, j); s.slab(5 + o * 2, y - 6, 28 - o * 3, 7, 4, fur, fur); for (let x = 6; x < 32; x += 2) s.set(x + o * 2, y + 4, c[1]); }
  } },
  potter: { name: "Potter's Wheel", cat: 'production', f(s) {
    s.tube(14, BY - 9, 12, 10, () => P.wood[3]); s.rect(10, BY - 1, 20, 2, P.wood[2]);
    s.oval(20, BY - 10, 13, 5, () => P.stone[2]); s.oval(20, BY - 12, 13, 5, M.flat(P.stone, 4, 3));
    s.ball(20, BY - 20, 6.5, 7, 3, P.clay, { d: .14 }); s.oval(20, BY - 26, 4, 1.6, (x, y, nx, ny) => Math.hypot(nx, ny) < .6 ? P.clay[0] : P.clay[4]);
    for (let y = BY - 24; y < BY - 14; y += 3) for (let x = 13; x < 28; x++) { const c = s.get(x, y); if (c && P.clay.indexOf(c) >= 0) s.set(x, y, dark(c, .85)); }
    s.oval(33, BY - 2, 4, 2.2, (x, y, nx, ny) => Math.hypot(nx, ny) < .6 ? P.shallow[2] : P.wood[4]); s.ball(6, BY - 2, 3.4, 2.8, 1, P.clay, { d: .14 });
  } },
  charcoal: { name: 'Granite Charcoal Pit', cat: 'production', emit: { dx: 0, dy: -8, rad: 60, col: [1, .4, .15] }, f(s, r) {
    s.ball(20, BY - 9, 16, 11, 0, P.furDark, { n: .5, ns: .7, d: .14 }); for (let x = 0; x < 40; x++) for (let y = BY + 1; y < 52; y++) s.set(x, y, null);
    for (let i = 0; i < 26; i++) { const x = 7 + Math.floor(r() * 26), y = BY - 18 + Math.floor(r() * 14); if (s.get(x, y)) { s.set(x, y, P.soil[2 + (i % 3)]); if (s.get(x + 1, y)) s.set(x + 1, y, P.soil[1]); } }
    for (const [x, y] of [[13, BY - 12], [24, BY - 15], [19, BY - 7], [28, BY - 8]]) { s.rect(x, y, 3, 2, P.ink); s.set(x + 1, y, P.fire[2], 255); s.set(x, y + 1, P.fire[1], 255); s.set(x + 2, y + 1, P.fire[3], 255); }
    stoneRing(s, 20, BY - 1, 16, 3, 14, false); smoke2(s, 20, BY - 22, 5, r); smoke2(s, 26, BY - 18, 3, r);
  } },
  windmill: { name: 'Windmill', cat: 'production', tall: 1, frames: 4, f(s, r, fr) {
    const B = 102, cx = 36, tw = daubTex(4, 31);
    for (let j = 0; j < 52; j++) { const w = 20 + Math.round(j / 51 * 10); s.tube(cx - (w >> 1), B - 51 + j, w, 1, (x, y) => (j % 17 < 2) ? P.wood[3] : tw(x, y)); }
    for (let j = 0; j < 16; j++) { const hw = 3 + j * .85; for (let x = Math.round(cx - hw); x <= cx + hw; x++) s.set(x, B - 67 + j, thTex(x + j, B - 67 + j)); } s.rect(cx - 17, B - 51, 34, 1, P.thatch[0]);
    s.fill(cx - 5, B - 13, 10, 14, WD(4, 'v', 3)); s.rect(cx - 6, B - 14, 12, 1, P.wood[5]); s.rect(cx - 6, B - 14, 1, 15, P.wood[1]); s.rect(cx + 5, B - 14, 1, 15, P.wood[1]); s.set(cx + 3, B - 6, P.iron[6]);
    s.rect(cx - 3, B - 36, 6, 7, P.wood[1]); s.rect(cx - 2, B - 35, 4, 5, P.deep[2]); s.rect(cx - 2, B - 35, 1, 5, P.deep[4]);
    const hx = cx, hy = B - 56;
    for (let b = 0; b < 4; b++) {
      const a = b * 1.5708 + .35 + fr * .3927, c = Math.cos(a), sn = Math.sin(a);
      for (let k = 16; k < 62; k++) for (let q = 4; q < 18; q++) { const kk = k / 2, qq = q / 2; s.set(hx + c * kk - sn * qq, hy + sn * kk + c * qq, (k % 10 === 0 || q === 17) ? P.wood[3] : P.cloth[clamp(4 - (q > 11 ? 1 : 0) - ((k + q) % 13 === 0 ? 1 : 0), 0, 5)]); }
      for (let k = 6; k < 64; k++) { s.set(hx + c * k / 2, hy + sn * k / 2, P.wood[4]); s.set(hx + c * k / 2 + sn, hy + sn * k / 2 - c, P.wood[2]); }
    }
    s.oval(hx, hy, 3, 3, () => P.iron[4]); s.set(hx - 1, hy - 1, P.iron[6]);
  } },
  quern: { name: 'Granite Quern', cat: 'production', f(s) {
    const st = M.flat(P.stone, 3, 3);
    s.tube(7, BY - 9, 26, 10, st); s.oval(20, BY - 9, 13, 5, M.flat(P.stone, 5, 5)); s.tube(11, BY - 17, 18, 8, st); s.oval(20, BY - 17, 9, 3.6, M.flat(P.stone, 5, 7)); s.oval(20, BY - 17, 2, 1.2, () => P.ink);
    s.thick(27, BY - 17, 31, BY - 26, 2, P.wood, 4); for (let i = 0; i < 9; i++) s.set(13 + hash(i, 1, 3) * 14, BY - 10 + hash(i, 2, 3) * 2, P.hay[3 + (i & 1)]);
    for (let i = 0; i < 10; i++) s.set(5 + hash(i, 3, 3) * 30, BY - hash(i, 4, 3) * 2, P.cloth[5]);
  } },
  tanning: { name: 'Oak Tanning Pit', cat: 'production', flat: 1, f(s) {
    s.oval(20, BY - 10, 17, 10, WP(3, 'v', 4)); s.oval(20, BY - 9, 14, 7.6, (x, y, nx, ny) => ny < -.55 ? P.ink : P.leather[noise(x * .3, y * .5, 3) > .7 ? 2 : 1]);
    s.fill(12, BY - 12, 9, 5, M.fur(P.leather, 4, 2)); s.fill(22, BY - 8, 7, 3, M.fur(P.leather, 3, 4)); s.rect(15, BY - 14, 3, 1, P.leather[5]);
  } },
  trough: { name: 'Soaking Trough', cat: 'production', f(s) {
    const y0 = bx2(s, 4, 32, 11, 9, WD(2, 'h', 4), WD(4, 'h', 3)); s.fill(6, y0 + 2, 28, 7, (x, y) => P.shallow[noise(x * .3, y * .8, 3) > .7 ? 3 : 1]); s.rect(6, y0 + 2, 28, 1, P.ink);
    s.fill(17, y0 + 4, 12, 4, M.fur(P.leather, 3, 2)); for (const x of [4, 33]) s.rect(x, BY - 1, 3, 2, P.wood[1]);
  } },
  compost: { name: 'Wicker Compost Bin', cat: 'production', f(s) {
    const y0 = bx2(s, 6, 28, 11, 13, M.weave(P.wicker, 3), M.weave(P.wicker, 3), { fd: .86 });
    s.fill(8, y0 + 2, 24, 7, (x, y) => hash(x, y, 3) > .8 ? P.grassLoam[3] : hash(x, y, 5) > .85 ? P.savanna[3] : P.preta[1 + (hash(x >> 1, y, 7) > .5 ? 1 : 0)]); s.rect(8, y0 + 2, 24, 1, P.ink);
    for (const x of [6, 19, 32]) s.rect(x, y0 + 11, 2, 14, P.wood[x === 6 ? 4 : 2]);
  } },
};
function mkBuild(kind, frame) {
  const k = BUILDS[kind], s = k.tall ? new Spr(72, 112, 36, 102) : new Spr(40, 52, 20, BY), r = rng(kind.length * 7 + kind.charCodeAt(0));
  k.f(s, r, frame || 0);
  s.outline();
  if (k.emit) s.emit = { ...k.emit };
  if (!k.flat) s.sh = k.tall ? { rx: 20, ry: 7, dx: 8, dy: 0 } : { rx: 17, ry: 6, dx: 6, dy: 0 };
  return s;
}
function build(kind) {
  return cached('b' + kind, () => {
    const k = BUILDS[kind];
    if (!k.frames) return mkBuild(kind, 0);
    const fs = []; for (let i = 0; i < k.frames; i++) fs.push(mkBuild(kind, i));
    fs[0].frames = fs; return fs[0];
  });
}
