'use strict';
function flame(s, cx, by, w, h, fr, ramp) {
  ramp = ramp || P.fire;
  for (let dx = -w; dx <= w; dx++) {
    const hh = Math.max(1, h * (1 - Math.abs(dx) / (w + 1)) + (hash(dx, fr, 3) - .5) * 3);
    for (let j = 0; j < hh; j++) {
      const f = j / hh, k = clamp(4 - Math.floor(f * 3.2) - (Math.abs(dx) > w * .45 ? 1 : 0), 0, 4);
      s.set(cx + dx + (f > .6 ? Math.round((hash(j, fr, 5) - .5) * 1.5) : 0), by - j, ramp[k], 255);
    }
  }
}
const bx = (s, x, w, d, h, top, front, tex) => { s.box(x, 21 - h - d, w, d, h, top, front, tex ? { tex } : undefined); return 21 - h - d; };
function table(s, x, w, d, ramp, legH, tex) {
  const y0 = 21 - legH - 2 - d;
  s.box(x, y0, w, d, 2, ramp, ramp, tex ? { tex } : undefined);
  s.rect(x, 21 - legH, 2, legH, ramp[1]); s.rect(x + w - 2, 21 - legH, 2, legH, ramp[0]); s.rect(x, 21 - legH, 1, legH, ramp[2]);
  return y0;
}
const brickT = (i, j, f) => (j % 3 === 0 || (i + (Math.floor(j / 3) & 1) * 2) % 5 === 0) ? -2 : 0;
const stoneT = (i, j, f) => (j % 4 === 3 || (i + (Math.floor(j / 4) & 1) * 3) % 6 === 0) ? -2 : (hash(i, j, 9) > .8 ? 1 : 0);
const weaveT = (i, j) => ((i >> 1) + j) & 1 ? 0 : -1;
const smoke = (s, x, y, n, r) => { for (let i = 0; i < n; i++) s.set(x + Math.round((r() - .5) * 3) + (i >> 1), y - i * 2, P.furGrey[3 + (i & 1)]); };
function posts(s, x0, x1, top, ramp) { s.rect(x0, top, 1, 21 - top, ramp[4]); s.rect(x0 + 1, top, 1, 21 - top, ramp[2]); s.rect(x1, top, 1, 21 - top, ramp[3]); s.rect(x1 + 1, top, 1, 21 - top, ramp[1]); s.rect(x0, top, x1 - x0 + 2, 1, ramp[5]); s.rect(x0, top + 1, x1 - x0 + 2, 1, ramp[2]); }
function bed(s, frame, mat, blanket, pillow, head) {
  s.rect(3, 5, 13, 16, frame[1]); s.rect(3, 5, 1, 16, frame[3]); s.rect(3, 5, 13, 1, frame[4]);
  for (let y = 6; y < 20; y++) for (let x = 4; x < 15; x++) s.set(x, y, typeof mat === 'function' ? mat(x, y) : mat[3 + (x === 4 ? 1 : 0)]);
  if (pillow) { s.rect(6, 7, 7, 3, pillow[pillow.length - 1]); s.rect(6, 9, 7, 1, pillow[pillow.length - 3]); s.set(12, 7, pillow[pillow.length - 2]); }
  for (let y = 12; y < 20; y++) for (let x = 4; x < 15; x++) s.set(x, y, typeof blanket === 'function' ? blanket(x, y) : blanket[y === 12 ? blanket.length - 1 : x > 12 ? 1 : 2]);
  if (head) { s.rect(3, 2, 13, 4, head[3]); s.rect(3, 2, 13, 1, head[5]); s.rect(3, 5, 13, 1, head[1]); s.rect(15, 2, 1, 4, head[1]); }
}
const logEnd = (s, x, y) => { s.disc(x, y, 2.6, 2.4, (px, py, nx, ny) => { const q = nx * nx + ny * ny; return q > .6 ? P.wood[2] : q > .2 ? P.plank[4] : P.plank[2]; }); };

const BUILDS = {
  campfire: { name: 'Campfire', cat: 'production', frames: 3, emit: { dx: 0, dy: -5, rad: 84, col: [1, .6, .24], flicker: 1 }, f(s, r, fr) {
    for (let a = 0; a < 8; a++) { const t = a / 8 * 6.283, x = Math.round(8.5 + Math.cos(t) * 5.5), y = Math.round(17.5 + Math.sin(t) * 2.6); s.set(x, y, P.rock[5]); s.set(x + 1, y, P.rock[3]); s.set(x, y + 1, P.rock[2]); s.set(x + 1, y + 1, P.rock[1]); }
    s.line(5, 19, 13, 16, P.wood[2]); s.line(5, 16, 13, 19, P.wood[3]); s.rect(7, 17, 5, 2, P.fire[1], 255);
    flame(s, 9, 17, 3, 9, fr); s.set(6 + hash(fr, 1, 1) * 6, 4 + hash(fr, 2, 1) * 4, P.fire[3], 255);
  } },
  hearth: { name: 'Stone Hearth', cat: 'production', frames: 3, emit: { dx: 0, dy: -2, rad: 66, col: [1, .6, .24], flicker: 1 }, f(s, r, fr) {
    const y0 = bx(s, 2, 15, 6, 7, P.stone, P.stone, stoneT);
    s.rect(6, y0 + 1, 7, 4, P.stone[1]); s.rect(6, 15, 7, 6, P.ink); flame(s, 9, 20, 2, 5, fr);
  } },
  craft: { name: 'Bare Craft Spot', cat: 'production', flat: 1, f(s) {
    for (let y = 10; y < 21; y++) for (let x = 3; x < 16; x++) s.set(x, y, P.cloth[(x === 3 || y === 10) ? 3 : (x === 15 || y === 20) ? 0 : ((x + y) % 4 === 0 ? 1 : 2)]);
    s.line(6, 18, 9, 14, P.wood[4]); s.rect(9, 13, 2, 2, P.rock[5]); s.line(11, 18, 13, 15, P.bone[5]); s.set(7, 12, P.rock[3]); s.set(13, 12, P.leather[3]);
  } },
  workbench: { name: 'Branch Workbench', cat: 'production', f(s) {
    const y0 = table(s, 2, 15, 6, P.wood, 4, (i, j) => i % 3 === 0 ? -1 : 0);
    s.rect(4, y0 + 1, 4, 2, P.rock[4]); s.line(10, y0 + 4, 14, y0 + 1, P.wood[5]); s.set(14, y0, P.rock[5]); s.line(4, 20, 14, 20, P.wood[1]);
  } },
  carpenter: { name: "Plank Carpenter's Bench", cat: 'production', f(s) {
    const y0 = table(s, 1, 17, 6, P.plank, 4);
    s.rect(3, y0 + 1, 10, 2, P.plank[5]); s.rect(3, y0 + 3, 10, 1, P.plank[2]); s.line(5, y0 + 5, 11, y0 + 5, P.iron[5]); s.rect(12, y0 + 4, 2, 2, P.wood[2]); s.rect(14, y0 + 1, 2, 3, P.iron[4]);
    s.set(4, 20, P.plank[5]); s.set(7, 19, P.plank[4]); s.set(12, 20, P.plank[5]);
  } },
  butcher: { name: "Iron Butcher's Table", cat: 'production', f(s) {
    const y0 = table(s, 2, 15, 6, P.plank, 4);
    s.rect(4, y0 + 1, 5, 3, P.red[3]); s.rect(4, y0 + 1, 2, 1, P.cloth[5]); s.rect(5, y0 + 3, 4, 1, P.red[1]); s.set(10, y0 + 4, P.red[2]); s.set(11, y0 + 2, P.red[1]);
    s.rect(12, y0 + 1, 3, 2, P.iron[5]); s.rect(12, y0 + 3, 1, 2, P.wood[2]); s.set(8, 20, P.red[1]);
  } },
  bloodaltar: { name: 'Sanguinary Altar', cat: 'production', emit: { dx: 0, dy: -6, rad: 30, col: [1, .2, .2] }, f(s) {
    const y0 = bx(s, 3, 13, 5, 6, P.stone, P.stone, stoneT);
    s.rect(5, y0 + 1, 9, 3, P.red[1]); s.rect(6, y0 + 2, 6, 1, P.red[3], 160); s.rect(8, 17, 3, 4, P.red[2], 120); s.set(4, y0 - 1, P.bone[5]); s.set(14, y0 - 1, P.bone[5]); s.rect(4, y0 - 3, 1, 2, P.fire[3], 255); s.rect(14, y0 - 3, 1, 2, P.fire[3], 255);
  } },
  splitstump: { name: 'Log Splitting Stump', cat: 'production', f(s) {
    s.cyl(5, 14, 9, 7, P.wood, { tex: (i, j) => hash(i, j >> 1, 3) > .7 ? -1 : 0 });
    s.disc(9.5, 14, 4.5, 2.2, (x, y, nx, ny) => P.plank[nx * nx + ny * ny < .3 ? 3 : 5]);
    s.line(13, 4, 10, 12, P.wood[4]); s.rect(8, 11, 4, 2, P.iron[5]); s.rect(8, 13, 3, 1, P.iron[3]); s.rect(1, 18, 3, 2, P.plank[4]); s.rect(15, 19, 3, 2, P.plank[3]);
  } },
  sawpit: { name: 'Timber Sawpit', cat: 'production', f(s) {
    s.rect(2, 12, 15, 8, P.soilRich[0]); s.rect(2, 12, 15, 1, P.soil[4]); posts(s, 2, 15, 8, P.plank);
    for (let x = 1; x < 18; x++) for (let j = 0; j < 3; j++) s.set(x, 10 + j, P.wood[[4, 3, 1][j]]); s.set(1, 11, P.plank[5]); s.line(9, 4, 9, 17, P.iron[5]); s.rect(8, 3, 3, 1, P.wood[4]);
  } },
  kiln: { name: "Potter's Kiln", cat: 'production', emit: { dx: 0, dy: -2, rad: 34, col: [1, .5, .2], flicker: 1 }, f(s, r) {
    s.ball(9, 14, 7.5, 7.5, 0, P.clay, { n: .25, d: .4 }); for (let x = 0; x < 19; x++) { s.set(x, 21, null); s.set(x, 22, null); }
    s.disc(9, 18, 2.6, 2.6, P.ink); s.rect(8, 18, 3, 3, P.fire[2], 255); s.set(9, 18, P.fire[4], 255); s.rect(8, 6, 3, 1, P.ink); smoke(s, 9, 5, 3, r);
    for (let x = 3; x < 16; x++) if (s.get(x, 12) && x % 3 === 0) s.set(x, 12, P.clay[1]);
  } },
  firekiln: { name: 'Fire-brick Kiln', cat: 'production', emit: { dx: 0, dy: -2, rad: 38, col: [1, .5, .2], flicker: 1 }, f(s, r) {
    const y0 = bx(s, 3, 13, 5, 10, P.fireBrick, P.fireBrick, brickT);
    s.rect(7, 15, 5, 6, P.ink); s.rect(7, 17, 5, 4, P.fire[2], 255); s.rect(8, 18, 3, 3, P.fire[4], 255); s.rect(8, y0 + 1, 3, 2, P.ink); smoke(s, 9, y0, 3, r);
  } },
  stonecutter: { name: "Granite Stonecutter's Bench", cat: 'production', f(s) {
    const y0 = table(s, 2, 15, 6, P.plank, 4);
    s.box(4, y0 - 3, 7, 4, 3, P.stone, P.stone); s.line(13, y0 + 4, 15, y0 + 1, P.iron[5]); s.rect(12, y0 + 1, 2, 2, P.wood[3]); s.set(5, 20, P.stone[4]); s.set(11, 20, P.stone[5]); s.set(8, 19, P.stone[3]);
  } },
  charcoal: { name: 'Granite Charcoal Pit', cat: 'production', emit: { dx: 0, dy: -3, rad: 26, col: [1, .4, .15] }, f(s, r) {
    s.ball(9, 16, 8, 5, 0, P.furDark, { n: .5, ns: .7, d: .5 }); for (let x = 0; x < 19; x++) s.set(x, 21, null);
    for (let i = 0; i < 6; i++) { const x = 4 + Math.floor(r() * 11), y = 13 + Math.floor(r() * 6); if (s.get(x, y)) s.set(x, y, P.fire[1 + (i % 3)], 255); }
    for (let a = 0; a < 7; a++) { s.set(2 + a * 2.4, 20, P.stone[4]); s.set(3 + a * 2.4, 20, P.stone[2]); } smoke(s, 9, 10, 4, r);
  } },
  ropeframe: { name: 'Timber Rope Frame', cat: 'production', f(s) {
    posts(s, 2, 15, 9, P.plank); for (let i = 0; i < 4; i++) s.line(3, 12 + i * 2, 15, 12 + i * 2, P.cloth[3 + (i & 1)]); s.rect(8, 11, 3, 8, P.wood[3]); s.set(9, 10, P.wood[5]);
  } },
  well: { name: 'Draw Well', cat: 'production', f(s) {
    s.cyl(2, 14, 15, 7, P.stone, { tex: stoneT }); s.disc(9.5, 14, 7.5, 3.4, P.stone[5]); s.disc(9.5, 14, 5.5, 2.2, P.deep[1]); s.set(8, 14, P.deep[4]); s.set(11, 13, P.deep[3]);
    s.rect(2, 3, 1, 11, P.wood[4]); s.rect(16, 3, 1, 11, P.wood[2]); s.rect(1, 1, 17, 2, P.thatch[3]); s.rect(1, 1, 17, 1, P.thatch[5]); s.rect(1, 3, 17, 1, P.thatch[1]);
    s.line(9, 4, 9, 10, P.cloth[3]); s.rect(8, 10, 3, 3, P.wood[3]); s.rect(8, 10, 3, 1, P.iron[4]);
  } },
  cheese: { name: 'Cheese Basin', cat: 'production', f(s) {
    const y0 = bx(s, 3, 13, 6, 4, P.plank, P.plank); s.rect(4, y0 + 1, 11, 4, P.cloth[5]); s.rect(4, y0 + 4, 11, 1, P.cloth[3]); s.disc(7, y0 + 2.5, 2, 1.2, P.gold[3]); s.disc(12, y0 + 2.5, 1.6, 1, P.gold[4]);
  } },
  smoking: { name: 'Smoking Rack', cat: 'production', emit: { dx: 0, dy: -1, rad: 16, col: [1, .5, .2] }, f(s, r) {
    s.line(3, 20, 9, 4, P.wood[4]); s.line(15, 20, 9, 4, P.wood[2]); s.line(9, 20, 9, 4, P.wood[3]); s.line(5, 10, 13, 10, P.wood[5]);
    for (const x of [6, 8, 11, 13]) { s.rect(x, 11, 1, 4, P.furGrey[4]); s.set(x, 15, P.furGrey[2]); }
    s.rect(7, 19, 5, 2, P.furDark[1]); s.set(8, 19, P.fire[2], 255); s.set(10, 20, P.fire[1], 255); smoke(s, 9, 17, 2, r);
  } },
  curing: { name: 'Branch Curing Frame', cat: 'production', f(s) {
    posts(s, 2, 15, 6, P.wood); s.rect(3, 12, 13, 1, P.wood[3]);
    for (let y = 8; y < 15; y++) for (let x = 4; x < 9; x++) s.set(x, y, P.leather[x === 4 ? 4 : y > 12 ? 2 : 3]);
    for (let y = 8; y < 14; y++) for (let x = 10; x < 15; x++) s.set(x, y, P.furTan[x === 10 ? 4 : y > 11 ? 2 : 3]);
  } },
  tailor: { name: "Steel-Tooled Tailor's Bench", cat: 'production', f(s) {
    const y0 = table(s, 2, 15, 6, P.plank, 4);
    s.rect(3, y0 + 1, 7, 4, P.red[2]); s.rect(3, y0 + 1, 7, 1, P.red[4]); s.rect(8, y0 + 3, 4, 2, P.blue[3]); s.line(12, y0 + 1, 15, y0 + 3, P.iron[6]); s.line(12, y0 + 3, 15, y0 + 1, P.iron[5]); s.set(13, y0 + 5, P.cloth[5]);
  } },
  currier: { name: "Plank Currier's Bench", cat: 'production', f(s) {
    const y0 = table(s, 2, 15, 6, P.plank, 4); s.rect(3, y0 + 1, 10, 4, P.leather[3]); s.rect(3, y0 + 1, 10, 1, P.leather[5]); s.rect(12, y0 + 4, 3, 1, P.leather[1]); s.line(13, y0 + 1, 15, y0 + 3, P.iron[5]);
  } },
  trough: { name: 'Soaking Trough', cat: 'production', f(s) {
    const y0 = bx(s, 2, 15, 6, 4, P.wood, P.wood); s.rect(3, y0 + 1, 13, 4, P.shallow[1]); s.rect(4, y0 + 2, 5, 1, P.shallow[4]); s.rect(9, y0 + 3, 4, 2, P.leather[3]);
  } },
  smelter: { name: 'Clay-Brick Smelting Hearth', cat: 'production', frames: 3, emit: { dx: 0, dy: -4, rad: 50, col: [1, .55, .2], flicker: 1 }, f(s, r, fr) {
    const y0 = bx(s, 3, 13, 6, 6, P.brick, P.brick, brickT); s.rect(5, y0 + 1, 9, 4, P.furDark[0]); for (let i = 0; i < 7; i++) s.set(6 + hash(i, fr, 2) * 7, y0 + 1 + hash(i, fr, 4) * 3, P.fire[2 + (i % 3)], 255);
    flame(s, 9, y0 + 3, 2, 5, fr); s.rect(15, 17, 3, 3, P.leather[3]); s.rect(15, 17, 3, 1, P.leather[5]);
  } },
  bloomery: { name: 'Clay-Brick Bloomery', cat: 'production', emit: { dx: 0, dy: -8, rad: 44, col: [1, .5, .2], flicker: 1 }, f(s, r) {
    for (let j = 0; j < 15; j++) { const w = 7 + Math.round(j / 14 * 4); s.cyl(9 - (w >> 1), 6 + j, w, 1, P.brick, { tex: i => (j % 3 === 0 || (i + (Math.floor(j / 3) & 1) * 2) % 4 === 0) ? -1 : 0 }); }
    s.rect(7, 5, 5, 1, P.brick[1]); s.rect(8, 5, 3, 1, P.fire[3], 255); s.set(9, 4, P.fire[4], 255); s.rect(8, 17, 3, 4, P.ink); s.rect(8, 19, 3, 2, P.fire[2], 255); smoke(s, 9, 3, 2, r);
    s.rect(15, 17, 3, 3, P.leather[3]); s.rect(13, 18, 2, 1, P.iron[4]);
  } },
  anvil: { name: 'Iron Anvil', cat: 'production', f(s) {
    s.cyl(5, 15, 8, 6, P.wood, { tex: (i, j) => hash(i, j >> 1, 3) > .7 ? -1 : 0 });
    s.rect(3, 10, 11, 1, P.iron[6]); s.rect(3, 11, 11, 2, P.iron[4]); s.rect(14, 10, 3, 1, P.iron[5]); s.rect(14, 11, 2, 1, P.iron[3]); s.rect(7, 13, 4, 2, P.iron[2]); s.rect(5, 15, 8, 1, P.iron[4]);
    s.line(15, 20, 16, 14, P.wood[4]); s.rect(15, 13, 3, 2, P.iron[5]);
  } },
  casting: { name: 'Clay-Brick Casting Hearth', cat: 'production', emit: { dx: 0, dy: -4, rad: 40, col: [1, .6, .2], flicker: 1 }, f(s) {
    const y0 = bx(s, 2, 15, 6, 6, P.brick, P.brick, brickT); s.disc(6.5, y0 + 2.5, 3, 2, P.iron[2]); s.disc(6.5, y0 + 2.5, 2, 1.2, P.fire[3], 255);
    s.rect(11, y0 + 1, 5, 4, P.sand[3]); s.rect(12, y0 + 2, 3, 1, P.fire[2], 255); s.rect(12, y0 + 3, 1, 1, P.fire[3], 255);
  } },
  blast: { name: 'Fire-brick Blast Furnace', cat: 'production', tall: 1, emit: { dx: 0, dy: -8, rad: 60, col: [1, .5, .2], flicker: 1 }, f(s, r) {
    for (let j = 0; j < 27; j++) { const w = 9 + Math.round(j / 26 * 6); s.cyl(12 - (w >> 1), 14 + j, w, 1, P.fireBrick, { tex: i => (j % 3 === 0 || (i + (Math.floor(j / 3) & 1) * 2) % 5 === 0) ? -1 : 0 }); }
    s.rect(8, 13, 9, 1, P.iron[4]); s.rect(9, 12, 7, 1, P.fire[3], 255); s.rect(10, 11, 5, 1, P.fire[4], 255); s.rect(9, 33, 7, 8, P.ink); s.rect(10, 36, 5, 5, P.fire[2], 255); s.rect(11, 38, 3, 3, P.fire[4], 255);
    for (const y of [20, 28]) s.rect(6, y, 13, 1, P.iron[3]); smoke(s, 12, 9, 4, r);
  } },
  loom: { name: 'Beam Weaving Frame', cat: 'production', f(s) {
    posts(s, 2, 15, 3, P.plank); s.rect(3, 17, 13, 1, P.plank[3]);
    for (let x = 4; x < 15; x++) { for (let y = 5; y < 11; y++) s.set(x, y, P.cloth[x & 1 ? 4 : 2]); for (let y = 11; y < 17; y++) s.set(x, y, (y % 3 === 0 ? P.red : P.blue)[x === 4 ? 4 : 3 - (x > 12 ? 1 : 0)]); }
    s.rect(3, 10, 13, 1, P.wood[4]);
  } },
  lapidary: { name: 'Sandstone Lapidary Bench', cat: 'production', emit: { dx: 0, dy: -8, rad: 14, col: [.6, .4, 1] }, f(s) {
    const y0 = table(s, 2, 15, 6, P.plank, 4); s.disc(6, y0 + 2.5, 3, 2, P.sand[4]); s.disc(6, y0 + 2.5, 1, .7, P.sand[1]);
    s.set(11, y0 + 2, GEM.ruby[4], 200); s.set(13, y0 + 3, GEM.emerald[4], 200); s.set(12, y0 + 1, GEM.sapphire[4], 200); s.set(14, y0 + 1, GEM.topaz[4], 200);
  } },
  attune: { name: 'Attunement Altar', cat: 'production', emit: { dx: 0, dy: -10, rad: 50, col: [.7, .4, 1], pulse: 1 }, f(s) {
    const y0 = bx(s, 3, 13, 5, 6, P.stone, P.stone, stoneT);
    for (const [x, y] of [[5, 16], [7, 18], [9, 16], [11, 18], [13, 16]]) s.set(x, y, GEM.amethyst[4], 255);
    s.disc(9, y0 + 2, 3.5, 1.5, P.stone[1]); shard(s, 9, y0 - 1, 3.4, 8, 0, GEM.amethyst, 255); s.set(5, y0 - 4, GEM.amethyst[5], 255); s.set(13, y0 - 6, GEM.amethyst[4], 255);
  } },
  glyph: { name: 'Heartwood Glyph Bench', cat: 'production', emit: { dx: 0, dy: -6, rad: 26, col: [.85, .42, 1] }, f(s) {
    const y0 = table(s, 2, 15, 6, P.heart, 4); for (const [x, y] of [[4, 1], [6, 3], [8, 1], [10, 3], [12, 1], [14, 3], [6, 1], [10, 1]]) s.set(x, y0 + y, P.heart[5], 255); s.rect(11, y0 + 3, 3, 2, P.cloth[4]);
  } },
  compost: { name: 'Wicker Compost Bin', cat: 'production', f(s) {
    const y0 = bx(s, 3, 13, 6, 6, P.wicker, P.wicker, weaveT); for (let y = y0 + 1; y < y0 + 5; y++) for (let x = 4; x < 15; x++) s.set(x, y, hash(x, y, 3) > .75 ? P.grassLoam[3] : P.preta[1 + (hash(x, y, 5) > .5 ? 1 : 0)]);
  } },
  quern: { name: 'Granite Quern', cat: 'production', f(s) {
    s.cyl(4, 15, 11, 5, P.stone); s.disc(9.5, 15, 5.5, 2.2, P.stone[5]); s.cyl(6, 11, 7, 3, P.stone); s.disc(9.5, 11, 3.5, 1.6, P.stone[5]); s.set(9, 11, P.ink);
    s.line(12, 10, 14, 6, P.wood[4]); s.set(4, 20, P.cloth[5]); s.set(6, 20, P.cloth[4]); s.set(14, 20, P.cloth[5]);
  } },
  stove: { name: 'Iron Stove', cat: 'production', emit: { dx: 0, dy: -2, rad: 28, col: [1, .5, .2], flicker: 1 }, f(s, r) {
    const y0 = bx(s, 3, 12, 5, 8, P.iron, P.iron); s.rect(6, 15, 6, 4, P.iron[1]); s.rect(7, 17, 4, 1, P.fire[2], 255); s.rect(7, 16, 4, 1, P.fire[3], 255);
    s.rect(13, 1, 2, y0 + 1, P.iron[3]); s.rect(13, 1, 1, y0 + 1, P.iron[5]); s.disc(7, y0 + 2, 2.4, 1.5, P.copper[3]); s.set(6, y0 + 1, P.copper[5]); smoke(s, 14, 0, 1, r);
  } },
  oven: { name: 'Stone-Vaulted Oven', cat: 'production', emit: { dx: 0, dy: -2, rad: 34, col: [1, .5, .2], flicker: 1 }, f(s, r) {
    s.ball(9, 14, 8, 7.5, 0, P.stone, { facet: 3, seed: 4, d: .3 }); for (let x = 0; x < 19; x++) { s.set(x, 21, null); s.set(x, 22, null); }
    s.disc(9, 17.5, 3.4, 3, P.ink); s.rect(7, 18, 5, 3, P.fire[1], 255); s.rect(8, 19, 3, 2, P.fire[3], 255); s.rect(12, 4, 3, 5, P.stone[3]); s.rect(12, 4, 3, 1, P.stone[5]); smoke(s, 13, 3, 2, r);
  } },
  kettle: { name: 'Copper Brewing Kettle', cat: 'production', frames: 3, emit: { dx: 0, dy: 0, rad: 24, col: [1, .5, .2], flicker: 1 }, f(s, r, fr) {
    flame(s, 9, 20, 3, 3, fr); s.ball(9, 12, 6.5, 5.5, 0, P.copper, { d: .4 }); s.disc(9, 8, 5, 1.6, P.copper[1]); s.disc(9, 8, 4, 1, P.savanna[3]); s.rect(3, 9, 1, 3, P.copper[5]); s.rect(15, 9, 1, 3, P.copper[2]);
    s.line(3, 20, 5, 16, P.iron[3]); s.line(15, 20, 13, 16, P.iron[2]); s.set(7 + fr * 2, 5 - fr, P.cloth[5]);
  } },
  tun: { name: 'Wooden Fermenting Tun', cat: 'production', f(s) {
    s.cyl(4, 8, 11, 13, P.plank, { tex: i => i % 3 === 0 ? -1 : 0 }); s.rect(4, 11, 11, 1, P.iron[3]); s.rect(4, 17, 11, 1, P.iron[3]); s.set(4, 11, P.iron[5]); s.set(4, 17, P.iron[5]);
    s.disc(9.5, 8, 5.5, 2, P.plank[4]); s.disc(9.5, 8, 4.3, 1.3, P.leather[1]); s.set(8, 8, P.leather[3]);
  } },
  carpenterheart: { name: "Heartwood Joiner's Bench", cat: 'production', f(s) {
    const y0 = table(s, 1, 17, 6, P.heart, 4); s.rect(3, y0 + 1, 9, 2, P.plank[5]); s.rect(13, y0 + 1, 2, 4, P.iron[5]); s.line(4, y0 + 4, 10, y0 + 4, P.iron[6]);
  } },
  potter: { name: "Potter's Wheel", cat: 'production', f(s) {
    s.cyl(7, 15, 5, 6, P.wood); s.disc(9.5, 14.5, 6.5, 2.4, P.stone[4]); s.disc(9.5, 14, 6.5, 2.2, P.stone[5]); s.ball(9.5, 10.5, 3, 3.2, 1, P.clay, { d: .3 }); s.rect(8, 7, 3, 1, P.clay[0]);
    s.set(15, 20, P.clay[3]); s.set(16, 20, P.clay[2]);
  } },
  spinning: { name: 'Bronze-Spindle Spinning Wheel', cat: 'production', f(s) {
    for (let a = 0; a < 28; a++) { const t = a / 28 * 6.283; s.set(6.5 + Math.cos(t) * 5, 11 + Math.sin(t) * 5, P.wood[t > 2 && t < 5 ? 4 : 2]); }
    for (let a = 0; a < 4; a++) { const t = a / 4 * 3.1416; s.line(6.5 - Math.cos(t) * 4, 11 - Math.sin(t) * 4, 6.5 + Math.cos(t) * 4, 11 + Math.sin(t) * 4, P.wood[3]); }
    s.set(6, 11, P.copper[4]); s.line(3, 20, 6, 12, P.plank[3]); s.line(10, 20, 7, 12, P.plank[2]); s.rect(11, 15, 6, 1, P.plank[4]); s.line(13, 20, 13, 16, P.plank[2]); s.line(16, 20, 16, 16, P.plank[1]);
    s.rect(15, 11, 1, 4, P.copper[4]); s.rect(14, 12, 3, 2, P.cloth[5]); s.line(11, 8, 15, 11, P.cloth[4]);
  } },
  porcelain: { name: 'Fire-brick Porcelain Kiln', cat: 'production', emit: { dx: 0, dy: -2, rad: 34, col: [1, .6, .3], flicker: 1 }, f(s, r) {
    s.ball(9, 13, 8, 8, 0, P.fireBrick, { n: .2, d: .4 }); for (let x = 0; x < 19; x++) { s.set(x, 21, null); s.set(x, 22, null); }
    s.disc(9, 17.5, 3, 3, P.ink); s.rect(8, 18, 3, 3, P.fire[3], 255); s.rect(5, 12, 9, 1, P.iron[3]); s.set(15, 20, P.cloth[5]); s.set(16, 19, P.cloth[5]); s.set(16, 20, P.blue[3]);
  } },
  crucible: { name: 'Fire-brick Crucible', cat: 'production', emit: { dx: 0, dy: -8, rad: 40, col: [1, .7, .3], flicker: 1 }, f(s) {
    const y0 = bx(s, 3, 13, 6, 7, P.fireBrick, P.fireBrick, brickT); s.disc(9, y0 + 2.5, 4.5, 2.3, P.iron[1]); s.disc(9, y0 + 2.5, 3.4, 1.5, P.fire[3], 255); s.set(8, y0 + 2, P.fire[4], 255);
  } },
  clockwork: { name: 'Steel Clockwork Bench', cat: 'production', f(s) {
    const y0 = table(s, 2, 15, 6, P.iron, 4); for (const [x, y, c] of [[5, 2, P.gold], [9, 3, P.copper], [13, 2, P.iron]]) { s.disc(x, y0 + y, 1.8, 1.4, c[c.length - 2]); s.set(x, y0 + y, P.ink); } s.set(7, y0 + 1, P.gold[4]); s.set(11, y0 + 4, P.copper[4]);
  } },
  tanning: { name: 'Oak Tanning Pit', cat: 'production', flat: 1, f(s) {
    s.disc(9, 15, 8, 5, P.wood[3]); s.disc(9, 14.6, 8, 4.6, P.wood[4]); s.disc(9, 15, 6.4, 3.6, P.leather[0]); s.disc(9, 15.4, 6, 3, P.leather[1]);
    s.rect(6, 14, 4, 2, P.leather[4]); s.rect(10, 16, 3, 1, P.leather[3]); s.set(12, 13, P.leather[5]);
  } },
  steeping: { name: 'Steeping Vat', cat: 'production', f(s) {
    s.cyl(3, 11, 13, 10, P.plank, { tex: i => i % 3 === 0 ? -1 : 0 }); s.rect(3, 14, 13, 1, P.iron[3]); s.disc(9.5, 11, 6.5, 2.4, P.plank[4]); s.disc(9.5, 11, 5.3, 1.6, P.green[1]); s.set(8, 11, P.green[3]); s.set(11, 10, P.green[4]);
  } },
  still: { name: 'Copper Still', cat: 'production', frames: 3, emit: { dx: -3, dy: 0, rad: 20, col: [1, .5, .2], flicker: 1 }, f(s, r, fr) {
    flame(s, 6, 20, 2, 2, fr); s.ball(6, 14, 4.8, 4.8, 0, P.copper, { d: .4 }); s.rect(5, 6, 2, 4, P.copper[4]); s.rect(5, 6, 1, 4, P.copper[5]); s.line(6, 6, 14, 6, P.copper[4]);
    for (let j = 0; j < 9; j++) s.set(14 + (j % 4 < 2 ? 0 : 1), 7 + j, P.copper[3 + (j & 1)]); s.rect(12, 16, 5, 5, P.clay[3]); s.rect(12, 16, 5, 1, P.clay[1]); s.rect(12, 17, 1, 4, P.clay[4]);
  } },
  manaforge: { name: 'Gem-Dust Manaforge', cat: 'production', frames: 3, emit: { dx: 0, dy: -6, rad: 62, col: [.35, .7, 1], flicker: 1 }, f(s, r, fr) {
    const y0 = bx(s, 2, 15, 6, 7, P.stone, P.iron); s.rect(4, y0 + 1, 11, 4, P.mana[0]); for (let i = 0; i < 6; i++) s.set(5 + hash(i, fr, 2) * 9, y0 + 1 + hash(i, fr, 4) * 3, P.mana[3 + (i % 3)], 255);
    flame(s, 9, y0 + 3, 3, 8, fr, P.mana.slice(1)); for (const [x, y] of [[4, 16], [6, 18], [9, 16], [12, 18], [14, 16], [9, 19]]) s.set(x, y, P.mana[4], 255);
  } },
  runedcrucible: { name: 'Runed Crucible Furnace', cat: 'production', tall: 1, emit: { dx: 0, dy: -10, rad: 60, col: [.4, .7, 1], flicker: 1 }, f(s, r) {
    for (let j = 0; j < 22; j++) { const w = 11 + Math.round(j / 21 * 4); s.cyl(12 - (w >> 1), 19 + j, w, 1, P.concrete, { tex: i => (j % 5 === 0) ? -1 : 0 }); }
    s.disc(12, 18, 6, 2.4, P.iron[2]); s.disc(12, 18, 4.6, 1.6, P.mana[4], 255); for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if ((RUNE[j % 2 ? 1 : 4] >> i) & 1) s.set(10 + i, 25 + j * 2, P.mana[4], 255);
    s.rect(9, 36, 7, 5, P.ink); s.rect(10, 38, 5, 3, P.mana[3], 255); for (let i = 0; i < 4; i++) s.set(10 + r() * 5, 8 + r() * 8, P.mana[5], 255);
  } },
  runicloom: { name: 'Ironwood Runic Loom', cat: 'production', emit: { dx: 0, dy: -8, rad: 26, col: [.4, .7, 1] }, f(s) {
    posts(s, 2, 15, 3, P.ironbark.concat([P.ironbark[4]])); s.rect(3, 17, 13, 1, P.ironbark[3]);
    for (let x = 4; x < 15; x++) for (let y = 5; y < 17; y++) s.set(x, y, y > 10 ? P.purple[2 + ((x + y) % 3 === 0 ? 2 : 0)] : P.mana[x & 1 ? 4 : 2], y <= 10 && (x & 1) ? 200 : (x + y) % 3 === 0 && y > 10 ? 160 : 0);
  } },
  resin: { name: 'Plank Resin Tap', cat: 'production', f(s) {
    s.cyl(6, 2, 6, 19, P.wood, { tex: (i, j) => hash(i, j >> 1, 5) > .7 ? -1 : 0 }); s.line(7, 9, 10, 11, P.gold[3]); s.line(7, 12, 10, 14, P.gold[3]); s.rect(8, 15, 4, 4, P.plank[3]); s.rect(8, 15, 4, 1, P.gold[4]); s.rect(8, 15, 1, 4, P.plank[5]);
  } },
  snare: { name: 'Snare', cat: 'production', flat: 1, f(s) {
    s.line(4, 20, 6, 8, P.wood[3]); s.line(6, 8, 12, 12, P.wood[4]); s.line(12, 12, 12, 16, P.cloth[3]); for (let a = 0; a < 10; a++) { const t = a / 10 * 6.283; s.set(12 + Math.cos(t) * 3, 18 + Math.sin(t) * 1.6, P.cloth[4]); } s.rect(15, 18, 1, 3, P.wood[3]);
  } },
  deadfall: { name: 'Deadfall Trap', cat: 'production', f(s) {
    for (let j = 0; j < 5; j++) s.line(3, 12 + j, 15, 16 + j, P.stone[[5, 4, 3, 2, 1][j]]); s.line(13, 20, 11, 13, P.wood[4]); s.set(9, 20, P.red[3]); s.set(8, 20, P.cloth[4]);
  } },
  windmill: { name: 'Windmill', cat: 'production', tall: 1, frames: 4, f(s, r, fr) {
    for (let j = 0; j < 24; j++) { const w = 9 + Math.round(j / 23 * 5); s.cyl(12 - (w >> 1), 17 + j, w, 1, P.daub, { tex: i => hash(i, j, 3) > .85 ? -1 : 0 }); }
    s.ball(12, 16, 6, 5, 0, P.thatch, { n: .5, ns: 1 }); s.rect(10, 35, 4, 6, P.wood[1]); s.rect(10, 35, 4, 1, P.wood[4]); s.rect(11, 24, 2, 3, P.ink);
    for (let b = 0; b < 4; b++) { const a = b * 1.5708 + .5 + fr * .3927, c = Math.cos(a), sn = Math.sin(a); s.line(12, 16, 12 + c * 14, 16 + sn * 14, P.wood[4]); for (let k = 4; k < 14; k++) { s.set(12 + c * k - sn * 1.6, 16 + sn * k + c * 1.6, P.cloth[4]); s.set(12 + c * k - sn * 2.8, 16 + sn * k + c * 2.8, P.cloth[2 + (k & 1)]); } }
    s.rect(11, 15, 3, 3, P.iron[4]);
  } },
  watermill: { name: 'Watermill', cat: 'production', f(s) {
    for (let a = 0; a < 36; a++) { const t = a / 36 * 6.283; s.set(9 + Math.cos(t) * 7.5, 12 + Math.sin(t) * 7.5, P.wood[t > 2.4 && t < 5.2 ? 4 : 2]); s.set(9 + Math.cos(t) * 6.5, 12 + Math.sin(t) * 6.5, P.wood[3]); }
    for (let a = 0; a < 8; a++) { const t = a / 8 * 6.283; s.line(9, 12, 9 + Math.cos(t) * 6, 12 + Math.sin(t) * 6, P.plank[a & 1 ? 3 : 2]); s.rect(9 + Math.cos(t) * 8 - 1, 12 + Math.sin(t) * 8, 2, 1, P.plank[5]); }
    s.rect(8, 11, 3, 3, P.iron[4]); s.rect(1, 19, 17, 2, P.shallow[2]); s.set(4, 19, P.foam[2]); s.set(13, 20, P.foam[1]);
  } },
  donkeymill: { name: 'Donkey Mill', cat: 'production', f(s) {
    s.cyl(4, 14, 11, 7, P.stone, { tex: stoneT }); s.disc(9.5, 14, 5.5, 2.2, P.stone[5]); s.cyl(7, 9, 5, 5, P.stone); s.disc(9.5, 9, 2.5, 1.2, P.stone[5]); s.line(9, 8, 18, 5, P.wood[4]); s.line(9, 9, 18, 6, P.wood[2]);
  } },

  spot: { name: 'Sleeping Spot', cat: 'shelter', flat: 1, f(s) { for (let y = 7; y < 21; y++) for (let x = 4; x < 15; x++) s.set(x, y, y > 12 ? P.cloth[x > 12 ? 1 : 2] : P.thatch[2 + ((x + (y >> 1)) & 1)]); s.rect(4, 13, 11, 1, P.cloth[4]); } },
  haybed: { name: 'Hay Bed', cat: 'shelter', flat: 1, f(s) { bed(s, P.wood, (x, y) => rp(P.hay, noise(x * .9, y * .5, 3), x, y, .8), P.cloth, null); } },
  hidebed: { name: 'Hide Bed', cat: 'shelter', flat: 1, f(s) { bed(s, P.wood, P.cloth, (x, y) => rp(P.furBrown, .3 + noise(x * .8, y * .8, 5) * .7, x, y, .8), P.cloth); } },
  leatherbed: { name: 'Leather Bed', cat: 'shelter', flat: 1, f(s) { bed(s, P.plank, P.cloth, P.leather, P.cloth, P.plank); } },
  featherbed: { name: 'Feather Bed', cat: 'shelter', flat: 1, f(s) { bed(s, P.plank, P.cloth, P.red, P.cloth, P.plank); s.rect(4, 15, 11, 1, P.gold[3]); } },
  woolbed: { name: 'Wool-Tick Bed', cat: 'shelter', flat: 1, f(s) { bed(s, P.plank, P.cloth, P.blue, P.cloth, P.plank); s.rect(4, 16, 11, 1, P.cloth[4]); } },

  table: { name: 'Hewn Table', cat: 'furniture', f(s) { const y0 = table(s, 2, 15, 7, P.plank, 4); s.disc(6, y0 + 3, 2, 1.3, P.cloth[4]); s.set(6, y0 + 3, P.furTan[3]); s.rect(11, y0 + 2, 2, 3, P.copper[3]); s.set(11, y0 + 2, P.copper[5]); s.rect(8, y0 + 5, 3, 1, P.savanna[4]); } },
  woodtable: { name: 'Wooden Table', cat: 'furniture', f(s) { const y0 = table(s, 3, 13, 6, P.wood, 4); s.rect(6, y0 + 2, 3, 2, P.clay[3]); } },
  stool: { name: 'Log Stool', cat: 'furniture', f(s) { s.cyl(6, 15, 7, 6, P.wood, { tex: (i, j) => hash(i, j >> 1, 3) > .7 ? -1 : 0 }); s.disc(9.5, 15, 3.5, 1.7, (x, y, nx, ny) => P.plank[nx * nx + ny * ny < .3 ? 3 : 5]); } },
  woodstool: { name: 'Wooden Stool', cat: 'furniture', f(s) { s.box(6, 14, 7, 3, 1, P.plank, P.plank); s.rect(6, 18, 1, 3, P.plank[3]); s.rect(12, 18, 1, 3, P.plank[1]); s.rect(9, 18, 1, 2, P.plank[1]); } },
  chair: { name: 'Wicker Chair', cat: 'furniture', f(s) { for (let y = 7; y < 14; y++) for (let x = 5; x < 14; x++) s.set(x, y, P.wicker[((x >> 1) + y) & 1 ? 3 : 1]); s.rect(5, 6, 9, 1, P.wicker[4]); s.box(5, 14, 9, 3, 2, P.wicker, P.wicker, { tex: weaveT }); s.rect(5, 19, 1, 2, P.wood[3]); s.rect(13, 19, 1, 2, P.wood[1]); } },
  cushion: { name: 'Cushioned Chair', cat: 'furniture', f(s) { s.rect(5, 6, 9, 8, P.plank[2]); s.rect(5, 6, 9, 1, P.plank[5]); s.rect(6, 8, 7, 5, P.green[2]); s.box(5, 14, 9, 3, 2, P.green, P.plank); s.rect(5, 19, 1, 2, P.plank[3]); s.rect(13, 19, 1, 2, P.plank[1]); } },
  armchair: { name: 'Armchair', cat: 'furniture', f(s) { s.rect(4, 5, 11, 9, P.red[1]); s.rect(4, 5, 11, 1, P.red[4]); s.rect(5, 7, 9, 6, P.red[2]); s.box(5, 13, 9, 4, 3, P.red, P.red); s.rect(3, 10, 2, 9, P.plank[3]); s.rect(14, 10, 2, 9, P.plank[1]); s.rect(3, 10, 2, 1, P.plank[5]); s.rect(14, 10, 2, 1, P.plank[4]); } },
  couch: { name: 'Couch', cat: 'furniture', f(s) { s.rect(1, 6, 17, 8, P.blue[1]); s.rect(1, 6, 17, 1, P.blue[4]); s.rect(2, 8, 15, 5, P.blue[2]); s.box(2, 13, 15, 4, 3, P.blue, P.blue); s.rect(1, 10, 2, 10, P.plank[3]); s.rect(16, 10, 2, 10, P.plank[1]); s.rect(9, 13, 1, 4, P.blue[1]); } },
  bench: { name: 'Padded Bench', cat: 'furniture', f(s) { s.box(1, 13, 17, 4, 2, P.leather, P.plank); s.rect(2, 19, 1, 2, P.plank[3]); s.rect(15, 19, 2, 2, P.plank[1]); s.set(5, 14, P.gold[3]); s.set(13, 14, P.gold[3]); } },
  cupboard: { name: 'Larder Cupboard', cat: 'furniture', f(s) { const y0 = bx(s, 3, 13, 3, 14, P.plank, P.plank); s.rect(9, y0 + 4, 1, 13, P.plank[0]); s.set(8, y0 + 10, P.iron[5]); s.set(10, y0 + 10, P.iron[5]); s.rect(4, y0 + 9, 11, 1, P.plank[1]); s.rect(5, y0 - 2, 2, 3, P.clay[3]); s.rect(11, y0 - 1, 3, 2, P.cloth[4]); } },
  rug: { name: 'Bear Rug', cat: 'furniture', flat: 1, f(s) { s.disc(9, 14, 5.5, 6, (x, y) => rp(P.furBrown, .3 + noise(x * .8, y * .8, 5) * .6, x, y, .8)); for (const [x, y] of [[3, 9], [14, 9], [3, 19], [14, 19]]) s.rect(x, y, 2, 2, P.furBrown[2]); s.ball(9, 6, 3, 2.6, 1, P.furBrown, { d: .4 }); s.set(7, 4, P.furBrown[4]); s.set(11, 4, P.furBrown[3]); s.set(8, 6, P.ink); s.set(10, 6, P.ink); s.set(9, 8, P.ink); } },
  wolfrug: { name: 'Dire Wolf Rug', cat: 'furniture', flat: 1, f(s) { s.disc(9, 14, 5, 6, (x, y) => rp(P.furGrey, .3 + noise(x * .8, y * .8, 5) * .6, x, y, .8)); for (const [x, y] of [[3, 9], [14, 9], [3, 19], [14, 19]]) s.rect(x, y, 2, 2, P.furGrey[2]); s.ball(9, 6, 2.6, 2.6, 1, P.furGrey, { d: .4 }); s.set(7, 3, P.furGrey[4]); s.set(11, 3, P.furGrey[3]); s.set(8, 6, P.ink); s.set(10, 6, P.ink); s.set(9, 9, P.ink); } },
  totem: { name: 'Claw Totem', cat: 'furniture', f(s) { s.cyl(7, 2, 5, 19, P.wood, { tex: (i, j) => j % 6 === 5 ? -2 : 0 }); for (const y of [4, 10, 16]) { s.set(8, y, P.ink); s.set(10, y, P.ink); s.rect(8, y + 2, 3, 1, P.red[3]); } for (const y of [5, 11]) { s.line(6, y, 3, y - 2, P.bone[5]); s.line(12, y, 15, y - 2, P.bone[3]); } } },
  idol: { name: 'Ivory Idol', cat: 'furniture', f(s) { bx(s, 5, 9, 4, 3, P.stone, P.stone); s.cyl(7, 8, 5, 8, P.bone); s.ball(9.5, 6, 2.8, 2.8, 1, P.bone, { d: .3 }); s.set(8, 6, P.ink); s.set(10, 6, P.ink); s.set(9, 11, P.gold[4]); } },
  trophy: { name: 'Trophy Mount', cat: 'furniture', f(s) { s.rect(9, 10, 2, 11, P.wood[3]); s.rect(9, 10, 1, 11, P.wood[4]); s.disc(9.5, 9, 4, 3.4, P.plank[3]); s.ball(9.5, 9, 2.2, 2.4, 1, P.bone, { d: .3 }); s.set(9, 9, P.ink); s.set(10, 9, P.ink); s.line(8, 7, 4, 3, P.bone[5]); s.line(11, 7, 15, 3, P.bone[4]); s.line(5, 4, 5, 1, P.bone[5]); s.line(14, 4, 14, 1, P.bone[4]); s.line(6, 5, 3, 5, P.bone[4]); s.line(13, 5, 16, 5, P.bone[3]); } },
  granary: { name: 'Rope-Hung Granary', cat: 'furniture', f(s) { for (const x of [4, 14]) s.rect(x, 14, 1, 7, P.wood[3]); s.rect(9, 15, 1, 6, P.wood[1]); s.cyl(3, 7, 13, 8, P.wicker, { tex: weaveT }); for (let j = 0; j < 6; j++) for (let x = 9 - j * 1.6; x <= 9 + j * 1.6; x++) s.set(x, 1 + j, P.thatch[clamp(4 - Math.floor((x - 9 + j * 1.6) / 2.2), 1, 5)]); s.rect(8, 10, 3, 4, P.ink); } },
  hayrack: { name: 'Hay Rack', cat: 'furniture', f(s) { posts(s, 2, 15, 8, P.wood); for (let y = 9; y < 17; y++) for (let x = 3 + ((y - 9) >> 1); x < 16 - ((y - 9) >> 1); x++) s.set(x, y, x % 3 === 0 ? P.wood[3] : rp(P.hay, noise(x, y * .5, 3), x, y, .8)); } },
  hooks: { name: 'Meat Hooks', cat: 'furniture', f(s) { posts(s, 2, 15, 3, P.wood); for (const [x, h] of [[5, 7], [9, 9], [13, 6]]) { s.rect(x, 5, 1, 2, P.iron[5]); s.rect(x - 1, 7, 3, h, P.red[2]); s.rect(x - 1, 7, 1, h, P.red[4]); s.rect(x, 7 + h, 1, 2, P.bone[5]); s.set(x + 1, 9, P.cloth[5]); } } },
  drying: { name: 'Drying Rack', cat: 'furniture', f(s) { posts(s, 2, 15, 6, P.wood); s.rect(3, 12, 13, 1, P.wood[3]); for (let x = 4; x < 15; x += 2) { s.rect(x, 8, 1, 3, P.grassLoam[3]); s.rect(x, 13, 1, 3, P.savanna[3]); } } },
  rootclamp: { name: 'Root Clamp', cat: 'furniture', f(s) { s.ball(9, 16, 8, 5.5, 0, P.soil, { n: .4, ns: .6, d: .5 }); for (let x = 0; x < 19; x++) s.set(x, 21, null); for (let i = 0; i < 12; i++) s.set(3 + hash(i, 1, 1) * 12, 11 + hash(i, 2, 1) * 4, P.hay[2 + (i % 3)]); s.rect(8, 17, 3, 4, P.plank[2]); s.rect(8, 17, 3, 1, P.plank[4]); } },

  logpile: { name: 'Stacked logs', cat: 'stock', f(s) { for (const x of [4, 9.5, 15]) logEnd(s, x, 17.6); for (const x of [6.8, 12.2]) logEnd(s, x, 13); logEnd(s, 9.5, 8.6); } },
  stonepile: { name: 'Cut stone', cat: 'stock', f(s) { s.box(1, 14, 8, 3, 4, P.stone, P.stone); s.box(10, 14, 7, 3, 4, P.stone, P.stone); s.box(5, 8, 9, 3, 4, P.stone, P.stone); } },
  sacks: { name: 'Grain sacks', cat: 'stock', f(s) { s.ball(5.5, 16, 4.4, 4.4, 0, P.cloth, { n: .2, d: .4 }); s.ball(13, 16.4, 4, 4, 0, P.cloth, { n: .2, d: .4 }); s.ball(9, 10.5, 4, 3.8, 1, P.cloth, { n: .2, d: .4 }); for (const [x, y] of [[5, 11], [13, 12], [9, 6]]) { s.set(x, y, P.leather[3]); s.set(x + 1, y - 1, P.cloth[4]); } } },
  crate: { name: 'Crate', cat: 'stock', f(s) { const y0 = bx(s, 3, 13, 6, 8, P.plank, P.plank, (i, j, f) => f && (j === 3 || i === 6) ? -1 : !f && i % 4 === 3 ? -1 : 0); s.line(4, y0 + 7, 14, y0 + 12, P.plank[1]); } },
  ingots: { name: 'Ingots', cat: 'stock', f(s) { for (const [x, y, c] of [[2, 17, P.copper], [10, 17, P.iron], [6, 13, P.gold], [3, 19, P.iron], [11, 19, P.copper]]) { s.rect(x, y, 6, 1, c[c.length - 1]); s.rect(x, y + 1, 6, 1, c[c.length - 3]); s.set(x + 5, y + 1, c[1]); } } },
  hides: { name: 'Hides', cat: 'stock', f(s) { for (let j = 0; j < 4; j++) { s.rect(3, 18 - j * 2, 13, 2, [P.furTan, P.furGrey, P.furBrown, P.leather][j][3]); s.rect(3, 18 - j * 2, 13, 1, [P.furTan, P.furGrey, P.furBrown, P.leather][j][4]); s.set(15, 19 - j * 2, P.ink); } } },
};

function mkBuild(kind, frame) {
  const k = BUILDS[kind], s = k.tall ? new Spr(25, 44, 12, 40) : new Spr(19, 24, 9, 20), r = rng(kind.length * 7 + kind.charCodeAt(0));
  k.f(s, r, frame || 0);
  s.outline();
  if (k.emit) s.emit = { ...k.emit };
  if (!k.flat) s.sh = k.tall ? { rx: 11, ry: 4, dx: 5, dy: 0 } : { rx: 8.5, ry: 3.2, dx: 3, dy: 0 };
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
