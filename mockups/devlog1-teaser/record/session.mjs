import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import * as zlib from 'node:zlib';

export const TREE = process.env.F4X_TREE || '/tmp/f4x-look';
export const OUT = process.env.F4X_OUT || '/tmp/f4x-devlog1';
const { chromium } = await import(join(TREE, 'node_modules/playwright/index.mjs'));
export { chromium };

const EPOCH_MS = 1_700_000_000_000;
const FIXTURE = join(TREE, 'tools/work-pins/fixtures/dev-save.json.gz');
const SAVE_ID = 'devlog';
const MAP = '[aria-label="World map"]';
export const TICKS_PER_DAY = 18000;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (s) => process.stdout.write(`[rec ${new Date().toISOString().slice(11, 19)}] ${s}\n`);

export const HIDE_HUD = `
aside.left-panel, aside.right-panel, .game-header, nav.bottom-nav, .bottom-bar, .toast, .toasts,
[class*="toast"], [class*="tooltip"], [class*="notification"], .log-list, .minimap, [class*="minimap"],
[class*="hover-card"], [class*="selected-entity"], [class*="entity-card"], [class*="alert"] { display: none !important; }
`;

function freePort() {
  return new Promise((done, fail) => {
    const s = createServer();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => done(port));
    });
  });
}

let server = null;
let origin = null;

export async function startServer() {
  if (origin) return origin;
  const port = Number(process.env.F4X_PORT) || (await freePort());
  origin = `http://127.0.0.1:${port}`;
  try {
    if ((await fetch(origin + '/')).ok) return origin;
  } catch {}
  mkdirSync(join(OUT, 'record/logs'), { recursive: true });
  const out = createWriteStream(join(OUT, 'record/logs/server.log'));
  server = spawn(join(TREE, 'dev.sh'), ['--browser', '--port', String(port)], {
    cwd: TREE,
    detached: true,
    env: { ...process.env, GIT_DIR: '/dev/null', VITE_WORK_PINS: '1', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.pipe(out);
  server.stderr.pipe(out);
  for (let i = 0; i < 600; i++) {
    try {
      if ((await fetch(origin + '/')).ok) return origin;
    } catch {
      await sleep(500);
    }
  }
  throw new Error('dev server never answered');
}

export function stopServer() {
  if (!server) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
  server = null;
}

export function readSave() {
  return JSON.parse(zlib.gunzipSync(readFileSync(FIXTURE)));
}

function hideAudio() {
  delete window.Audio;
  delete window.AudioContext;
  delete window.webkitAudioContext;
}

function prefs(look) {
  localStorage.setItem('fx.gameplay.autoPauseOnThreat', 'false');
  localStorage.setItem('fx.gameplay.autoPauseOnDeath', 'false');
  localStorage.setItem('fantasia4x-painted-tiles', look.painted ? '1' : '0');
  localStorage.setItem('fantasia4x-ground-blend', look.blend ? '1' : '0');
}

function seedRandom(seed) {
  let s = seed;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setCamera(c) {
  sessionStorage.setItem('fantasia4x-camera', JSON.stringify(c));
}

export async function openGame({ save, width = 1920, height = 1080, camera, hud = false, look = { painted: true, blend: true } }) {
  const base = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--mute-audio', '--ignore-gpu-blocklist', ...(process.env.F4X_GL === 'mesa' ? ['--use-gl=angle', '--use-angle=gl-egl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])]
  });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addInitScript(seedRandom, 0x2545f491);
  await context.addInitScript(hideAudio);
  await context.addInitScript(prefs, look);
  if (camera) await context.addInitScript(setCamera, camera);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('crash', () => log('PAGE CRASHED'));
  await page.clock.install({ time: EPOCH_MS });
  const body = JSON.stringify(save);
  const route = `${base}/__devlog/**`;
  await page.route(route, (r) =>
    r.request().url().endsWith('/save.json')
      ? r.fulfill({ contentType: 'application/json', body })
      : r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>devlog</title>' })
  );
  await page.goto(`${base}/__devlog/seed`);
  await page.evaluate(async (id) => {
    const snap = await (await fetch('/__devlog/save.json')).json();
    const db = await new Promise((done, fail) => {
      const req = indexedDB.open('fantasia4x', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('saves');
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
    await new Promise((done, fail) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(snap.dynamic, `save:${id}`);
      tx.objectStore('saves').put(snap.world, `world:${id}`);
      tx.oncomplete = done;
      tx.onerror = () => fail(tx.error);
    });
    db.close();
  }, SAVE_ID);
  await page.unroute(route);
  await page.goto(`${base}/?painted=${look.painted ? 1 : 0}&blend=${look.blend ? 1 : 0}`);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(
        (b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === 'Load Game' && !b.disabled
      ),
    null,
    { timeout: 900_000, polling: 500 }
  );
  await page.getByRole('button', { name: 'Load Game', exact: true }).dispatchEvent('click');
  await page.locator('.row button.main').first().dispatchEvent('click', {}, { timeout: 120_000 });
  await page.waitForFunction(
    (map) =>
      !!document.querySelector(map) &&
      !document.querySelector('.loading-screen') &&
      !!document.querySelector('button.ctrl-btn'),
    MAP,
    { timeout: 1_800_000, polling: 500 }
  );
  if (!hud) await page.addStyleTag({ content: HIDE_HUD });
  await sleep(3000);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  log('game ready');
  const close = async () => browser.close();
  return { page, browser, context, errors, close };
}

export async function step(page, ticks = 1, ms = 1000 / 60) {
  if (ticks > 0) await page.evaluate((n) => window.__f4xWorkPins.step(n), ticks);
  await page.evaluate(() => document.documentElement.getBoundingClientRect().height);
  await page.clock.runFor(ms);
}

const cdps = new WeakMap();
export async function grab(page, file) {
  if (!cdps.has(page)) cdps.set(page, await page.context().newCDPSession(page));
  const { data } = await cdps.get(page).send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(file, Buffer.from(data, 'base64'));
}

export async function setPaused(page, want) {
  const btn = 'button.ctrl-btn:has-text("PAUSE"), button.ctrl-btn:has-text("RESUME")';
  const isP = async () => ((await page.locator(btn).first().getAttribute('class')) ?? '').includes('is-paused');
  if ((await isP()) !== want) await page.locator(btn).first().dispatchEvent('click');
}
