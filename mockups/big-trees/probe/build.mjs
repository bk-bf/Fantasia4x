import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadArt } from './paint.mjs';
import { forest } from './trees.mjs';

const [, , TREE, WORK] = process.argv;
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, '..');
const IMG = join(PAGE, 'img');
const { encodePng, decodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const A = await loadArt(TREE);
const F = forest(A);
const painted = `${TREE}/static/tilesets/painted`;
const manifest = JSON.parse(readFileSync(`${painted}/manifest.json`, 'utf8'));
const sheet = decodePng(readFileSync(`${painted}/atlas.png`));

const SPECIES = ['oak', 'ash', 'apple', 'yew', 'birch', 'willow', 'pine', 'dead'];
const FOLK = ['woodcutter', 'farmer', 'hunter', 'cook', 'miner', 'weaver', 'guard', 'smith'];
const MAGIC = ['heartwood', 'frostheart', 'moonwood', 'ironwood', 'emberwood', 'soulwood', 'witchwood', 'bonewood'];
const MAGIC_FOLK = ['mage', 'watch', 'hunter', 'smith', 'guard', 'weaver', 'trader', 'miner'];

mkdirSync(WORK, { recursive: true });
mkdirSync(IMG, { recursive: true });

const sprites = [];
const keep = (s) => {
  if (s.id === undefined) {
    s.id = sprites.length;
    sprites.push(s);
    for (const v of s.veil ?? []) keep(v);
  }
  return s.id;
};

function ground(w, h, name) {
  const g = manifest.sprites[manifest.map.subterrain[name][0]];
  const px = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = ((g.y + (y % g.h)) * sheet.w + g.x + (x % g.w)) * 4;
      for (let k = 0; k < 3; k++) px[(y * w + x) * 3 + k] = sheet.rgba[o + k];
    }
  return { w, h, px };
}

function shadow(cv, s, x, base) {
  const { rx, ry, dx } = s.sh;
  const cx = x + dx;
  for (let y = Math.floor(base - ry * 1.2); y <= base + ry * 1.2; y++)
    for (let xx = Math.floor(cx - rx * 1.2); xx <= cx + rx * 1.2; xx++) {
      if (xx < 0 || y < 0 || xx >= cv.w || y >= cv.h) continue;
      const q = Math.hypot((xx - cx) / rx, (y - base) / ry) + (A.noise(xx / 6, y / 4, 77) - 0.5) * 0.32;
      if (q >= 1) continue;
      const k = q > 0.82 ? 0.84 : 0.7;
      for (let c = 0; c < 3; c++) cv.px[(y * cv.w + xx) * 3 + c] *= k;
    }
}

function lights(cv, items, breathing) {
  const L = new Float32Array(cv.w * cv.h * 3);
  for (const it of items) {
    const e = it.sprite.emit;
    if (!e || Boolean(it.sprite.anim?.heart) !== breathing) continue;
    const lx = it.x + e.dx,
      ly = it.base + e.dy;
    for (let y = Math.max(0, Math.floor(ly - e.rad)); y < Math.min(cv.h, ly + e.rad); y++)
      for (let x = Math.max(0, Math.floor(lx - e.rad)); x < Math.min(cv.w, lx + e.rad); x++) {
        const d = Math.hypot(x - lx, (y - ly) * 1.25) + (A.noise(x / 9, y / 9, 61) - 0.5) * 14;
        if (d >= e.rad) continue;
        const f = Math.floor(Math.pow(1 - d / e.rad, 1.6) * 5) / 5;
        for (let k = 0; k < 3; k++) L[(y * cv.w + x) * 3 + k] += f * e.col[k] * 0.95;
      }
  }
  return L;
}

function writeRgb(w, h, get, name) {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.max(0, Math.min(255, Math.round(get(i, k))));
    out[i * 4 + 3] = 255;
  }
  const png = `${WORK}/${name}.png`;
  writeFileSync(png, encodePng(w, h, out, 6));
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', png, '-o', join(IMG, `${name}.webp`)]);
}

function view(name, w, h, items) {
  const cv = ground(w, h, 'deep_grass');
  for (const it of items) if (it.tree && it.sprite.sh) shadow(cv, it.sprite, it.x, it.base);
  writeRgb(w, h, (i, k) => cv.px[i * 3 + k], `${name}-ground`);
  const lit = items.some((it) => it.sprite.emit);
  if (lit) {
    const still = lights(cv, items, false),
      breath = lights(cv, items, true);
    writeRgb(w, h, (i, k) => still[i * 3 + k] * 120, `${name}-light`);
    writeRgb(w, h, (i, k) => breath[i * 3 + k] * 120, `${name}-breath`);
  }
  const folk = items.filter((it) => it.folk);
  return {
    w,
    h,
    lit,
    items: items
      .sort((a, b) => a.base - b.base)
      .map((it) => ({
        s: keep(it.sprite),
        alt: it.alt ? keep(it.alt) : undefined,
        x: it.x,
        b: it.base,
        cut: it.cut ? folk.filter((f) => f.base < it.base).map((f) => [f.x, f.base - 16]) : undefined
      }))
  };
}

const views = {};
const at = {};

const cells = SPECIES.map((kind, i) => ({ kind, today: F.today(kind, 1), young: F.young(kind, 1), mature: F.mature(kind, 3 + i) }));
const COLS = 4;
const cellW = Math.max(...cells.map((c) => c.today.w * 0.7 + c.young.w * 0.7 + 34 + c.mature.w * 0.92)) | 0;
const rowH = Math.max(...cells.map((c) => c.mature.h)) + 26;
const items = [];
for (const [i, c] of cells.entries()) {
  const x0 = 20 + (i % COLS) * cellW,
    base = 10 + Math.floor(i / COLS) * rowH + rowH - 22;
  const youngX = x0 + Math.round(c.young.w * 0.38),
    pawnX = youngX + Math.round(c.young.w * 0.45) + 6,
    matureX = pawnX + 16 + Math.round(c.mature.w * 0.46);
  items.push({ sprite: c.young, alt: c.today, x: youngX, base, tree: true });
  items.push({ sprite: F.pawn(FOLK[i]), x: pawnX, base: base + 2, folk: true });
  items.push({ sprite: c.mature, x: matureX, base, tree: true });
  at[c.kind] = [Math.round((youngX + matureX) / 2), base - 80];
}
views.trees = view('trees', cellW * COLS + 40, rowH * Math.ceil(cells.length / COLS) + 20, items);

const STAND = [
  ['oak', 'm', 330, 340, 11],
  ['pine', 'm', 620, 262, 12],
  ['ash', 'm', 520, 540, 14],
  ['willow', 'm', 830, 486, 15],
  ['birch', 'm', 170, 500, 13],
  ['dead', 'm', 790, 236, 16],
  ['pine', 'y', 712, 372, 2],
  ['pine', 'y', 452, 302, 3],
  ['oak', 'y', 210, 250, 2],
  ['birch', 'y', 318, 610, 3],
  ['apple', 'y', 690, 624, 1],
  ['ash', 'y', 90, 340, 3],
  ['yew', 'y', 918, 322, 2]
];
const WALK = [
  ['woodcutter', 352, 282, false],
  ['hunter', 540, 470, true],
  ['farmer', 812, 432, false],
  ['miner', 636, 214, true],
  ['cook', 410, 430, true],
  ['weaver', 150, 580, false]
];
const made = new Map();
const grown = (kind, age, seed) => {
  const key = `${kind}${age}${seed}`;
  if (!made.has(key)) made.set(key, age === 'm' ? F.mature(kind, seed) : F.young(kind, seed));
  return made.get(key);
};
const stand = STAND.map(([kind, age, x, base, seed]) => ({ sprite: grown(kind, age, seed), x, base, tree: true, cut: true }));
for (const [kind, x, base, flip] of WALK) stand.push({ sprite: F.pawn(kind, flip), x, base, folk: true });
views.forest = view('forest', 980, 660, stand);

const magicCells = MAGIC.map((kind, i) => ({ kind, young: F.young(kind, 1), mature: F.mature(kind, 21 + i), elder: F.elder(kind, 41 + i) }));
const MCOLS = 2;
const mCellW = Math.max(...magicCells.map((c) => c.young.w * 0.8 + 40 + c.mature.w * 0.95 + c.elder.w * 0.92)) | 0;
const mRowH = Math.max(...magicCells.map((c) => c.elder.h)) + 20;
const magicAt = {};
const mItems = [];
for (const [i, c] of magicCells.entries()) {
  const x0 = 20 + (i % MCOLS) * mCellW,
    base = 10 + Math.floor(i / MCOLS) * mRowH + mRowH - 18;
  const youngX = x0 + Math.round(c.young.w * 0.4),
    pawnX = youngX + Math.round(c.young.w * 0.45) + 6,
    matureX = pawnX + 16 + Math.round(c.mature.w * 0.46),
    elderX = matureX + Math.round(c.mature.w * 0.5 + c.elder.w * 0.44);
  mItems.push({ sprite: c.young, x: youngX, base, tree: true });
  mItems.push({ sprite: F.pawn(MAGIC_FOLK[i]), x: pawnX, base: base + 2, folk: true });
  mItems.push({ sprite: c.mature, x: matureX, base, tree: true });
  mItems.push({ sprite: c.elder, x: elderX, base, tree: true });
  mItems.push({ sprite: F.pawn(MAGIC_FOLK[(i + 3) % 8], true), x: elderX - Math.round(c.elder.w * 0.3), base: base + 6, folk: true });
  magicAt[c.kind] = [Math.round((youngX + matureX) / 2), base - 90];
  magicAt[`${c.kind}-elder`] = [elderX, base - Math.round(c.elder.h * 0.5)];
}
views.magic = view('magic', mCellW * MCOLS + 40, mRowH * Math.ceil(magicCells.length / MCOLS) + 20, mItems);

const ATLAS_W = 2048;
const order = sprites.map((s, i) => i).sort((a, b) => sprites[b].h - sprites[a].h);
const place = [];
let cx = 0,
  cy = 0,
  shelf = 0;
for (const i of order) {
  const s = sprites[i];
  if (cx + s.w + 1 > ATLAS_W) {
    cx = 0;
    cy += shelf + 1;
    shelf = 0;
  }
  place[i] = [cx, cy];
  cx += s.w + 1;
  shelf = Math.max(shelf, s.h);
}
const ATLAS_H = cy + shelf + 1;
const rgba = new Uint8Array(ATLAS_W * ATLAS_H * 4);
const attr = new Uint8Array(ATLAS_W * ATLAS_H * 4);
for (let i = 3; i < attr.length; i += 4) attr[i] = 255;
for (const [n, s] of sprites.entries()) {
  const [ox, oy] = place[n];
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const j = y * s.w + x,
        c = s.c[j];
      if (!c) continue;
      const o = ((oy + y) * ATLAS_W + ox + x) * 4;
      for (let k = 0; k < 3; k++) rgba[o + k] = Math.max(0, Math.min(255, Math.round(c[k])));
      rgba[o + 3] = 255;
      attr[o] = s.kind[j];
      attr[o + 1] = s.ph[j];
      attr[o + 2] = s.e[j];
    }
}
writeFileSync(`${WORK}/atlas.png`, encodePng(ATLAS_W, ATLAS_H, rgba, 6));
writeFileSync(`${WORK}/parts.png`, encodePng(ATLAS_W, ATLAS_H, attr, 6));
for (const name of ['atlas', 'parts']) execFileSync('cwebp', ['-quiet', '-lossless', '-exact', '-z', '9', `${WORK}/${name}.png`, '-o', join(IMG, `${name}.webp`)]);

const meta = sprites.map((s, n) => ({ x: place[n][0], y: place[n][1], w: s.w, h: s.h, ax: s.ax, ay: s.ay, a: s.anim ?? null, emit: s.emit ?? null, veil: s.veil ? s.veil.map((v) => v.id) : null }));
for (const old of ['species', 'species-today', 'forest', 'forest-open', 'magic', 'magic-night']) rmSync(join(IMG, `${old}.webp`), { force: true });
rmSync(join(PAGE, 'layout.json'), { force: true });
writeFileSync(join(PAGE, 'scene.json'), JSON.stringify({ atlas: [ATLAS_W, ATLAS_H], sprites: meta, views, at, magicAt }) + '\n');
console.log('sprites', sprites.length, 'atlas', ATLAS_W, ATLAS_H);
