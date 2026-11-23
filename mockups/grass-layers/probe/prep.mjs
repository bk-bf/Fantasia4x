import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [, , TREE, OUT] = process.argv;
const { encodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const { BAKE_ART, COLONY_ART } = await import(`${TREE}/tools/tileset/sources.mjs`);
const ART = join(TREE, 'tools/tileset/art');
const read = (files) => files.map((f) => readFileSync(join(ART, f), 'utf8').replace(/^'use strict';\n/, '')).join('\n');
const hook = (src, sig) => src.replace(`function cover(${sig}) {`, `function cover(${sig}) { return Object.assign(cover0(${sig}), { layers: { soil, grass, amount } }); }\nfunction cover0(${sig}) {`);
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
const toned = (src) => 'let TONE = 0;\n' + src.replace('(big > .57 ? 1 : big < .43 ? -1 : 0)', 'TONE').replace('(big > .58 ? 1 : big < .4 ? -1 : 0)', 'TONE');
const B = new Function('ART_PERIOD', `'use strict';\n${toned(hook(read(BAKE_ART), 'soil, grass, amount'))}\nreturn { GROUND, setTone: t => { TONE = t; } };`)(128);
const M = new Function(`'use strict';\n${read(COLONY_ART)}\nreturn { covAt, fbm, decal, hash, GROUND, setSeason: s => { SEASON = s; } };`)();
M.setSeason('summer');
const meta = JSON.parse(readFileSync(join(OUT, 'meta.json'), 'utf8'));
const W = meta.W, H = meta.H, T = 32;
mkdirSync(join(OUT, 'layers'), { recursive: true });

const cov = new Float32Array(W * H * 4);
const tone = (v, hi, lo) => (v > hi ? 1 : v < lo ? -1 : 0);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  cov[i] = M.covAt(x, y);
  cov[i + 1] = tone(M.fbm(x * .021, y * .021, 45, 3), .57, .43);
  cov[i + 2] = tone(M.fbm(x * .03, y * .03, 51, 2), .58, .4);
  cov[i + 3] = 1;
}
const field = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const q = Math.round(cov[i * 4] * 65535);
  field[i * 4] = q >> 8; field[i * 4 + 1] = q & 255; field[i * 4 + 2] = (cov[i * 4 + 1] + 1) * 60; field[i * 4 + 3] = 255 - (cov[i * 4 + 2] + 1) * 60;
}
writeFileSync(join(OUT, 'layers/field.png'), encodePng(W, H, field, 1));

const kinds = B.GROUND.filter((g) => !/water|rapids/.test(g.id));
const AW = 768;
const atlas = new Uint8ClampedArray(AW * 128 * kinds.length * 4);
const table = {};
kinds.forEach((g, row) => {
  const L = g.f.layers;
  const soil = L ? L.soil : g.f, grass = L ? L.grass : g.f;
  for (const [col, fn, t] of [[0, soil, -1], [1, soil, 0], [2, soil, 1], [3, grass, -1], [4, grass, 0], [5, grass, 1]])
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      B.setTone(t);
      const c = fn(x, y), i = ((row * 128 + y) * AW + col * 128 + x) * 4;
      atlas[i] = c[0]; atlas[i + 1] = c[1]; atlas[i + 2] = c[2]; atlas[i + 3] = 255;
    }
  table[g.id] = { row, amount: L ? L.amount : -1 };
});
writeFileSync(join(OUT, 'layers/atlas.png'), encodePng(AW, 128 * kinds.length, new Uint8Array(atlas.buffer), 1));
writeFileSync(join(OUT, 'layers/table.json'), JSON.stringify(table));

const SETS = {
  strict: ['pebble', 'crack', 'leaf'],
  permissive: ['pebble', 'crack', 'leaf', 'clover', 'stone', 'twig'],
  mockup: ['pebble', 'crack', 'leaf', 'clover', 'stone', 'twig', 'tuft', 'flower', 'shroomlet', 'puddle', 'lily', 'bubble', 'reedlet']
};
const mg = new Map(M.GROUND.map((g) => [g.id, g]));
for (const [name, allow] of Object.entries(SETS)) {
  const px = new Uint8ClampedArray(W * H * 4);
  const counts = {};
  const solid = (tx, ty) => { const i = ty * meta.TW + tx; return meta.wall[i] || meta.floor[i]; };
  const d = (x, y, c) => {
    if (!c || x < 0 || y < 0 || x >= W || y >= H) return;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (solid(tx, ty)) return;
    const i = (y * W + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  };
  for (let ty = 0; ty < meta.TH; ty++) for (let tx = 0; tx < meta.TW; tx++) {
    const i = ty * meta.TW + tx, g = mg.get(meta.ground[i]);
    if (solid(tx, ty) || !g || !g.dec || g.hard) continue;
    let k = 0;
    for (const [kind, dens, ramp] of g.dec) {
      const cnt = Math.floor(dens + M.hash(tx, ty, 201 + k));
      for (let j = 0; j < cnt; j++) {
        k++;
        if (!allow.includes(kind)) continue;
        const x = tx * T + Math.floor(M.hash(tx, ty, 300 + k) * T), y = ty * T + Math.floor(M.hash(tx, ty, 400 + k) * T), h = M.hash(tx, ty, 500 + k);
        M.decal(kind, x, y, h, ramp, d, false);
        counts[kind] = (counts[kind] || 0) + 1;
      }
    }
  }
  writeFileSync(join(OUT, `layers/decals-${name}.png`), encodePng(W, H, new Uint8Array(px.buffer), 1));
  console.log(name, JSON.stringify(counts));
}
console.log('kinds', JSON.stringify(table));
