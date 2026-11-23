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
const treeAt = new Map(meta.trees.map((t) => [`${t.tx},${t.ty}`, t.kind]));
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
      const kind = treeAt.get(`${tx},${ty}`);
      const res = kind && `${kind}_tree`;
      if (res && manifest.map.resource[res]) t.resources = { [res]: 1 };
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
  for (const h of hours) {
    const a = layerOps(h);
    for (const on of [true, false]) {
      await page.evaluate((v) => window.__core.setVignette(v), on);
      save1(await page.evaluate(frame, { ...a, W, H }), `${OUT}/raw/vig-${on ? 'on' : 'off'}-${h.toFixed(2)}.rgba`);
    }
  }
  const persisted = [];
  persisted.push(await page.evaluate(async () => { const p = await import('/src/lib/stores/uiPrefs.ts'); const { get } = await import('/node_modules/.vite/deps/svelte_store.js').catch(() => import('svelte/store')); let v; p.vignetteOn.subscribe((x) => (v = x))(); p.vignetteOn.set(false); return { before: v, stored: localStorage.getItem('fx.gfx.vignette') }; }));
  await page.reload({ waitUntil: 'load', timeout: 180000 });
  persisted.push(await page.evaluate(async () => { const p = await import('/src/lib/stores/uiPrefs.ts'); let v; p.vignetteOn.subscribe((x) => (v = x))(); return { afterReload: v, stored: localStorage.getItem('fx.gfx.vignette') }; }));
  console.log('persist', JSON.stringify(persisted));
  console.log('rendered', hours.length);
} catch (e) { console.log('failed', e.message); process.exitCode = 1; } finally { await browser.close(); }
