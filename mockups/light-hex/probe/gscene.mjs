import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const [, , TREE, PORT, OUT, HOURS, TAG = 'g'] = process.argv;
const VIG = process.env.VIG === '1';
const { chromium } = createRequire(`${TREE}/package.json`)('playwright');
const meta = JSON.parse(readFileSync(`${OUT}/meta.json`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${TREE}/static/tilesets/painted/manifest.json`, 'utf8'));
const save = JSON.parse(gunzipSync(readFileSync(`${TREE}/tools/work-pins/fixtures/dev-save.json.gz`)).toString('utf8'));
const DRESS = /patch$|^savanna$|moss$|deposit$/;
const bySub = new Map(), anySub = new Map();
let mountain = null;
for (const row of save.world) for (const t of row) {
  const keys = Object.keys(t.resources || {});
  if (!mountain && keys.length === 1 && keys[0] === 'mountain_wall') mountain = t;
  if (!anySub.has(t.subType)) anySub.set(t.subType, t);
  if (keys.some((k) => !DRESS.test(k))) continue;
  if (!bySub.has(t.subType)) bySub.set(t.subType, []);
  bySub.get(t.subType).push(t);
}
const hash = (x, y) => { let n = (x * 374761393) ^ (y * 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const SUB = { tilled: 'dirt' };
const ALIAS = { p: { berry: 'berry_bush', flowers: 'wildflower_patch', mushroom: 'mushroom_patch', stump: 'tree_stump', madness: 'spore_of_madness', morel: 'witch_morel', bolete: 'nightshade_bolete', logs: 'fallen_logs', scrub: 'scrub_patch' }, r: { boulder: 'stone_outcrop', warren: 'goblin_warren', geode: 'star_geode', vent: 'mana_crystal_vent' }, t: { dead: 'dead_tree' } };
const resOf = (o) => [ALIAS[o.fam]?.[o.kind], o.kind, `${o.kind}_tree`, `${o.kind}_grove`, `${o.kind}_snag`, `${o.kind}_node`, `crop_${o.kind}`].find((r) => r && manifest.map.resource[r]);
const treeAt = new Map(), placed = {}, unplaced = {};
for (const o of meta.objs.filter((o) => 'tprc'.includes(o.fam))) {
  const r = resOf(o), key = `${o.fam}${o.kind}`;
  if (!r) { unplaced[key] = (unplaced[key] || 0) + 1; continue; }
  if (o.fam === 't' || !treeAt.has(`${o.tx},${o.ty}`)) treeAt.set(`${o.tx},${o.ty}`, r);
  placed[key] = (placed[key] || 0) + 1;
}
console.log('placed', JSON.stringify(placed)); console.log('unplaced', JSON.stringify(unplaced));
const map = [];
const missing = new Set();
for (let ty = 0; ty < meta.TH; ty++) {
  const row = [];
  for (let tx = 0; tx < meta.TW; tx++) {
    const i = ty * meta.TW + tx;
    const sub = SUB[meta.ground[i]] ?? meta.ground[i];
    let t;
    if (meta.wall[i] === meta.mountain) t = { ...mountain, resources: { mountain_wall: 4 } };
    else {
      const pool = bySub.get(sub);
      if (!pool) missing.add(sub);
      const src = pool ? pool[Math.floor(hash(tx, ty) * pool.length)] : { ...(anySub.get(sub) ?? bySub.get('grass')[0]), resources: {} };
      t = { ...src, subType: sub, resources: { ...(src.resources || {}) } };
      const res = treeAt.get(`${tx},${ty}`);
      if (res) t.resources = { [res]: 1 };
    }
    delete t.growth;
    row.push({ ...t, x: tx, y: ty, discovered: true });
  }
  map.push(row);
}
console.log('missing ground templates', [...missing]);
const dyn = meta.lights.filter((l) => l.flicker), rest = meta.lights.filter((l) => !l.flicker);
const lights = [...dyn, ...rest].map((l) => ({ x: 0, y: 0, color: l.col, radius: 0, intensity: 1, flicker: !!l.flicker, art: { x: l.x, y: l.y, rad: l.rad, night: !!l.night } }));
const hours = HOURS.split(',').map(Number);
const { layerOps } = await import('./ambient.mjs');
const setup = async (o) => {
  performance.now = () => 3000;
  const { WebGLRendererCore } = await import('/src/lib/webgl/renderer-core.ts');
  const { GameGrid } = await import('/src/lib/webgl/game-grid.ts');
  const Wd = await import('/src/lib/webgl/fantasia-world.ts');
  const mask = Wd.computeHiddenMask(o.map);
  const canvas = document.createElement('canvas'); canvas.width = o.W; canvas.height = o.H; document.body.appendChild(canvas);
  const core = new WebGLRendererCore({ canvas, tileWidth: 32, tileHeight: 32 });
  await core.waitForInitialization(); core.resize(o.W, o.H);
  if (!core.painted || !core.lightPass || !core.groundBlend) return 'painted, light pass or ground blend missing';
  if (!o.vig) core.vignette = null;
  const ground = new GameGrid(), short = new GameGrid(), tall = new GameGrid();
  for (const row of o.map) for (const t of row) { Wd.applyTileToGrid(ground, t, mask); Wd.applyResourceToGrid(short, tall, t, mask, o.season, o.map); }
  core.setLightSampler(() => [0, 0, 0]); core.setGrid(ground);
  core.setResourceOverlayGrid(short); core.setResourceTallOverlayGrid(tall);
  core.setPointLights(o.lights); core.setDynamicLight(true); core.setMapWeather('clear');
  core.setViewTileOffset(0, 0);
  window.__core = core; window.__grids = { short, tall };
  return 'ok';
};
const frame = (a) => {
  const core = window.__core, gl = core.getContext();
  if (a.bare !== undefined) { core.setResourceOverlayGrid(a.bare ? null : window.__grids.short); core.setResourceTallOverlayGrid(a.bare ? null : window.__grids.tall); }
  core.setAmbient(a.light, a.tint, a.tint);
  core.beginFrame(); core.endFrame();
  const px = new Uint8Array(a.W * a.H * 4);
  gl.readPixels(0, 0, a.W, a.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let s = ''; for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
  return btoa(s);
};
const W = meta.W, H = meta.H;
const save1 = (b64, file) => {
  const raw = Buffer.from(b64, 'base64'), flip = Buffer.alloc(raw.length), row = W * 4;
  for (let y = 0; y < H; y++) raw.copy(flip, (H - 1 - y) * row, y * row, (y + 1) * row);
  writeFileSync(file, flip);
};
mkdirSync(`${OUT}/raw`, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (/painted|warn|error/i.test(m.text()) && !/SvelteKitError|Not found/.test(m.text())) console.log('console', m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${PORT}/__scene?painted=1&blend=1`, { waitUntil: 'load', timeout: 180000 });
  const ok = await page.evaluate(setup, { map, lights, W, H, vig: VIG, season: process.env.SEASON || 'autumn' });
  if (ok !== 'ok') throw new Error(ok);
  const noon = layerOps(13);
  save1(await page.evaluate(frame, { ...noon, W, H, bare: true }), `${OUT}/raw/${TAG}-bare-13.00.rgba`);
  let first = true;
  for (const h of hours) {
    const a = layerOps(h);
    save1(await page.evaluate(frame, { ...a, W, H, ...(first ? { bare: false } : {}) }), `${OUT}/raw/${TAG}-${h.toFixed(2)}.rgba`);
    first = false;
  }
  console.log('rendered', hours.length);
} catch (e) { console.log('failed', e.message); process.exitCode = 1; } finally { await browser.close(); }
