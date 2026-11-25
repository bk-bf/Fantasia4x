import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const [, , TREE, PORT, MAP, OUT] = process.argv;
const TILE = 32;
const map = JSON.parse(gunzipSync(readFileSync(MAP)).toString('utf8'));
const scene = JSON.parse(readFileSync(MAP.replace('.map.json.gz', '.scene.json'), 'utf8'));
const { chromium } = createRequire(`${TREE}/package.json`)('playwright');
const hud = readFileSync(new URL('../../hud/ambient.js', import.meta.url), 'utf8');
const HUD = new Function(`${hud.replace("'use strict';", '')}; return HUD;`)();
const noon = HUD.ambient.compute(13, 'clear');
const W = scene.w * TILE,
  H = scene.h * TILE;

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
  if (!core.painted) return { ok: false };
  core.vignette = null;
  core.setLightSampler(() => [0, 0, 0]);
  core.setPointLights([]);
  core.setDynamicLight(true);
  core.setMapWeather('clear');
  core.setViewTileOffset(o.margin, o.margin);
  core.setAmbient(o.light, o.tint, o.tint);
  window.__core = core;
  const COVER = /grass_patch$|^savanna$|moss$/;
  const bare = (t) => ({ ...t, resources: Object.fromEntries(Object.entries(t.resources ?? {}).filter(([k]) => !COVER.test(k))) });
  window.__dress = (season, dressed, snowy) => {
    const ground = new GameGrid(),
      short = new GameGrid(),
      tall = new GameGrid();
    const rows = o.map.map((row) => row.map((t) => ({ ...(dressed === 'props' ? bare(t) : t), snow: snowy && t.type !== 'water' ? 78 : 0 })));
    for (const row of rows)
      for (const t of row) {
        Wd.applyTileToGrid(ground, t, mask);
        if (dressed) Wd.applyResourceToGrid(short, tall, t, mask, season, rows);
      }
    core.setGrid(ground);
    core.setResourceOverlayGrid(short);
    core.setResourceTallOverlayGrid(tall);
    core.setSnowGrid(snowy ? Wd.buildSnowOverlay(rows, mask) : null);
    core.setWind(0, 'E', season);
  };
  return { ok: true, hidden: mask.map((r) => r.map((v) => (v ? 1 : 0)).join('')) };
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
  for (let i = 0; i < 3; i++) {
    core.beginFrame();
    core.endFrame();
  }
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
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/__scene?painted=1&blend=1`, { waitUntil: 'load', timeout: 180000 });
  const info = await page.evaluate(setup, { map, W, H, margin: scene.margin, light: noon.light, tint: noon.tint });
  if (!info.ok) throw new Error('the painted tileset did not load');
  const LAYERS = [
    ['summer', 'summer', 'all', false],
    ['summer-ground', 'summer', '', false],
    ['summer-props', 'summer', 'props', false],
    ['winter', 'winter', 'all', true],
    ['winter-ground', 'winter', '', true],
    ['winter-props', 'winter', 'props', true]
  ];
  for (const [name, season, dressed, snowy] of LAYERS) {
    await page.evaluate(([s, d, n]) => window.__dress(s, d, n), [season, dressed, snowy]);
    console.log(name, 'settled after', await page.evaluate(settle), 'frames');
    save(await page.evaluate(frame, { W, H }), `${OUT}/${name}.rgba`);
  }
  writeFileSync(`${OUT}/meta.json`, JSON.stringify({ W, H, hidden: info.hidden, light: noon.light, tint: noon.tint }));
  console.log('rendered', W, H);
} catch (e) {
  console.log('failed', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
