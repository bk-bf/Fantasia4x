#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as zlib from 'node:zlib';
import { chromium } from 'playwright';

const FRAME_MS = 16;
const EPOCH_MS = 1_700_000_000_000;
const PAUSE_AT_MS = EPOCH_MS + 24 * 3600 * 1000;
const VIEWPORT = { width: 1280, height: 800 };
const SETTLE_FRAMES = 30;
const PAUSE_CHECK_FRAMES = 25;
const DAY_TICKS = 18_000;
const STEP_TIMEOUT_MS = 120_000;
const SAVE_ID = 'work-pins';
const RANDOM_SEED = 0x2545f491;
const DEFAULT_FIXTURE = 'tools/work-pins/fixtures/dev-save.json.gz';
const MAP = '[aria-label="World map"]';
const PANELS = 'aside.left-panel, aside.right-panel, .game-header, nav.bottom-nav';
const PAUSE_BUTTON = 'button.ctrl-btn:has-text("PAUSE"), button.ctrl-btn:has-text("RESUME")';
const SERVE_WITHOUT_GIT = { GIT_DIR: '/dev/null' };

const { values: opts } = parseArgs({
  options: {
    tree: { type: 'string', default: '.' },
    out: { type: 'string' },
    fixture: { type: 'string', default: DEFAULT_FIXTURE },
    ticks: { type: 'string', default: String(DAY_TICKS) },
    'ticks-per-frame': { type: 'string', default: '4' },
    bucket: { type: 'string', default: '600' }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => process.stdout.write(`[tint-ab] ${line}\n`);

function readFixture(path) {
  const raw = readFileSync(path);
  return path.endsWith('.gz') ? zlib.gunzipSync(raw) : raw;
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

async function seedSave(page, origin, body) {
  const route = `${origin}/__work-pins/**`;
  await page.route(route, (r) =>
    r.request().url().endsWith('/save.json')
      ? r.fulfill({ contentType: 'application/json', body })
      : r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>work pins</title>' })
  );
  await page.goto(`${origin}/__work-pins/seed`);
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

function withTimeout(promise, what) {
  let timer;
  const expire = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(`${what} timed out`)), STEP_TIMEOUT_MS);
  });
  return Promise.race([promise, expire]).finally(() => clearTimeout(timer));
}

async function frame(page, ticks) {
  await withTimeout(page.evaluate((n) => window.__f4xWorkPins.step(n), ticks), 'sim step');
  await page.evaluate(() => document.documentElement.getBoundingClientRect().height);
  await page.clock.runFor(FRAME_MS);
  await page.evaluate(() => document.documentElement.getBoundingClientRect().height);
}

async function isPaused(page) {
  return ((await page.locator(PAUSE_BUTTON).first().getAttribute('class')) ?? '').includes('is-paused');
}

async function setPaused(page, want) {
  const button = page.locator(PAUSE_BUTTON).first();
  if ((await isPaused(page)) !== want) await button.dispatchEvent('click');
  if ((await isPaused(page)) !== want) throw new Error(`pause button did not reach paused=${want}`);
}

async function lastChronicleLine(page) {
  return page.evaluate(() => {
    const list = document.querySelector('aside.right-panel .log-list');
    return (list?.firstElementChild?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
  });
}

function watchPanels(selector) {
  const w = (window.__tintAb = { panelStyleWrites: 0, tintMatrixWrites: 0 });
  const panels = [...document.querySelectorAll(selector)];
  const o = new MutationObserver((records) => {
    w.panelStyleWrites += records.length;
  });
  for (const p of panels) o.observe(p, { attributes: true, attributeFilter: ['style'] });
  const fm = document.querySelector('#ambient-tint feColorMatrix');
  if (fm)
    new MutationObserver((r) => {
      w.tintMatrixWrites += r.length;
    }).observe(fm, { attributes: true, attributeFilter: ['values'] });
  return { panels: panels.map((p) => p.className.split(' ')[0]), matrix: !!fm };
}

function takePanels() {
  const w = window.__tintAb;
  const taken = { ...w };
  w.panelStyleWrites = 0;
  w.tintMatrixWrites = 0;
  return taken;
}

async function metrics(cdp) {
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

const turnOf = async (page) => (await page.evaluate(() => window.__f4xWorkPins.stats())).worker?.turn ?? null;

async function main() {
  if (!opts.out) throw new Error('usage: tint-ab.mjs --out <file> [--tree <dir>] [--ticks <n>] [--ticks-per-frame <n>] [--bucket <ticks>]');
  const tree = resolve(opts.tree);
  const out = resolve(opts.out);
  const perFrame = Number(opts['ticks-per-frame']);
  const bucketFrames = Math.max(1, Math.round(Number(opts.bucket) / perFrame));
  const buckets = Math.ceil(Number(opts.ticks) / perFrame / bucketFrames);
  const body = readFixture(resolve(opts.fixture));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  mkdirSync(dirname(out), { recursive: true });
  log(`tree ${tree}, port ${port}, ${buckets} buckets of ${bucketFrames} frames x ${perFrame} ticks`);
  const server = await startServer(tree, port, `${out}.dev-server.log`);
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const errors = [];
  const pauses = [];
  const started = Date.now();
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await context.addInitScript(seedRandom, RANDOM_SEED);
    await context.addInitScript(hideAudio);
    await context.addInitScript(disableAutoPause);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.install({ time: EPOCH_MS });
    await seedSave(page, origin, body);
    await loadGame(page, origin);
    await sleep(3000);
    log('game ready');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.clock.pauseAt(PAUSE_AT_MS);
    await page.evaluate((seed) => window.__reseedRandom(seed), RANDOM_SEED);
    log(`watching ${JSON.stringify(await page.evaluate(watchPanels, PANELS))}`);
    await setPaused(page, false);
    for (let i = 0; i < SETTLE_FRAMES; i++) await frame(page, perFrame);
    await page.evaluate(takePanels);
    const rows = [];
    for (let b = 0; b < buckets; b++) {
      const turn0 = await turnOf(page);
      const m0 = await metrics(cdp);
      let resumed = 0;
      for (let i = 0; i < bucketFrames; i++) {
        if (i % PAUSE_CHECK_FRAMES === 0 && (await isPaused(page))) {
          const pause = { turn: await turnOf(page), chronicle: await lastChronicleLine(page) };
          pauses.push(pause);
          log(`paused at ${JSON.stringify(pause)}, resuming`);
          await setPaused(page, false);
          resumed++;
        }
        await frame(page, perFrame);
      }
      const m1 = await metrics(cdp);
      const turn1 = await turnOf(page);
      const p = await page.evaluate(takePanels);
      const row = {
        turns: [turn0, turn1],
        timeOfDay: +((((turn0 % DAY_TICKS) + DAY_TICKS) % DAY_TICKS) / DAY_TICKS).toFixed(3),
        panelStyleWrites: p.panelStyleWrites,
        tintMatrixWrites: p.tintMatrixWrites,
        recalcStyleCount: (m1.RecalcStyleCount ?? 0) - (m0.RecalcStyleCount ?? 0),
        resumed
      };
      rows.push(row);
      log(`bucket ${b + 1}/${buckets} ${JSON.stringify(row)}`);
    }
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    const result = {
      tree,
      ticksPerFrame: perFrame,
      totals: {
        ticks: rows.length ? rows.at(-1).turns[1] - rows[0].turns[0] : 0,
        panelStyleWrites: sum('panelStyleWrites'),
        tintMatrixWrites: sum('tintMatrixWrites'),
        recalcStyleCount: sum('recalcStyleCount')
      },
      rows,
      pauses,
      seconds: Math.round((Date.now() - started) / 1000),
      pageErrors: errors
    };
    writeFileSync(out, JSON.stringify(result, null, 1));
    log(`totals ${JSON.stringify(result.totals)}, ${pauses.length} pauses, in ${result.seconds} s`);
  } finally {
    await browser.close();
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
}

await main();
