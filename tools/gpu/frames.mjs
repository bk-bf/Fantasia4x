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

const UNCAPPED = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
const ZOOM_STEPS = 7;
const ZOOM_PAUSE_MS = 150;
const WARM_MS = 5000;
const PAN_KEYS = ['ArrowRight', 'ArrowLeft'];
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
    angle: { type: 'string', default: 'gl-egl' },
    uncapped: { type: 'boolean', default: false }
  }
});

const log = logger('gpu-frames');

function recordFrames() {
  const times = (window.__f4xFrameTimes = []);
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

const quantile = (xs, q) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];

function summarise(times, seconds) {
  const deltas = times.slice(1).map((t, i) => t - times[i]);
  return {
    frames: deltas.length,
    fps: Number((deltas.length / seconds).toFixed(2)),
    medianMs: Number(quantile(deltas, 0.5).toFixed(3)),
    p95Ms: Number(quantile(deltas, 0.95).toFixed(3)),
    maxMs: Number(Math.max(...deltas).toFixed(3))
  };
}

async function runPhase(page, phase, ms) {
  await setPaused(page, phase.paused);
  await page.evaluate(recordFrames);
  if (phase.pan) await page.keyboard.down(PAN_KEYS[0]);
  await sleep(ms / 2);
  if (phase.pan) {
    await page.keyboard.up(PAN_KEYS[0]);
    await page.keyboard.down(PAN_KEYS[1]);
  }
  await sleep(ms / 2);
  if (phase.pan) await page.keyboard.up(PAN_KEYS[1]);
  return summarise(await page.evaluate(takeFrames), ms / 1000);
}

async function main() {
  if (!opts.out)
    throw new Error('usage: frames.mjs --out <file> [--tree <dir>] [--seconds N] [--angle gl-egl|vulkan] [--uncapped]');
  const seconds = Number(opts.seconds);
  const out = resolve(opts.out);
  mkdirSync(dirname(out), { recursive: true });
  const args = [`--use-angle=${opts.angle}`, '--ignore-gpu-blocklist', ...(opts.uncapped ? UNCAPPED : [])];
  const game = await openGame({
    tree: resolve(opts.tree),
    fixture: opts.fixture,
    serverLog: `${out}.dev-server.log`,
    args,
    log,
    clock: false
  });
  try {
    const { page } = game;
    const box = await page.locator(MAP).first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await focusMap(page);
    for (let i = 0; i < ZOOM_STEPS; i++) {
      await page.mouse.wheel(0, -120);
      await sleep(ZOOM_PAUSE_MS);
    }
    await setPaused(page, false);
    await sleep(WARM_MS);
    const result = { args, seconds, phases: {} };
    for (const phase of PHASES) {
      result.phases[phase.name] = await runPhase(page, phase, seconds * 1000);
      log(`${phase.name}: ${JSON.stringify(result.phases[phase.name])}`);
    }
    if (game.errors.length) log(`page errors: ${game.errors.slice(0, 3).join(' | ')}`);
    writeFileSync(out, JSON.stringify(result, null, 1));
  } finally {
    await game.close();
  }
}

await main();
