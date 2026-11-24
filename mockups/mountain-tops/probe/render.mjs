import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const [, , TREE, PORT, WORLD, OUT, X0, Y0, TW, TH, QUERY = ''] = process.argv;
const MARGIN = 6;
const TILE = 32;
const x0 = +X0 - MARGIN,
  y0 = +Y0 - MARGIN,
  tw = +TW + 2 * MARGIN,
  th = +TH + 2 * MARGIN;
const { chromium } = createRequire(`${TREE}/package.json`)('playwright');
const world = JSON.parse(gunzipSync(readFileSync(WORLD)).toString('utf8'));
const hud = readFileSync(new URL('../../hud/ambient.js', import.meta.url), 'utf8');
const HUD = new Function(`${hud.replace("'use strict';", '')}; return HUD;`)();
const noon = HUD.ambient.compute(13, 'clear');

const map = [];
for (let ty = 0; ty < th; ty++) {
  const row = [];
  for (let tx = 0; tx < tw; tx++) row.push({ ...world[y0 + ty][x0 + tx], x: tx, y: ty, discovered: true });
  map.push(row);
}
const W = +TW * TILE,
  H = +TH * TILE;

const setup = async (o) => {
  performance.now = () => 3000;
  const { WebGLRendererCore } = await import('/src/lib/webgl/renderer-core.ts');
  const { GameGrid } = await import('/src/lib/webgl/game-grid.ts');
  const Wd = await import('/src/lib/webgl/fantasia-world.ts');
  const mask = Wd.computeHiddenMask(o.map);
  const canvas = document.createElement('canvas');
  canvas.width = o.W;
  canvas.height = o.H;
  document.body.appendChild(canvas);
  const core = new WebGLRendererCore({ canvas, tileWidth: 32, tileHeight: 32 });
  await core.waitForInitialization();
  core.resize(o.W, o.H);
  if (!core.painted || !core.painted.top) return { ok: false };
  core.vignette = null;
  const ground = new GameGrid(),
    short = new GameGrid(),
    tall = new GameGrid();
  for (const row of o.map)
    for (const t of row) {
      Wd.applyTileToGrid(ground, t, mask);
      Wd.applyResourceToGrid(short, tall, t, mask, 'summer', o.map);
    }
  core.setLightSampler(() => [0, 0, 0]);
  core.setGrid(ground);
  core.setResourceOverlayGrid(short);
  core.setResourceTallOverlayGrid(tall);
  core.setPointLights([]);
  core.setDynamicLight(true);
  core.setMapWeather('clear');
  core.setViewTileOffset(o.margin, o.margin);
  core.setAmbient(o.light, o.tint, o.tint);
  window.__core = core;
  return {
    ok: true,
    lift: core.painted.top.lift,
    hidden: mask.map((r) => r.map((v) => (v ? 1 : 0)).join(''))
  };
};

const settle = () => {
  const core = window.__core;
  for (let i = 0; i < 4000; i++) {
    core.beginFrame();
    core.endFrame();
    const p = core.peaks;
    if (!p || (!p.job && [...p.chunks.values()].every((c) => c.baked && !c.stale))) return i;
  }
  return -1;
};

const frame = (a) => {
  const core = window.__core,
    gl = core.getContext();
  if (a.shade !== undefined) {
    gl.activeTexture(gl.TEXTURE2);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([a.shade, a.shade, a.shade, 255]));
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    core.painted.top.texture = t;
    gl.activeTexture(gl.TEXTURE0);
  }
  core.beginFrame();
  core.endFrame();
  const px = new Uint8Array(a.W * a.H * 4);
  gl.readPixels(0, 0, a.W, a.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let s = '';
  for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
  return btoa(s);
};

const save = (b, file) => {
  const raw = Buffer.from(b, 'base64'),
    flip = Buffer.alloc(raw.length),
    row = W * 4;
  for (let y = 0; y < H; y++) raw.copy(flip, (H - 1 - y) * row, y * row, (y + 1) * row);
  writeFileSync(file, flip);
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio']
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/__scene?painted=1&blend=1${QUERY}`, { waitUntil: 'load', timeout: 180000 });
  const info = await page.evaluate(setup, { map, W, H, margin: MARGIN, light: noon.light, tint: noon.tint });
  if (!info.ok) throw new Error('the painted tileset or its rock top did not load');
  console.log('settled after', await page.evaluate(settle), 'frames');
  save(await page.evaluate(frame, { W, H }), `${OUT}/today.rgba`);
  save(await page.evaluate(frame, { W, H, shade: 0 }), `${OUT}/shade0.rgba`);
  save(await page.evaluate(frame, { W, H, shade: 6 }), `${OUT}/shade6.rgba`);
  const mass = map.map((row, ty) =>
    row
      .map((t, tx) => {
        const r = t.resources || {};
        return info.hidden[ty][tx] === '1' || (r.mountain_wall ?? 0) > 0 || (r.cliff_wall ?? 0) > 0 ? '1' : '0';
      })
      .join('')
  );
  writeFileSync(`${OUT}/meta.json`, JSON.stringify({ W, H, margin: MARGIN, lift: info.lift, mass }));
  console.log('rendered', W, H);
} catch (e) {
  console.log('failed', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
