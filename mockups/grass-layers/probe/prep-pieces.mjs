import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [, , TREE, DEST, LAYERS] = process.argv;
const { encodePng, decodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const { COLONY_ART } = await import(`${TREE}/tools/tileset/sources.mjs`);
const ART = join(TREE, 'tools/tileset/art');
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
const M = new Function(`'use strict';\n${COLONY_ART.map((f) => readFileSync(join(ART, f), 'utf8').replace(/^'use strict';\n/, '')).join('\n')}\nreturn { decal, GROUND, P, setSeason: s => { SEASON = s; } };`)();
M.setSeason('summer');
const atlasPng = readFileSync(join(TREE, 'static/tilesets/painted/atlas.png'));
const atlas = decodePng(atlasPng);
const man = JSON.parse(readFileSync(join(TREE, 'static/tilesets/painted/manifest.json'), 'utf8'));
const S = 48;
const lay = decodePng(readFileSync(LAYERS));
const bg = () => {
  const px = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = ((2 * 128 + y + 20) * lay.w + 4 * 128 + x + 20) * 4, i = (y * S + x) * 4;
    px[i] = lay.rgba[a]; px[i + 1] = lay.rgba[a + 1]; px[i + 2] = lay.rgba[a + 2]; px[i + 3] = 255;
  }
  return px;
};
const ramps = { tuft: M.P.grassLoam, pebble: M.P.rockWarm, stone: M.P.rockWarm, crack: M.P.soil };
for (const kind of ['pebble', 'crack', 'leaf', 'clover', 'stone', 'twig', 'tuft', 'flower', 'shroomlet', 'puddle', 'lily', 'reedlet', 'bubble']) {
  const px = bg();
  const d = (x, y, c) => { if (!c || x < 0 || y < 0 || x >= S || y >= S) return; const i = (Math.round(y) * S + Math.round(x)) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; };
  [[10, 26, .2], [28, 14, .7], [30, 34, .45]].forEach(([x, y, h]) => M.decal(kind, x, y, h, ramps[kind], d, false));
  writeFileSync(join(DEST, `piece-${kind}.png`), encodePng(S, S, new Uint8Array(px.buffer), 9));
}
const res = { wildflower_patch: 0, mushroom_patch: 0, berry_bush: 0, bloodroot: 0, grass_patch: 0, scrub_patch: 0, fallen_logs: 0, stone_outcrop: 0, mud_deposit: 0 };
for (const id of Object.keys(res)) {
  const sid = man.map.resource[id]?.[0], s = sid && man.sprites[sid];
  if (!s) { console.log('no sprite', id); continue; }
  const px = bg();
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const a = ((s.y + y) * atlas.w + s.x + x) * 4;
    if (atlas.rgba[a + 3] < 128) continue;
    const X = 8 + x, Y = S - 8 - s.h + y;
    if (X < 0 || Y < 0 || X >= S || Y >= S) continue;
    const i = (Y * S + X) * 4; px[i] = atlas.rgba[a]; px[i + 1] = atlas.rgba[a + 1]; px[i + 2] = atlas.rgba[a + 2];
  }
  writeFileSync(join(DEST, `res-${id}.png`), encodePng(S, S, new Uint8Array(px.buffer), 9));
  console.log(id, sid, s.w, s.h);
}
