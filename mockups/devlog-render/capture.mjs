import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';

const BASE = process.env.MOCKUPS || 'http://ubuntuserver:8794';
const DEV = process.argv[2];
const CROPS_ONLY = DEV === '--crops';
if (!DEV) throw new Error('usage: node capture.mjs <dev-worktree> | --crops  (git worktree add --detach /tmp/f4x-dev dev)');
if (!CROPS_ONLY) await import('./capture-glyph.mjs');
const OUT = new URL('src/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const HIDE = '#mock,#hud,#marks,#stamp,#busy,#wx,header,footer,[class*=comment],[id*=comment]{display:none!important}';

const browser = await chromium.launch();
const page = async (w, h) => browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const save = (name, buf) => { writeFileSync(OUT + name, buf); console.log('wrote src/' + name); };

async function hud(name, hour, weather) {
  const p = await page(1920, 1088);
  await p.goto(`${BASE}/fantasia4x-hud/?strip=0&hour=${hour}&weather=${weather}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.getElementById('busy').hidden && HUD.map, null, { timeout: 120000 });
  await p.addStyleTag({ content: HIDE });
  await p.waitForTimeout(600);
  const v = await p.evaluate(() => [HUD.view.k, HUD.view.left, HUD.view.top]);
  if (v.join() !== '1,0,0') throw new Error('hud view not 1:1: ' + v);
  save(name, await p.screenshot());
  await p.close();
}

async function trees(name, query) {
  const p = await page(1600, 1000);
  await p.goto(`${BASE}/fantasia4x-big-trees/?${query}&zoom=1&play=off&wind=still`, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: HIDE });
  await p.waitForTimeout(2500);
  const url = await p.evaluate(() => document.querySelector('.pane canvas').toDataURL('image/png'));
  save(name, Buffer.from(url.split(',')[1], 'base64'));
  await p.close();
}

async function ground(name, query) {
  const p = await page(2060, 1420);
  await p.goto(`${BASE}/fantasia4x-tree-ground/?show=new&zoom=1&strip=0&${query}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 });
  const url = await p.evaluate(() => document.querySelector('.pane.shown canvas').toDataURL('image/png'));
  save(name, Buffer.from(url.split(',')[1], 'base64'));
  await p.close();
}

if (!CROPS_ONLY) {
await hud('new-day.png', 13, 'clear');
await hud('new-dusk.png', 19, 'clear');
await hud('new-night.png', 23.5, 'clear');
await hud('new-summer.png', 13, 'summer_windy');
await trees('trees.png', 'show=trees');
await trees('forest.png', 'show=forest');
await trees('magic.png', 'show=magic&see=emberwood-elder');
await trees('magic-night.png', 'show=magic&see=emberwood-elder&light=night');
await ground('ground-autumn.png', 'season=autumn');
}

const IMG = new URL('img/', import.meta.url).pathname;
const MOCK = process.env.MOCKUP_DIR || process.env.HOME + '/mockups';
const CROPS = {
  'glyph-before': ['old-glyph.png', 300, 80, 640, 400],
  'grass-after': ['new-day.png', 540, 240, 640, 400],
  'map-day': ['new-day.png', 380, 160, 960, 600],
  'map-dusk': ['new-dusk.png', 380, 160, 960, 600],
  'map-night': ['new-night.png', 380, 160, 960, 600],
  'map-summer': ['new-summer.png', 380, 160, 960, 600],
  'forest': ['forest.png', 474, 194, 640, 400],
  'magic': ['magic.png', 236, 300, 640, 400],
};
const COPIES = {
  'trees-summer.webp': 'fantasia4x-tree-ground/img/trees-summer.webp',
  'trees-autumn.webp': 'fantasia4x-tree-ground/img/trees-autumn.webp',
};
mkdirSync(IMG, { recursive: true });
for (const [to, from] of Object.entries(COPIES)) { copyFileSync(`${MOCK}/${from}`, IMG + to); console.log('copied img/' + to); }
const cp = await page(100, 100);
for (const [name, [file, x, y, w, h, k = 1]] of Object.entries(CROPS)) {
  await cp.goto(`file://${OUT}${file}`);
  const url = await cp.evaluate(([x, y, w, h, k]) => {
    const im = document.querySelector('img'), c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = w * k; c.height = h * k; g.imageSmoothingEnabled = false; g.drawImage(im, x, y, w, h, 0, 0, w * k, h * k);
    return c.toDataURL('image/png');
  }, [x, y, w, h, k]);
  writeFileSync(IMG + name + '.png', Buffer.from(url.split(',')[1], 'base64'));
  console.log('cropped img/' + name + '.png');
}
await browser.close();
