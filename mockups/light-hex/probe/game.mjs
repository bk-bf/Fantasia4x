import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const [, , TREE, PORT, OUT, HOURS, VIG = '0'] = process.argv;
const { chromium } = createRequire(`${TREE}/package.json`)('playwright');
const meta = JSON.parse(readFileSync(`${OUT}/meta.json`, 'utf8'));
const X0 = 544, Y0 = 224, CW = 832, CH = 544;
const dyn = meta.lights.filter((l) => l.flicker), rest = meta.lights.filter((l) => !l.flicker);
const lights = [...dyn, ...rest].map((l) => ({ x: 0, y: 0, color: l.col, radius: 0, intensity: 1, flicker: !!l.flicker, art: { x: l.x - X0, y: l.y - Y0, rad: l.rad, night: !!l.night } }));
const hours = HOURS.split(',').map(Number);
const { layerOps } = await import('./ambient.mjs');
const amb = hours.map(layerOps);
const opts = { keep: !!process.env.KEEP, amb, X0, Y0, CW, CH, lights, hours, vig: VIG === '1', albedo: readFileSync(`${OUT}/albedo.png`).toString('base64'), emit: readFileSync(`${OUT}/emit.png`).toString('base64'), W: meta.W, H: meta.H };
const scene = async (o) => {
  performance.now = () => 3000; window.KEEP = o.keep;
  const { WebGLRendererCore } = await import('/src/lib/webgl/renderer-core.ts');
  const { GameGrid } = await import('/src/lib/webgl/game-grid.ts');
    const img = async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); return i; };
  const canvas = document.createElement('canvas'); canvas.width = o.CW; canvas.height = o.CH; document.body.appendChild(canvas);
  const core = new WebGLRendererCore({ canvas, tileWidth: 32, tileHeight: 32 });
  await core.waitForInitialization(); core.resize(o.CW, o.CH);
  const gl = core.getContext();
  const tex = (im) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST); for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE); gl.bindTexture(gl.TEXTURE_2D, null); return t; };
  const alb = await img(o.albedo), em = await img(o.emit);
  const painted = core.painted;
  if (!painted || !core.lightPass) return { error: 'painted or light pass missing' };
  gl.activeTexture(gl.TEXTURE0 + 9);
  const tA = tex(alb), tE = tex(em);
  gl.activeTexture(gl.TEXTURE0);
  if (!window.KEEP) core.painted = { ...painted, tileset: { ...painted.tileset, tile: 32, atlasW: o.W, atlasH: o.H }, texture: tA, light: tE };
  if (!o.vig) core.vignette = null;
  core.groundBlend = null;
  const grid = new GameGrid();
  for (let ty = 0; ty < o.CH / 32; ty++) for (let tx = 0; tx < o.CW / 32; tx++) {
    const ax = o.X0 + tx * 32, ay = o.Y0 + ty * 32;
    grid.setTile(tx, ty, { char: ' ', foreground: { r: 0, g: 0, b: 0 }, background: { r: 0, g: 0, b: 0 }, position: { x: tx, y: ty }, painted: { u1: ax / o.W, v1: ay / o.H, u2: (ax + 32) / o.W, v2: (ay + 32) / o.H, ox: 0, oy: 0, w: 1, h: 1 } });
  }
  core.setLightSampler(() => [0, 0, 0]); core.setGrid(grid);
  core.setPointLights(o.lights); core.setDynamicLight(true); core.setMapWeather('clear');
  core.setViewTileOffset(0, 0);
  const out = [];
  const px = new Uint8Array(o.CW * o.CH * 4);
  for (const h of o.hours) {
    const { light, tint } = o.amb[o.hours.indexOf(h)];
    core.setAmbient(light, tint, tint);
    core.beginFrame(); core.endFrame();
    gl.readPixels(0, 0, o.CW, o.CH, gl.RGBA, gl.UNSIGNED_BYTE, px);


    let s = ''; const CH = 0x8000; for (let i = 0; i < px.length; i += CH) s += String.fromCharCode.apply(null, px.subarray(i, i + CH));
    out.push({ h, light, tint, px: btoa(s) });
  }
  return { out };
};
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (/painted|warn|error/i.test(m.text())) console.log('console', m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${PORT}/__scene?painted=1`, { waitUntil: 'load', timeout: 180000 });
  const res = await page.evaluate(scene, opts);
  if (res.error) throw new Error(res.error);
  for (const r of res.out) {
    const raw = Buffer.from(r.px, 'base64'), flip = Buffer.alloc(raw.length), row = CW * 4;
    for (let y = 0; y < CH; y++) raw.copy(flip, (CH - 1 - y) * row, y * row, (y + 1) * row);
    writeFileSync(`${OUT}/raw/game-${r.h.toFixed(2)}.rgba`, flip);
  }
  writeFileSync(`${OUT}/game-hours.json`, JSON.stringify(res.out.map(({ h, light, tint }) => ({ h, light, tint }))));
  console.log('rendered', res.out.length);
} catch (e) { console.log('failed', e.message); process.exitCode = 1; } finally { await browser.close(); }
