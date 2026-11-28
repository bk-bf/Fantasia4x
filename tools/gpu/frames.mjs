#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  DEFAULT_FIXTURE,
  MAP,
  focusMap,
  logger,
  openGame,
  setPaused,
  sleep
} from '../work-pins/browser-session.mjs';

process.env.GOMAXPROCS ??= '4';

const UNCAPPED = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
const ZOOM_STEPS = 7;
const ZOOM_PAUSE_MS = 150;
const WARM_MS = 5000;
/** @typedef {import('playwright').Page} Page */
/** @typedef {{ name: string, paused: boolean, pan: boolean }} Phase */
/** @typedef {Awaited<ReturnType<typeof runPhase>>} PhaseResult */

const PAN_KEYS = ['ArrowRight', 'ArrowLeft'];
/** @type {Phase[]} */
const PHASES = [
  { name: 'run', paused: false, pan: false },
  { name: 'pan', paused: false, pan: true },
  { name: 'paused-pan', paused: true, pan: true }
];

const { values: opts } = parseArgs({
  options: {
    tree: { type: 'string', default: '.' },
    out: { type: 'string' },
    fixture: { type: 'string', default: process.env.WORK_PINS_FIXTURE ?? DEFAULT_FIXTURE },
    seconds: { type: 'string', default: '10' },
    rounds: { type: 'string', default: '3' },
    angle: { type: 'string', default: 'gl-egl' },
    capped: { type: 'boolean', default: false }
  }
});

const log = logger('gpu-frames');

function recordFrames() {
  /** @type {number[]} */
  const times = [];
  window.__f4xFrameTimes = times;
  /** @param {number} t */
  const tick = (t) => {
    times.push(t);
    window.__f4xFrameLoop = requestAnimationFrame(tick);
  };
  window.__f4xFrameLoop = requestAnimationFrame(tick);
}

function takeFrames() {
  cancelAnimationFrame(window.__f4xFrameLoop);
  return window.__f4xFrameTimes;
}

function recordTicks() {
  /** @type {number[]} */
  const ticks = [];
  window.__f4xTicks = ticks;
  /** @type {Record<string, number>} */
  const kinds = {};
  window.__f4xMessageKinds = kinds;
  window.__f4xWorkers = 0;
  const Original = window.Worker;
  window.Worker = class extends Original {
    /** @param {ConstructorParameters<typeof Worker>} args */
    constructor(...args) {
      super(...args);
      window.__f4xWorkers = (window.__f4xWorkers ?? 0) + 1;
      this.addEventListener('message', (e) => {
        const kind = e.data?.kind ?? typeof e.data;
        kinds[kind] = (kinds[kind] ?? 0) + 1;
        if (kind === 'snapshot') ticks.push(performance.now());
      });
    }
  };
}

/** @param {Page} page */
const wiring = (page) =>
  page.evaluate(() => ({
    workersWrapped: window.__f4xWorkers ?? 'wrapper missing',
    messageKinds: window.__f4xMessageKinds ?? null
  }));

/** @param {number} part @param {number} whole */
const share = (part, whole) => (whole ? Number(((100 * part) / whole).toFixed(1)) : 0);

/** @param {number[]} times @param {number[]} ticks @param {number} slowerThan */
function tickShare(times, ticks, slowerThan) {
  const last = times[times.length - 1];
  const inside = ticks.filter((t) => t > times[0] && t <= last);
  let slow = 0;
  let slowTicked = 0;
  let fast = 0;
  let fastTicked = 0;
  let j = 0;
  for (let i = 1; i < times.length; i++) {
    let ticked = false;
    while (j < inside.length && inside[j] <= times[i]) {
      if (inside[j] > times[i - 1]) ticked = true;
      j++;
    }
    if (times[i] - times[i - 1] > slowerThan) {
      slow++;
      if (ticked) slowTicked++;
    } else {
      fast++;
      if (ticked) fastTicked++;
    }
  }
  return { ticks: inside.length, slowWithTickPct: share(slowTicked, slow), otherWithTickPct: share(fastTicked, fast) };
}

/** @param {number[]} xs @param {number} q */
const quantile = (xs, q) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];
/** @param {number[]} xs */
const median = (xs) => quantile(xs, 0.5);

/** @param {number[]} times @param {number} seconds @param {number[]} ticks */
function summarise(times, seconds, ticks) {
  const deltas = times.slice(1).map((t, i) => t - times[i]);
  const mid = median(deltas);
  return {
    frames: deltas.length,
    fps: Number((deltas.length / seconds).toFixed(2)),
    medianMs: Number(mid.toFixed(3)),
    p95Ms: Number(quantile(deltas, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...deltas).toFixed(3)),
    slowFrames: deltas.filter((d) => d > 3 * mid).length,
    ...tickShare(times, ticks, 3 * mid)
  };
}

/** @param {Page} page @returns {Promise<Record<string, number>>} */
const takeRender = async (page) =>
  (await page.evaluate(() => window.__f4xWorkPins?.stats() ?? null))?.render ?? {};

/** @param {Page} page @param {number} ms */
async function panPath(page, ms) {
  await page.keyboard.down(PAN_KEYS[0]);
  await sleep(ms / 2);
  await page.keyboard.up(PAN_KEYS[0]);
  await page.keyboard.down(PAN_KEYS[1]);
  await sleep(ms / 2);
  await page.keyboard.up(PAN_KEYS[1]);
}

/** @param {Page} page @param {Phase} phase @param {number} ms */
async function runPhase(page, phase, ms) {
  await setPaused(page, phase.paused);
  await takeRender(page);
  await page.evaluate(recordFrames);
  if (phase.pan) await panPath(page, ms);
  else await sleep(ms);
  const times = await page.evaluate(takeFrames);
  const frames = summarise(times, ms / 1000, await page.evaluate(() => window.__f4xTicks ?? []));
  const render = await takeRender(page);
  return {
    ...frames,
    bufferUploadKB: Math.round(render.bufferUploadBytes / 1024),
    textureUploadKB: Math.round(render.textureUploadBytes / 1024),
    glDrawCalls: render.glDrawCalls,
    glVertices: render.glVertices
  };
}

async function main() {
  if (!opts.out)
    throw new Error(
      'usage: frames.mjs --out <file> [--tree <dir>] [--seconds N] [--rounds N] [--angle gl-egl|vulkan] [--capped]'
    );
  const seconds = Number(opts.seconds);
  const rounds = Number(opts.rounds);
  const out = resolve(opts.out);
  mkdirSync(dirname(out), { recursive: true });
  const args = [`--use-angle=${opts.angle}`, '--ignore-gpu-blocklist', ...(opts.capped ? [] : UNCAPPED)];
  const game = await openGame({
    tree: resolve(opts.tree),
    fixture: opts.fixture,
    serverLog: `${out}.dev-server.log`,
    args,
    log,
    clock: false,
    init: [recordTicks],
    workPins: false
  });
  try {
    const { page } = game;
    log(`wiring after load: ${JSON.stringify(await wiring(page))}`);
    const box = await page.locator(MAP).first().boundingBox();
    if (!box) throw new Error(`${MAP} is not visible`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await focusMap(page);
    for (let i = 0; i < ZOOM_STEPS; i++) {
      await page.mouse.wheel(0, -120);
      await sleep(ZOOM_PAUSE_MS);
    }
    await setPaused(page, false);
    await sleep(WARM_MS);
    await panPath(page, seconds * 1000);
    /** @type {{ args: string[], seconds: number, rounds: number, phases: Record<string, { runs: PhaseResult[], fps?: number, medianMs?: number }> }} */
    const result = { args, seconds, rounds, phases: {} };
    for (let round = 1; round <= rounds; round++) {
      for (const phase of PHASES) {
        const r = await runPhase(page, phase, seconds * 1000);
        (result.phases[phase.name] ??= { runs: [] }).runs.push(r);
        log(`round ${round} ${phase.name}: ${JSON.stringify(r)}`);
      }
    }
    for (const p of Object.values(result.phases)) {
      p.fps = median(p.runs.map((r) => r.fps));
      p.medianMs = median(p.runs.map((r) => r.medianMs));
    }
    const fps = Object.fromEntries(Object.entries(result.phases).map(([name, p]) => [name, p.fps]));
    log(`median fps over ${rounds} rounds: ${JSON.stringify(fps)}`);
    log(`wiring after phases: ${JSON.stringify(await wiring(page))}`);
    if (game.errors.length) log(`page errors: ${game.errors.slice(0, 3).join(' | ')}`);
    writeFileSync(out, JSON.stringify(result, null, 1));
  } finally {
    await game.close();
  }
}

await main();
