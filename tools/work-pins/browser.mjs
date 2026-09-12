#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  DEFAULT_FIXTURE,
  MAP,
  assertRunning,
  focusMap,
  frame,
  frames,
  freezeClock,
  logger,
  metrics,
  openGame,
  setPaused,
  sleep,
  takePanelWrites,
  watchPanelWrites
} from './browser-session.mjs';
import { functionPins } from './functions.mjs';

const ZOOM_STEPS = 7;
const FRAMES_PER_ZOOM = 10;
const SETTLE_FRAMES = 300;
const PAUSE_CHECK_FRAMES = 25;
const PHASES = [
  { name: 'run', paused: false, pan: false },
  { name: 'pan', paused: false, pan: true },
  { name: 'paused-pan', paused: true, pan: true }
];
const PAN_KEYS = ['ArrowRight', 'ArrowLeft'];
const COUNTED_METRICS = ['LayoutCount'];
const OBSERVED_METRICS = ['RecalcStyleCount'];
const LAYER_SETTLE_MS = 300;
const WORLD_EFFECTS = '.world-effects-layer';
const EXACT_CALL_COUNTS =
  '--js-flags=--no-flush-bytecode --no-lazy-feedback-allocation --no-sparkplug --no-maglev --no-turbofan';
const HELD_METRICS = ['Nodes', 'JSEventListeners'];
const OBSERVED_FILES = [
  /^src\/lib\/audio\//,
  /^node_modules\/\.vite\/deps\/howler\.js$/,
  /^src\/lib\/workPins\//
];

const { values: opts } = parseArgs({
  options: {
    tree: { type: 'string', default: '.' },
    out: { type: 'string' },
    fixture: { type: 'string', default: process.env.WORK_PINS_FIXTURE ?? DEFAULT_FIXTURE },
    frames: { type: 'string', default: '240' }
  }
});

const log = logger('browser-pins');

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

async function centreOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

function watchLayers(cdp) {
  const state = { layers: [], changes: 0, painted: 0 };
  cdp.on('LayerTree.layerTreeDidChange', (p) => {
    state.changes++;
    if (p.layers) state.layers = p.layers;
  });
  cdp.on('LayerTree.layerPainted', () => state.painted++);
  return state;
}

async function takeLayers(state) {
  await sleep(LAYER_SETTLE_MS);
  const taken = {
    layers: state.layers.length,
    layerArea: state.layers.reduce((sum, l) => sum + Math.round(l.width * l.height), 0),
    layerTreeChanges: state.changes,
    layersPainted: state.painted
  };
  state.changes = 0;
  state.painted = 0;
  return taken;
}

function watchWorldEffects(selector) {
  const w = (window.__f4xWorldEffects = { mutations: 0, styleWrites: 0, childListChanges: 0 });
  const layer = document.querySelector(selector);
  if (!layer) return false;
  new MutationObserver((records) => {
    for (const r of records) {
      w.mutations++;
      if (r.type === 'attributes' && r.attributeName === 'style') w.styleWrites++;
      if (r.type === 'childList') w.childListChanges++;
    }
  }).observe(layer, { childList: true, subtree: true, attributes: true, characterData: true });
  return true;
}

function takeWorldEffects(selector) {
  const w = window.__f4xWorldEffects;
  const layer = document.querySelector(selector);
  const taken = { ...w, nodes: layer ? layer.querySelectorAll('*').length : 0 };
  w.mutations = 0;
  w.styleWrites = 0;
  w.childListChanges = 0;
  return taken;
}

async function sample(page, cdp, workers, sim, layerState) {
  const page_ = (await cdp.send('Profiler.takePreciseCoverage')).result;
  const worker_ = (await workers.send(sim, 'Profiler.takePreciseCoverage')).result;
  const stats = await page.evaluate(() => window.__f4xWorkPins.stats());
  const worldEffects = await page.evaluate(takeWorldEffects, WORLD_EFFECTS);
  const panels = await takePanelWrites(page);
  const layers = await takeLayers(layerState);
  return {
    page: page_,
    worker: worker_,
    stats,
    worldEffects,
    panels,
    layers,
    metrics: await metrics(cdp, { collectGarbage: true })
  };
}

async function runPhase(page, phase, n) {
  await setPaused(page, phase.paused);
  const what = `phase ${phase.name}`;
  for (let i = 0; i < n; i++) {
    if (!phase.paused && i % PAUSE_CHECK_FRAMES === 0) await assertRunning(page, what);
    if (phase.pan && i === 0) await page.keyboard.down(PAN_KEYS[0]);
    if (phase.pan && i === n / 2) {
      await page.keyboard.up(PAN_KEYS[0]);
      await page.keyboard.down(PAN_KEYS[1]);
    }
    await frame(page);
  }
  if (phase.pan) await page.keyboard.up(PAN_KEYS[1]);
  if (!phase.paused) await assertRunning(page, what);
}

function fileOf(url) {
  if (!url.startsWith('http')) return null;
  const path = new URL(url).pathname;
  const lib = path.lastIndexOf('/node_modules/');
  if (lib >= 0) return `node_modules/${path.slice(lib + '/node_modules/'.length)}`;
  if (path.startsWith('/src/') || path.startsWith('/.svelte-kit/')) return path.slice(1);
  return null;
}

function splitObserved(pins) {
  const compared = {};
  const observed = {};
  for (const [key, pin] of Object.entries(pins))
    (OBSERVED_FILES.some((re) => re.test(pin.file)) ? observed : compared)[key] = pin;
  return { compared, observed };
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
  out['worldEffects nodes'] = after.worldEffects.nodes;
  out['worldEffects mutations'] = after.worldEffects.mutations;
  out['worldEffects style writes'] = after.worldEffects.styleWrites;
  out['worldEffects child list changes'] = after.worldEffects.childListChanges;
  out['panel style writes'] = after.panels.panelStyleWrites;
  out['tint matrix writes'] = after.panels.tintMatrixWrites;
  out.layers = after.layers.layers;
  out.layerArea = after.layers.layerArea;
  out.layersPainted = after.layers.layersPainted;
  return out;
}

function observed(before, after) {
  return {
    ...Object.fromEntries(
      OBSERVED_METRICS.map((k) => [k, (after.metrics[k] ?? 0) - (before.metrics[k] ?? 0)])
    ),
    layerTreeChanges: after.layers.layerTreeChanges
  };
}

async function measure(page, cdp, workers, sim, n, layerState) {
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
  const samples = [await sample(page, cdp, workers, sim, layerState)];
  for (const phase of PHASES) {
    await runPhase(page, phase, n);
    samples.push(await sample(page, cdp, workers, sim, layerState));
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
    const page = splitObserved(await functionPins(after.page, pageSource, fileOf));
    const worker = splitObserved(await functionPins(after.worker, workerSource, fileOf));
    const runs = [
      {
        scenario: `browser ${name} page`,
        ticks: n,
        turn,
        functions: page.compared,
        phases: null,
        messages: {},
        counters: counters(before, after),
        observed: { ...observed(before, after), functions: page.observed }
      },
      {
        scenario: `browser ${name} worker`,
        ticks: n,
        turn,
        functions: worker.compared,
        phases,
        messages,
        observed: { functions: worker.observed }
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
  const game = await openGame({
    tree,
    fixture: opts.fixture,
    serverLog: `${out}.dev-server.log`,
    args: [EXACT_CALL_COUNTS],
    log
  });
  try {
    const { page, cdp } = game;
    const workers = workerChannel(cdp);
    await cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: false
    });
    const sim = await workers.find(/sim\.worker/);
    await cdp.send('Performance.enable');
    const layerState = watchLayers(cdp);
    await cdp.send('LayerTree.enable');
    if (!(await page.evaluate(watchWorldEffects, WORLD_EFFECTS))) throw new Error(`no ${WORLD_EFFECTS}`);
    log(`panels ${JSON.stringify(await watchPanelWrites(page))}`);
    await freezeClock(page);
    const samples = await measure(page, cdp, workers, sim, n, layerState);
    await writeResults(out, samples, n, cdp, workers, sim);
  } finally {
    await game.close();
  }
  if (game.errors.length) log(`page errors:\n${game.errors.join('\n')}`);
}

await main();
