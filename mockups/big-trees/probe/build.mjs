import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadArt } from './paint.mjs';
import { forest } from './trees.mjs';

const [, , TREE, WORK] = process.argv;
const HERE = dirname(fileURLToPath(import.meta.url));
const IMG = join(HERE, '..', 'img');
const { encodePng, decodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const A = await loadArt(TREE);
const F = forest(A);
const painted = `${TREE}/static/tilesets/painted`;
const manifest = JSON.parse(readFileSync(`${painted}/manifest.json`, 'utf8'));
const sheet = decodePng(readFileSync(`${painted}/atlas.png`));
const TILE = manifest.tile;

const SPECIES = ['oak', 'ash', 'apple', 'yew', 'birch', 'willow', 'pine', 'dead'];
const FOLK = ['woodcutter', 'farmer', 'hunter', 'cook', 'miner', 'weaver', 'guard', 'smith'];

function canvas(w, h, ground) {
  const g = manifest.sprites[manifest.map.subterrain[ground][0]];
  const px = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = ((g.y + (y % g.h)) * sheet.w + g.x + (x % g.w)) * 4;
      for (let k = 0; k < 3; k++) px[(y * w + x) * 3 + k] = sheet.rgba[o + k];
    }
  return { w, h, px, em: new Float32Array(w * h), lights: [] };
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

function compose(cv, items, cut) {
  for (const it of items) if (it.sprite.sh && it.tree) shadow(cv, it.sprite, it.x, it.base);
  const folk = items.filter((it) => it.folk);
  items.sort((a, b) => a.base - b.base);
  for (const it of items) {
    const s = it.sprite,
      ox = it.x - s.ax,
      oy = it.base - s.ay;
    const over = cut && it.tree ? folk.filter((f) => f.base < it.base) : [];
    if (s.emit) cv.lights.push({ x: it.x + s.emit.dx, y: it.base + s.emit.dy, rad: s.emit.rad, col: s.emit.col });
    for (let sy = 0; sy < s.h; sy++)
      for (let sx = 0; sx < s.w; sx++) {
        const c = s.c[sy * s.w + sx];
        if (!c) continue;
        const x = ox + sx,
          y = oy + sy;
        if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) continue;
        let a = 1;
        if (over.length && s.crown[sy * s.w + sx]) {
          let d = 1e9;
          for (const f of over) d = Math.min(d, Math.hypot(x - f.x, (y - (f.base - 16)) * 1.1));
          const edge = 34 + (A.noise(x / 7, y / 7, 91) - 0.5) * 12;
          if (d < edge) a = d < edge - 6 ? 0.14 : 0.14 + ((d - edge + 6) / 6) * 0.86;
        }
        const i = (y * cv.w + x) * 3;
        for (let k = 0; k < 3; k++) cv.px[i + k] = cv.px[i + k] * (1 - a) + c[k] * a;
        cv.em[y * cv.w + x] = cv.em[y * cv.w + x] * (1 - a) + ((s.e[sy * s.w + sx] || 0) / 255) * a;
      }
  }
}

const GRADE = [0.26, 0.31, 0.46];
function night(cv) {
  const out = new Float32Array(cv.px.length);
  for (let y = 0; y < cv.h; y++)
    for (let x = 0; x < cv.w; x++) {
      const i = y * cv.w + x;
      const add = [0, 0, 0];
      for (const l of cv.lights) {
        const d = Math.hypot(x - l.x, (y - l.y) * 1.25) + (A.noise(x / 9, y / 9, 61) - 0.5) * 14;
        if (d >= l.rad) continue;
        const f = Math.floor(Math.pow(1 - d / l.rad, 1.6) * 5) / 5;
        for (let k = 0; k < 3; k++) add[k] += f * l.col[k] * 0.95;
      }
      const e = cv.em[i];
      for (let k = 0; k < 3; k++) {
        const b = cv.px[i * 3 + k];
        out[i * 3 + k] = (b * (GRADE[k] + add[k] * 0.55) + add[k] * 34) * (1 - e) + b * 1.12 * e;
      }
    }
  return { ...cv, px: out };
}

function save(cv, name) {
  const out = new Uint8Array(cv.w * cv.h * 4);
  for (let i = 0; i < cv.w * cv.h; i++) {
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.max(0, Math.min(255, Math.round(cv.px[i * 3 + k])));
    out[i * 4 + 3] = 255;
  }
  const png = `${WORK}/${name}.png`;
  writeFileSync(png, encodePng(cv.w, cv.h, out, 6));
  execFileSync('cwebp', ['-quiet', '-lossless', '-z', '9', png, '-o', join(IMG, `${name}.webp`)]);
  console.log('wrote', name, cv.w, cv.h);
}

const pawn = (kind, flip) => {
  const s = A.mkPawn(A.PAWNS[kind].o);
  return flip ? s.flip() : s;
};

mkdirSync(WORK, { recursive: true });
mkdirSync(IMG, { recursive: true });

const cells = SPECIES.map((kind, i) => {
  const seed = 3 + i;
  return { kind, today: F.today(kind, 1), young: F.young(kind, 1), mature: F.mature(kind, seed) };
});
const COLS = 4;
const cellW = Math.max(...cells.map((c) => c.today.w * 0.7 + c.young.w * 0.7 + 34 + c.mature.w * 0.92)) | 0;
const rowH = Math.max(...cells.map((c) => c.mature.h)) + 26;
const layout = {};
const sheetCv = canvas(cellW * COLS + 40, rowH * Math.ceil(cells.length / COLS) + 20, 'deep_grass');
const items = [];
for (const [i, c] of cells.entries()) {
  const x0 = 20 + (i % COLS) * cellW,
    base = 10 + Math.floor(i / COLS) * rowH + rowH - 22;
  const youngX = x0 + Math.round(c.young.w * 0.38),
    pawnX = youngX + Math.round(c.young.w * 0.45) + 6,
    matureX = pawnX + 16 + Math.round(c.mature.w * 0.46);
  items.push({ sprite: c.young, x: youngX, base, tree: true });
  items.push({ sprite: pawn(FOLK[i]), x: pawnX, base: base + 2, folk: true });
  items.push({ sprite: c.mature, x: matureX, base, tree: true });
  layout[c.kind] = [Math.round((youngX + matureX) / 2), base - 80];
}
compose(sheetCv, items, false);
save(sheetCv, 'species');

const todayCv = canvas(sheetCv.w, sheetCv.h, 'deep_grass');
const todayItems = [];
for (const [i, c] of cells.entries()) {
  const x0 = 20 + (i % COLS) * cellW,
    base = 10 + Math.floor(i / COLS) * rowH + rowH - 22;
  const youngX = x0 + Math.round(c.young.w * 0.38),
    pawnX = youngX + Math.round(c.young.w * 0.45) + 6;
  todayItems.push({ sprite: c.today, x: youngX, base, tree: true });
  todayItems.push({ sprite: pawn(FOLK[i]), x: pawnX, base: base + 2, folk: true });
  todayItems.push({ sprite: c.mature, x: pawnX + 16 + Math.round(c.mature.w * 0.46), base, tree: true });
}
compose(todayCv, todayItems, false);
save(todayCv, 'species-today');

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
const forestMade = new Map();
const grown = (kind, age, seed) => {
  const key = `${kind}${age}${seed}`;
  if (!forestMade.has(key)) forestMade.set(key, age === 'm' ? F.mature(kind, seed) : F.young(kind, seed));
  return forestMade.get(key);
};
for (const cut of [true, false]) {
  const cv = canvas(980, 660, 'deep_grass');
  const list = STAND.map(([kind, age, x, base, seed]) => ({ sprite: grown(kind, age, seed), x, base, tree: true }));
  for (const [kind, x, base, flip] of WALK) list.push({ sprite: pawn(kind, flip), x, base, folk: true });
  compose(cv, list, cut);
  save(cv, cut ? 'forest' : 'forest-open');
}
const MAGIC = ['heartwood', 'frostheart', 'moonwood', 'ironwood', 'emberwood', 'soulwood', 'witchwood', 'bonewood'];
const MAGIC_FOLK = ['mage', 'watch', 'hunter', 'smith', 'guard', 'weaver', 'trader', 'miner'];
const magicCells = MAGIC.map((kind, i) => ({ kind, young: F.young(kind, 1), mature: F.mature(kind, 21 + i), elder: F.elder(kind, 41 + i) }));
const MCOLS = 2;
const mCellW = Math.max(...magicCells.map((c) => c.young.w * 0.8 + 40 + c.mature.w * 0.95 + c.elder.w * 0.92)) | 0;
const mRowH = Math.max(...magicCells.map((c) => c.elder.h)) + 20;
const magicAt = {};
const magicCv = canvas(mCellW * MCOLS + 40, mRowH * Math.ceil(magicCells.length / MCOLS) + 20, 'deep_grass');
const mItems = [];
for (const [i, c] of magicCells.entries()) {
  const x0 = 20 + (i % MCOLS) * mCellW,
    base = 10 + Math.floor(i / MCOLS) * mRowH + mRowH - 18;
  const youngX = x0 + Math.round(c.young.w * 0.4),
    pawnX = youngX + Math.round(c.young.w * 0.45) + 6,
    matureX = pawnX + 16 + Math.round(c.mature.w * 0.46),
    elderX = matureX + Math.round(c.mature.w * 0.5 + c.elder.w * 0.44);
  mItems.push({ sprite: c.young, x: youngX, base, tree: true });
  mItems.push({ sprite: pawn(MAGIC_FOLK[i]), x: pawnX, base: base + 2, folk: true });
  mItems.push({ sprite: c.mature, x: matureX, base, tree: true });
  mItems.push({ sprite: c.elder, x: elderX, base, tree: true });
  mItems.push({ sprite: pawn(MAGIC_FOLK[(i + 3) % 8], true), x: elderX - Math.round(c.elder.w * 0.3), base: base + 6, folk: true });
  magicAt[c.kind] = [Math.round((youngX + matureX) / 2), base - 90];
  magicAt[`${c.kind}-elder`] = [elderX, base - Math.round(c.elder.h * 0.5)];
}
compose(magicCv, mItems, false);
save(magicCv, 'magic');
save(night(magicCv), 'magic-night');
writeFileSync(join(HERE, '..', 'layout.json'), JSON.stringify({ sheet: [sheetCv.w, sheetCv.h], forest: [980, 660], magic: [magicCv.w, magicCv.h], at: layout, magicAt }) + '\n');
