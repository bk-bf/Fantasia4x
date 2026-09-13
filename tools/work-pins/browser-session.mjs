import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import * as zlib from 'node:zlib';
import { chromium } from 'playwright';

const FRAME_MS = 16;
export const DEFAULT_FIXTURE = 'tools/work-pins/fixtures/dev-save.json.gz';
export const MAP = '[aria-label="World map"]';
const EPOCH_MS = 1_700_000_000_000;
const PAUSE_AT_MS = EPOCH_MS + 24 * 3600 * 1000;
const VIEWPORT = { width: 1280, height: 800 };
const STEP_TIMEOUT_MS = 120_000;
const NETWORK_QUIET_MS = 3000;
const SAVE_ID = 'work-pins';
const RANDOM_SEED = 0x2545f491;
const PAUSE_BUTTON = 'button.ctrl-btn:has-text("PAUSE"), button.ctrl-btn:has-text("RESUME")';
const PANELS = 'aside.left-panel, aside.right-panel, .game-header, nav.bottom-nav';
const CHRONICLE = 'aside.right-panel .log-list';
const SERVE_WITHOUT_GIT = { GIT_DIR: '/dev/null' };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const logger = (prefix) => (line) => process.stdout.write(`[${prefix}] ${line}\n`);

function readFixture(path) {
  const raw = readFileSync(path);
  if (path.endsWith('.gz')) return zlib.gunzipSync(raw);
  if (path.endsWith('.br')) return zlib.brotliDecompressSync(raw);
  if (path.endsWith('.zst')) return zlib.zstdDecompressSync(raw);
  return raw;
}

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

async function startServer(tree, port, logFile) {
  const out = createWriteStream(logFile);
  const child = spawn(join(tree, 'dev.sh'), ['--browser', '--port', String(port)], {
    cwd: tree,
    detached: true,
    env: { ...process.env, ...SERVE_WITHOUT_GIT, VITE_WORK_PINS: '1', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  for (let i = 0; i < 600; i++) {
    if (child.exitCode !== null) throw new Error(`dev server exited ${child.exitCode}, see ${logFile}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return child;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`dev server never answered on ${port}, see ${logFile}`);
}

function stopServer(server) {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}

function hideAudio() {
  delete window.Audio;
  delete window.AudioContext;
  delete window.webkitAudioContext;
}

function disableAutoPause() {
  localStorage.setItem('fx.gameplay.autoPauseOnThreat', 'false');
  localStorage.setItem('fx.gameplay.autoPauseOnDeath', 'false');
}

function seedRandom(seed) {
  let s = seed;
  window.__reseedRandom = (next) => {
    s = next;
  };
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedSave(page, origin, body, log) {
  const route = `${origin}/__work-pins/**`;
  await page.route(route, (r) =>
    r.request().url().endsWith('/save.json')
      ? r.fulfill({ contentType: 'application/json', body })
      : r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>work pins</title>' })
  );
  await page.goto(`${origin}/__work-pins/seed`);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'no WebGL2';
  });
  log(`WebGL2 renderer: ${renderer}`);
  await page.evaluate(async (id) => {
    const snap = await (await fetch('/__work-pins/save.json')).json();
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
}

function trackNetwork(page) {
  let inflight = 0;
  let lastChange = Date.now();
  const bump = (d) => {
    inflight += d;
    lastChange = Date.now();
  };
  page.on('request', () => bump(1));
  page.on('requestfinished', () => bump(-1));
  page.on('requestfailed', () => bump(-1));
  return async (quietMs) => {
    while (inflight > 0 || Date.now() - lastChange < quietMs) await sleep(250);
  };
}

async function loadGame(page, origin) {
  await page.goto(`${origin}/`);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button.menu-btn')].some(
        (b) => b.textContent.trim() === 'Load Game' && !b.disabled
      ),
    null,
    { timeout: 300_000, polling: 500 }
  );
  await page.getByRole('button', { name: 'Load Game', exact: true }).dispatchEvent('click');
  await page.locator('.row button.main').first().dispatchEvent('click', {}, { timeout: 60_000 });
  await page.waitForFunction(
    (map) =>
      !!document.querySelector(map) &&
      !document.querySelector('.loading-screen') &&
      !!document.querySelector('button.ctrl-btn'),
    MAP,
    { timeout: 900_000, polling: 500 }
  );
}

export async function openGame({ tree, fixture, serverLog, args = [], log, clock = true }) {
  const body = readFixture(resolve(fixture));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  log(`tree ${tree}, fixture ${fixture} (${body.length} bytes), port ${port}`);
  const server = await startServer(tree, port, serverLog);
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', ...args] });
  const close = async () => {
    await browser.close();
    stopServer(server);
  };
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await context.addInitScript(seedRandom, RANDOM_SEED);
    await context.addInitScript(hideAudio);
    await context.addInitScript(disableAutoPause);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const networkQuiet = trackNetwork(page);
    if (clock) await page.clock.install({ time: EPOCH_MS });
    await seedSave(page, origin, body, log);
    await loadGame(page, origin);
    await networkQuiet(NETWORK_QUIET_MS);
    log('game ready');
    return { page, cdp: await context.newCDPSession(page), errors, close };
  } catch (e) {
    await close();
    throw e;
  }
}

export async function freezeClock(page) {
  await page.clock.pauseAt(PAUSE_AT_MS);
  await page.evaluate((seed) => window.__reseedRandom(seed), RANDOM_SEED);
}

function withTimeout(promise, what) {
  let timer;
  const expire = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(`${what} timed out`)), STEP_TIMEOUT_MS);
  });
  return Promise.race([promise, expire]).finally(() => clearTimeout(timer));
}

async function flushLayout(page) {
  await page.evaluate(() => document.documentElement.getBoundingClientRect().height);
}

export async function frame(page, ticks = 1) {
  await withTimeout(page.evaluate((n) => window.__f4xWorkPins.step(n), ticks), 'sim step');
  await flushLayout(page);
  await page.clock.runFor(FRAME_MS);
  await flushLayout(page);
}

export async function frames(page, n, ticks = 1) {
  for (let i = 0; i < n; i++) await frame(page, ticks);
}

export async function focusMap(page) {
  await page.evaluate((map) => document.querySelector(map).focus(), MAP);
}

export async function isPaused(page) {
  return ((await page.locator(PAUSE_BUTTON).first().getAttribute('class')) ?? '').includes('is-paused');
}

export async function setPaused(page, want) {
  if ((await isPaused(page)) !== want) await page.locator(PAUSE_BUTTON).first().dispatchEvent('click');
  await focusMap(page);
  if ((await isPaused(page)) !== want) throw new Error(`pause button did not reach paused=${want}`);
}

export async function turnOf(page) {
  return (await page.evaluate(() => window.__f4xWorkPins.stats())).worker?.turn ?? null;
}

export async function assertRunning(page, what) {
  if (!(await isPaused(page))) return;
  const chronicle = await page.evaluate((list) => {
    const first = document.querySelector(list)?.firstElementChild;
    return (first?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
  }, CHRONICLE);
  throw new Error(`the game paused itself during ${what} at turn ${await turnOf(page)}: ${chronicle}`);
}

export async function metrics(cdp, { collectGarbage = false } = {}) {
  if (collectGarbage) await cdp.send('HeapProfiler.collectGarbage');
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

function watchPanels(selector) {
  const w = (window.__f4xPanelWrites = { panelStyleWrites: 0, tintMatrixWrites: 0 });
  const panels = [...document.querySelectorAll(selector)];
  const o = new MutationObserver((records) => {
    w.panelStyleWrites += records.length;
  });
  for (const p of panels) o.observe(p, { attributes: true, attributeFilter: ['style'] });
  const matrix = document.querySelector('#ambient-tint feColorMatrix');
  if (matrix)
    new MutationObserver((records) => {
      w.tintMatrixWrites += records.length;
    }).observe(matrix, { attributes: true, attributeFilter: ['values'] });
  return { panels: panels.map((p) => p.className.split(' ')[0]), matrix: !!matrix };
}

function takePanels() {
  const w = window.__f4xPanelWrites;
  const taken = { ...w };
  w.panelStyleWrites = 0;
  w.tintMatrixWrites = 0;
  return taken;
}

export const watchPanelWrites = (page) => page.evaluate(watchPanels, PANELS);
export const takePanelWrites = (page) => page.evaluate(takePanels);
