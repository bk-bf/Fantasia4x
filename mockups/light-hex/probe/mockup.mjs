import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [, , TREE, OUT] = process.argv;
const { encodePng } = await import(`${TREE}/tools/tileset/png.mjs`);
const { COLONY_ART } = await import(`${TREE}/tools/tileset/sources.mjs`);
const MOCK = '/home/ubuntu/mockups/fantasia4x-tileset';
const src = COLONY_ART.map((f) => readFileSync(join(MOCK, f.replace(/^registry\//, '')), 'utf8').replace(/^'use strict';\n/, '')).join('\n');
globalThis.document = { createElement: () => ({ getContext: () => ({}) }) };
const A = new Function(`'use strict';\n${src}\nreturn { buildScene, renderWorld, present, TIMES, GROUND, WL, sprCache, setSeason: s => { SEASON = s; } };`)();
const surface = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData: () => undefined };
const season = process.env.SEASON || 'autumn';
const w = A.buildScene(season);
const r = A.renderWorld(w, { season, roofs: 'cut', cache: {} });
A.setSeason(season);
const rgba = (px) => new Uint8Array(px.buffer, px.byteOffset, px.length * 4);
const meta = { W: r.W, H: r.H, lights: r.lights, times: A.TIMES };
for (const t of ['day', 'dusk', 'night']) {
  A.present(r, surface, t, 3, { calm: true });
  writeFileSync(`${OUT}/mock-${t}.png`, encodePng(r.W, r.H, rgba(r.out.slice()), 1));
  if (t === 'day') {
    writeFileSync(`${OUT}/albedo.png`, encodePng(r.W, r.H, rgba(r.work.slice()), 1));
    const em = new Uint8Array(r.W * r.H * 4);
    for (let i = 0; i < r.W * r.H; i++) { em[i * 4] = r.wem[i]; em[i * 4 + 3] = 255; }
    writeFileSync(`${OUT}/emit.png`, encodePng(r.W, r.H, em, 1));
  }
}
const kindOf = new Map();
for (const [k, sp] of A.sprCache) if (k[0] === 't') kindOf.set(sp, k.slice(1).replace(/[0-9].*$/, ''));
const keyOf = new Map(); for (const [k, sp] of A.sprCache) keyOf.set(sp, k);
meta.objs = w.objs.filter((o) => keyOf.has(o.spr)).map((o) => { const k = keyOf.get(o.spr); return { fam: k[0], kind: k.slice(1).replace(/[0-9].*$/, ''), tx: Math.round((o.x - 16) / 32), ty: Math.round((o.y - 23) / 32) }; });
meta.trees = w.objs.filter((o) => kindOf.has(o.spr)).map((o) => ({ kind: kindOf.get(o.spr), tx: Math.round((o.x - 16) / 32), ty: Math.round((o.y - 23) / 32) }));
meta.ground = Array.from(w.g, (g) => A.GROUND[g].id);
meta.wall = Array.from(w.wall);
meta.floor = Array.from(w.floor);
meta.TW = w.W; meta.TH = w.H; meta.mountain = A.WL.mountain;
const w2 = A.buildScene(season); w2.objs = [];
const r2 = A.renderWorld(w2, { season, roofs: 'cut', cache: {} });
A.present(r2, surface, 'day', 3, { calm: true });
writeFileSync(`${OUT}/albedo-ground.png`, encodePng(r2.W, r2.H, rgba(r2.work.slice()), 1));
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta));
console.log(r.W, r.H, 'lights', r.lights.length, JSON.stringify(r.lights.slice(0, 6)));
