import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [REPO, CAPTURE_DIR] = process.argv.slice(2);
const DRAWS = 40;
const REPS = 3;
const ARGS = ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist'];
const SIZES = [
  [1440, 814, [2.88, 16, 32, 64]],
  [2880, 1628, [5.76, 32, 64]]
];
const HAND = ['today', 'sprites', 'blend', 'full'];
const PIXI = ['today', 'sprites', 'spritesStatic', 'spritesMesh', 'blend', 'full', 'fullMesh'];
const HAND_SOURCE = readFileSync(join(HERE, 'hand-written.js'), 'utf8');
const CAPTURING_HAND_SOURCE = HAND_SOURCE.replace('{ W, H, ts, draws }', '{ W, H, ts, draws, capture }').replace(
  'out[name] = +((performance.now() - t0) / draws).toFixed(2);',
  'out[name] = +((performance.now() - t0) / draws).toFixed(2); if (name === capture) out.image = cv.toDataURL("image/png");'
);
const PIXI_FILES = [join(HERE, 'node_modules/pixi.js/dist/pixi.min.js'), join(HERE, 'pixi-scenes.js')];

for (let i = 0; loadavg()[0] > 2 && i < 60; i++) await new Promise((done) => setTimeout(done, 10000));
console.log('[synth] starting at load ' + loadavg()[0].toFixed(2));
const { chromium } = await import(`${REPO}/node_modules/playwright/index.mjs`);
const browser = await chromium.launch({ headless: true, args: ARGS });
const BROWSER_VERSION = browser.version();
const median = (xs) => [...xs].sort((a, b) => a - b)[(xs.length - 1) >> 1];

async function inPage(scripts, call, params) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()));
  await page.goto('about:blank');
  for (const script of scripts) await page.addScriptTag(script);
  const out = await page.evaluate(([name, p]) => window[name](p), [call, params]);
  await page.close();
  if (errors.length) out.errors = errors.slice(0, 3);
  return out;
}
const hand = (params) => inPage([{ content: params.capture ? CAPTURING_HAND_SOURCE : HAND_SOURCE }], 'handWritten', params);
const pixi = (params) => inPage(PIXI_FILES.map((path) => ({ path })), 'pixiScenes', params);

function saveImage(name, out) {
  if (!out.image) return;
  writeFileSync(join(CAPTURE_DIR, `${name}.png`), Buffer.from(out.image.split(',')[1], 'base64'));
  delete out.image;
}

const rows = [];
try {
  if (CAPTURE_DIR) {
    mkdirSync(CAPTURE_DIR, { recursive: true });
    for (const scene of HAND) saveImage(`hand-${scene}`, await hand({ W: 1440, H: 814, ts: 32, draws: 2, capture: scene }));
    for (const scene of PIXI) saveImage(`pixi-${scene}`, await pixi({ W: 1440, H: 814, ts: 32, draws: 2, capture: scene }));
    console.log('[synth] captures in ' + CAPTURE_DIR);
  } else {
    for (const [W, H, tiles] of SIZES)
      for (const ts of tiles) {
        const handReps = [];
        const pixiReps = [];
        for (let i = 0; i < REPS; i++) {
          handReps.push(await hand({ W, H, ts, draws: DRAWS }));
          pixiReps.push(await pixi({ W, H, ts, draws: DRAWS }));
        }
        const summary = (reps, scenes) => ({
          median: Object.fromEntries(scenes.map((s) => [s, median(reps.map((r) => r[s]))])),
          reps: Object.fromEntries(scenes.map((s) => [s, reps.map((r) => r[s])])),
          renderer: reps[0].renderer,
          err: reps.map((r) => r.err),
          errors: reps.flatMap((r) => r.errors ?? [])
        });
        const row = {
          W,
          H,
          ts,
          load: +loadavg()[0].toFixed(2),
          tiles: handReps[0].tiles,
          spriteCount: handReps[0].spriteCount,
          pixiTiles: pixiReps[0].tiles,
          pixiSpriteCount: pixiReps[0].spriteCount,
          pixiVersion: pixiReps[0].pixi,
          hand: summary(handReps, HAND),
          pixi: summary(pixiReps, PIXI)
        };
        rows.push(row);
        console.log('[synth] ' + JSON.stringify(row));
      }
  }
} finally {
  await browser.close();
}
if (!CAPTURE_DIR) console.log('SYNTH ' + JSON.stringify({ args: ARGS, draws: DRAWS, reps: REPS, browser: BROWSER_VERSION, rows }));
