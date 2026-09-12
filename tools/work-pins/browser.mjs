#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as zlib from 'node:zlib';
import { chromium } from 'playwright';

import { functionPins } from './functions.mjs';

const FRAME_MS = 16;
const EPOCH_MS = 1_700_000_000_000;
const PAUSE_AT_MS = EPOCH_MS + 24 * 3600 * 1000;
const VIEWPORT = { width: 1280, height: 800 };
const ZOOM_STEPS = 7;
const FRAMES_PER_ZOOM = 10;
const SETTLE_FRAMES = 300;
const TICKS_PER_FRAME = 1;
const STEP_TIMEOUT_MS = 120_000;
const SAVE_ID = 'work-pins';
const DEFAULT_FIXTURE = 'tools/work-pins/fixtures/dev-save.json.gz';
const PHASES = [
  { name: 'run', paused: false, pan: false },
  { name: 'pan', paused: false, pan: true },
  { name: 'paused-pan', paused: true, pan: true }
];
const PAN_KEYS = ['ArrowRight', 'ArrowLeft'];
const COUNTED_METRICS = ['LayoutCount'];
const OBSERVED_METRICS = ['RecalcStyleCount'];
const HELD_METRICS = ['Nodes', 'JSEventListeners'];
const MAP = '[aria-label="World map"]';

const { values: opts } = parseArgs({
  options: {
    tree: { type: 'string', default: '.' },
    out: { type: 'string' },
    fixture: { type: 'string', default: process.env.WORK_PINS_FIXTURE ?? DEFAULT_FIXTURE },
    frames: { type: 'string', default: '240' }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => process.stdout.write(`[browser-pins] ${line}\n`);

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
    env: { ...process.env, VITE_WORK_PINS: '1', CI: 'true' },
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

function seedRandom() {
  let s = 0x2545f491;
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
  const loadGame = page.getByRole('button', { name: 'Load Game', exact: true });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button.menu-btn')].some(
        (b) => b.textContent.trim() === 'Load Game' && !b.disabled
      ),
    null,
    { timeout: 300_000, polling: 500 }
  );
  await loadGame.dispatchEvent('click');
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

function workerChannel(cdp) {
  const sessions = new Map();
  const pending = new Map();
  let nextId = 0;
  cdp.on('Target.attachedToTarget', (p) => sessions.set(p.sessionId, p.targetInfo.url));
  cdp.on('Target.detachedFromTarget', (p) => sessions.delete(p.sessionId));
  cdp.on('Target.receivedMessageFromTarget', (p) => {
    const m = JSON.parse(p.message);
    const waiter = m.id !== undefined && pending.get(m.id);
    if (!waiter) return;
    pending.delete(m.id);
    if (m.error) waiter.fail(new Error(`${waiter.method}: ${m.error.message}`));
    else waiter.done(m.result);
  });
  const send = (sessionId, method, params = {}) =>
    new Promise((done, fail) => {
      const id = ++nextId;
      pending.set(id, { done, fail, method });
      cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params })
        })
        .catch(fail);
    });
  const find = async (pattern) => {
    for (let i = 0; i < 100; i++) {
      for (const [id, url] of sessions) if (pattern.test(url)) return id;
      await sleep(100);
    }
    throw new Error(`no worker matching ${pattern}; attached: ${[...sessions.values()].join(', ')}`);
  };
  return { send, find };
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

async function frame(page) {
  await withTimeout(
    page.evaluate((ticks) => window.__f4xWorkPins.step(ticks), TICKS_PER_FRAME),
    'sim step'
  );
  await flushLayout(page);
  await page.clock.runFor(FRAME_MS);
  await flushLayout(page);
}

async function frames(page, n) {
  for (let i = 0; i < n; i++) await frame(page);
}

async function centreOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function focusMap(page) {
  await page.evaluate((map) => document.querySelector(map).focus(), MAP);
}

async function setPaused(page, want) {
  const button = page
    .locator('button.ctrl-btn:has-text("PAUSE"), button.ctrl-btn:has-text("RESUME")')
    .first();
  const paused = async () => (await button.getAttribute('class')).includes('is-paused');
  if ((await paused()) !== want) await button.dispatchEvent('click');
  await focusMap(page);
  if ((await paused()) !== want) throw new Error(`pause button did not reach paused=${want}`);
}

async function metrics(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics: list } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

async function sample(page, cdp, workers, sim) {
  const page_ = (await cdp.send('Profiler.takePreciseCoverage')).result;
  const worker_ = (await workers.send(sim, 'Profiler.takePreciseCoverage')).result;
  const stats = await page.evaluate(() => window.__f4xWorkPins.stats());
  return { page: page_, worker: worker_, stats, metrics: await metrics(cdp) };
}

async function runPhase(page, phase, n) {
  await setPaused(page, phase.paused);
  for (let i = 0; i < n; i++) {
    if (phase.pan && i === 0) await page.keyboard.down(PAN_KEYS[0]);
    if (phase.pan && i === n / 2) {
      await page.keyboard.up(PAN_KEYS[0]);
      await page.keyboard.down(PAN_KEYS[1]);
    }
    await frame(page);
  }
  if (phase.pan) await page.keyboard.up(PAN_KEYS[1]);
}

function fileOf(url) {
  if (!url.startsWith('http')) return null;
  const path = new URL(url).pathname;
  const lib = path.lastIndexOf('/node_modules/');
  if (lib >= 0) return `node_modules/${path.slice(lib + '/node_modules/'.length)}`;
  if (path.startsWith('/src/') || path.startsWith('/.svelte-kit/')) return path.slice(1);
  return null;
}

function sourceReader(fetchSource) {
  const cache = new Map();
  return async (scriptId) => {
    if (!cache.has(scriptId)) cache.set(scriptId, await fetchSource(scriptId));
    return cache.get(scriptId);
  };
}

function counters(before, after) {
  const out = {};
  for (const [k, v] of Object.entries(after.stats.render)) out[`render ${k}`] = v;
  for (const k of COUNTED_METRICS) out[k] = (after.metrics[k] ?? 0) - (before.metrics[k] ?? 0);
  for (const k of HELD_METRICS) out[k] = after.metrics[k] ?? 0;
  return out;
}

function observed(before, after) {
  return Object.fromEntries(
    OBSERVED_METRICS.map((k) => [k, (after.metrics[k] ?? 0) - (before.metrics[k] ?? 0)])
  );
}

async function measure(page, cdp, workers, sim, n) {
  const mapCentre = await centreOf(page, MAP);
  await page.mouse.move(mapCentre.x, mapCentre.y);
  await focusMap(page);
  await setPaused(page, true);
  await frames(page, SETTLE_FRAMES);
  for (let i = 0; i < ZOOM_STEPS; i++) {
    await page.mouse.wheel(0, -120);
    await frames(page, FRAMES_PER_ZOOM);
  }
  await frames(page, SETTLE_FRAMES);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
  await workers.send(sim, 'Profiler.enable');
  await workers.send(sim, 'Profiler.startPreciseCoverage', { callCount: true, detailed: false });
  const samples = [await sample(page, cdp, workers, sim)];
  for (const phase of PHASES) {
    await runPhase(page, phase, n);
    samples.push(await sample(page, cdp, workers, sim));
    log(`phase ${phase.name}: ${JSON.stringify(samples.at(-1).stats.render)}`);
  }
  return samples;
}

async function writeResults(out, samples, n, cdp, workers, sim) {
  await cdp.send('Debugger.enable');
  await workers.send(sim, 'Debugger.enable');
  const pageSource = sourceReader(
    async (scriptId) => (await cdp.send('Debugger.getScriptSource', { scriptId })).scriptSource
  );
  const workerSource = sourceReader(
    async (scriptId) => (await workers.send(sim, 'Debugger.getScriptSource', { scriptId })).scriptSource
  );
  mkdirSync(out, { recursive: true });
  for (let i = 0; i < PHASES.length; i++) {
    const [before, after] = [samples[i], samples[i + 1]];
    const name = PHASES[i].name;
    const { turn, phases, messages } = after.stats.worker;
    const runs = [
      {
        scenario: `browser ${name} page`,
        ticks: n,
        turn,
        functions: await functionPins(after.page, pageSource, fileOf),
        phases: null,
        messages: {},
        counters: counters(before, after),
        observed: observed(before, after)
      },
      {
        scenario: `browser ${name} worker`,
        ticks: n,
        turn,
        functions: await functionPins(after.worker, workerSource, fileOf),
        phases,
        messages
      }
    ];
    for (const run of runs) {
      const file = join(out, `${run.scenario.replaceAll(' ', '-')}.json`);
      writeFileSync(file, JSON.stringify(run, null, 1));
      const calls = Object.values(run.functions).reduce((s, f) => s + f.count, 0);
      log(`${run.scenario}: turn ${turn}, ${Object.keys(run.functions).length} functions, ${calls} calls → ${file}`);
    }
  }
}

async function main() {
  if (!opts.out) throw new Error('usage: browser.mjs --out <dir> [--tree <dir>] [--fixture <file>]');
  const tree = resolve(opts.tree);
  const out = resolve(opts.out);
  const n = Number(opts.frames);
  mkdirSync(out, { recursive: true });
  const body = readFixture(resolve(opts.fixture));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  log(`tree ${tree}, fixture ${opts.fixture} (${body.length} bytes), port ${port}`);
  const server = await startServer(tree, port, join(out, '..', `dev-server-${port}.log`));
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await context.addInitScript(seedRandom);
    await context.addInitScript(hideAudio);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const networkQuiet = trackNetwork(page);
    await page.clock.install({ time: EPOCH_MS });
    await seedSave(page, origin, body);
    await loadGame(page, origin);
    await networkQuiet(3000);
    log('game ready');
    const cdp = await context.newCDPSession(page);
    const workers = workerChannel(cdp);
    await cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: false
    });
    const sim = await workers.find(/sim\.worker/);
    await cdp.send('Performance.enable');
    await page.clock.pauseAt(PAUSE_AT_MS);
    const samples = await measure(page, cdp, workers, sim, n);
    await writeResults(out, samples, n, cdp, workers, sim);
  } finally {
    await browser.close();
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
  }
  if (errors.length) log(`page errors:\n${errors.join('\n')}`);
}

await main();
