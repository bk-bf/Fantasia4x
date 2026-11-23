#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  DEFAULT_FIXTURE,
  MAP,
  assertRunning,
  disableAutosave,
  focusMap,
  frame,
  frames,
  freezeClock,
  logger,
  openGame,
  scenarioQuery,
  setPaused,
  waitForScenario,
  watchScenarioLoad
} from './browser-session.mjs';
import { checkBudgets, median } from './budgets.mjs';

const SCENARIO = 'large-wilderness';
const ZOOM_IN_STEPS = 7;
const FRAMES_PER_ZOOM = 10;
const SETTLE_FRAMES = 300;
const MAX_ZOOM_STEPS = 80;
const PAUSE_CHECK_FRAMES = 25;
const STEADY = [
  { name: 'idle', paused: true, ticks: 0 },
  { name: 'run-1x', paused: false, ticks: 1 },
  { name: 'run-4x', paused: false, ticks: 4 }
];
const ZOOM = 'zoom-out-and-back';

const { values: opts } = parseArgs({
  allowNegative: true,
  options: {
    tree: { type: 'string', default: '.' },
    out: { type: 'string' },
    fixture: { type: 'string', default: process.env.WORK_PINS_FIXTURE ?? DEFAULT_FIXTURE },
    frames: { type: 'string', default: '120' },
    rounds: { type: 'string', default: '3' },
    check: { type: 'boolean', default: true }
  }
});

const log = logger('frame-budget');

async function taskMs(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((m) => m.name === 'TaskDuration').value * 1000;
}

async function timedFrames(page, cdp, n, ticks, beforeFrame) {
  const perFrame = [];
  let last = await taskMs(cdp);
  for (let i = 0; i < n; i++) {
    if (beforeFrame) await beforeFrame(i);
    await frame(page, ticks);
    const now = await taskMs(cdp);
    perFrame.push(now - last);
    last = now;
  }
  return perFrame;
}

const tileWidth = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem('fantasia4x-camera'))?.tileWidth ?? null;
    } catch {
      return null;
    }
  });

function describe(perFrame) {
  const sum = perFrame.reduce((s, x) => s + x, 0);
  return {
    frames: perFrame.length,
    meanMs: sum / perFrame.length,
    medianMs: median(perFrame),
    maxMs: Math.max(...perFrame)
  };
}

async function steadyPhase(page, cdp, phase, n) {
  await setPaused(page, phase.paused);
  await cdp.send('HeapProfiler.collectGarbage');
  const what = `phase ${phase.name}`;
  const perFrame = await timedFrames(page, cdp, n, phase.ticks, async (i) => {
    if (!phase.paused && i % PAUSE_CHECK_FRAMES === 0) await assertRunning(page, what);
  });
  if (!phase.paused) await assertRunning(page, what);
  return describe(perFrame);
}

async function wheelFrames(page, cdp, deltaY) {
  await page.mouse.wheel(0, deltaY);
  return timedFrames(page, cdp, FRAMES_PER_ZOOM, 0);
}

async function zoomOutAndBack(page, cdp) {
  await setPaused(page, true);
  await cdp.send('HeapProfiler.collectGarbage');
  const closeTile = await tileWidth(page);
  const perFrame = [];
  let steps = 0;
  let tile = closeTile;
  while (steps < MAX_ZOOM_STEPS) {
    perFrame.push(...(await wheelFrames(page, cdp, 120)));
    steps++;
    const next = await tileWidth(page);
    if (next === tile) break;
    tile = next;
  }
  const farTile = tile;
  for (let i = 0; i < steps; i++) perFrame.push(...(await wheelFrames(page, cdp, -120)));
  const backTile = await tileWidth(page);
  if (backTile !== closeTile)
    throw new Error(`zoom came back to tile ${backTile}, left from ${closeTile}`);
  return { closeTile, farTile, steps, ...describe(perFrame) };
}

async function measure(page, cdp, n, rounds) {
  const box = await page.locator(MAP).first().boundingBox();
  await page.mouse.move(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
  await focusMap(page);
  await setPaused(page, true);
  await frames(page, SETTLE_FRAMES);
  for (let i = 0; i < ZOOM_IN_STEPS; i++) {
    await page.mouse.wheel(0, -120);
    await frames(page, FRAMES_PER_ZOOM);
  }
  await frames(page, SETTLE_FRAMES);
  const results = [];
  for (let r = 0; r < rounds; r++) {
    const round = { round: r };
    for (const phase of STEADY) {
      round[phase.name] = await steadyPhase(page, cdp, phase, n);
      log(`round ${r} ${phase.name}: ${JSON.stringify(round[phase.name])}`);
    }
    round[ZOOM] = await zoomOutAndBack(page, cdp);
    log(`round ${r} ${ZOOM}: ${JSON.stringify(round[ZOOM])}`);
    results.push(round);
  }
  return results;
}

function budgetsOf(results) {
  const runs = (pick) => results.map(pick);
  const entry = (pick) => ({ value: median(runs(pick)), runs: runs(pick) });
  return {
    'idle main-thread ms per frame': entry((r) => r.idle.meanMs),
    'run-1x main-thread ms per frame': entry((r) => r['run-1x'].meanMs),
    'run-4x main-thread ms per frame': entry((r) => r['run-4x'].meanMs),
    'zoom-out-and-back first longest frame ms': {
      value: results[0]?.[ZOOM].maxMs,
      runs: [results[0]?.[ZOOM].maxMs]
    },
    'zoom-out-and-back longest frame ms': entry((r) => r[ZOOM].maxMs)
  };
}

async function main() {
  if (!opts.out)
    throw new Error(
      'usage: frame-budget.mjs --out <dir> [--tree <dir>] [--frames N] [--rounds N] [--no-check]'
    );
  const out = resolve(opts.out);
  mkdirSync(out, { recursive: true });
  const game = await openGame({
    tree: resolve(opts.tree),
    fixture: opts.fixture,
    serverLog: join(out, 'dev-server.log'),
    log,
    init: [disableAutosave, watchScenarioLoad(SCENARIO)],
    query: scenarioQuery(SCENARIO)
  });
  let results;
  try {
    const { page, cdp } = game;
    await waitForScenario(page, SCENARIO);
    log(`${SCENARIO} loaded`);
    await cdp.send('Performance.enable');
    await freezeClock(page);
    results = await measure(page, cdp, Number(opts.frames), Number(opts.rounds));
  } finally {
    await game.close();
  }
  if (game.errors.length) log(`page errors:\n${game.errors.join('\n')}`);
  writeFileSync(
    join(out, 'frame-budget.json'),
    JSON.stringify({ scenario: SCENARIO, results }, null, 1)
  );
  if (!opts.check) return true;
  return checkBudgets(`browser frames on ${SCENARIO}`, budgetsOf(results));
}

process.exit((await main()) ? 0 : 1);
