import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [, , TREE, OUT] = process.argv;
const { encodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const { REGISTRY_ART, COLONY_ART } = await import(`${TREE}/tools/tileset/sources.mjs`);
const { itemObjects } = await import(`${TREE}/tools/tileset/items.mjs`);
const ART = join(TREE, 'tools/tileset/art');
const read = (files) => files.map((f) => readFileSync(join(ART, f), 'utf8').replace(/^'use strict';\n/, '')).join('\n;');
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
const DENSITY = {
  grass_patch: ['P.grassDry, P.grassDry', [8, 34], [5, 20], [3, 10]],
  tall_grass_patch: ['P.grassLoam, P.grassDry', [9, 40], [6, 24], [3, 12]],
  deep_grass_patch: ['P.grass, P.grassLoam', [14, 60], [8, 34], [4, 16]]
};
const PARAMS = { grass_patch: [3, 4, 4], tall_grass_patch: [6, 6, 5], deep_grass_patch: [5, 5, 6] };
let extra = '';
for (const [id, [ramps, , m, s]] of Object.entries(DENSITY)) {
  const [hmin, hvar, wide] = PARAMS[id];
  extra += `${id}__m: [grassCover(${ramps}, ${m[0]}, ${hmin}, ${hvar}, ${wide}, ${m[1]}), 'dirt'],\n${id}__s: [grassCover(${ramps}, ${s[0]}, ${hmin}, ${hvar}, ${wide}, ${s[1]}), 'dirt'],\n`;
}
let src = read(REGISTRY_ART);
if (!src.includes('const COVER = {')) throw new Error('COVER block not found');
src = src.replace('const COVER = {', `const COVER = {\n${extra}`);
const DBX = new Function(`'use strict';\n${src}\nreturn DBX;`)();
DBX.fromData(itemObjects());
const M = new Function(`'use strict';\n${read(COLONY_ART)}\nreturn { covAt, hash };`)();
const meta = JSON.parse(readFileSync(join(OUT, 'meta.json'), 'utf8'));
const table = JSON.parse(readFileSync(join(OUT, 'layers/table.json'), 'utf8'));
const dress = JSON.parse(readFileSync(join(OUT, 'layers/dress.json'), 'utf8'));
const W = meta.W, H = meta.H;
const sprite = (id, seed) => {
  const e = DBX.of('plant', id).find((v) => v.variant === `summer-${seed}`);
  if (!e) throw new Error(`no sprite plant/${id}/summer-${seed}`);
  return e.make();
};
for (const mode of ['dress', 'dense']) {
  const base = readFileSync(join(OUT, 'layers/decals-strict.png'));
  const px = new Uint8ClampedArray(W * H * 4);
  const { decodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
  px.set(decodePng(base).rgba);
  const counts = { d: 0, m: 0, s: 0 };
  for (const [tx, ty, id] of dress) {
    const g = meta.ground[ty * meta.TW + tx], amount = table[g]?.amount ?? -1;
    const cov = M.covAt(tx * 32 + 16, ty * 32 + 16);
    let tier = 'd';
    if (mode === 'dress' && amount > 0) tier = cov < amount - 0.1 ? 'd' : cov < amount + 0.05 ? 'm' : 's';
    counts[tier]++;
    const s = sprite(tier === 'd' ? id : `${id}__${tier}`, Math.floor(M.hash(tx, ty, 77) * 4));
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const c = s.c[j * s.w + i];
      if (!c) continue;
      const x = tx * 32 + i - s.ax, y = ty * 32 + 31 + j - s.ay;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = (y * W + x) * 4; px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2]; px[k + 3] = 255;
    }
  }
  writeFileSync(join(OUT, `layers/dress-${mode}.png`), encodePng(W, H, new Uint8Array(px.buffer), 1));
  console.log(mode, JSON.stringify(counts));
}
