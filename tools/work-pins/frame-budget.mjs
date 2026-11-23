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
const CAMERA_SAVE_FRAMES = 15;
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

async function mainThreadMs(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const ms = (name) => metrics.find((m) => m.name === name).value * 1000;
  return { task: ms('TaskDuration'), script: ms('ScriptDuration') };
}

async function timedFrames(page, cdp, n, ticks, beforeFrame) {
  const perFrame = [];
  let last = await mainThreadMs(cdp);
  for (let i = 0; i < n; i++) {
    if (beforeFrame) await beforeFrame(i);
    await frame(page, ticks);
    const now = await mainThreadMs(cdp);
    perFrame.push({ task: now.task - last.task, script: now.script - last.script });
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

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function describe(perFrame) {
  const task = perFrame.map((f) => f.task);
  const script = perFrame.map((f) => f.script);
  return {
    frames: perFrame.length,
    meanMs: mean(task),
    medianMs: median(task),
    maxMs: Math.max(...task),
    scriptMeanMs: mean(script),
    scriptMedianMs: median(script),
    perFrame
  };
}

function shown({ perFrame, ...rest }) {
  const slow = perFrame.flatMap((f, i) =>
    f.task > 4 * rest.medianMs ? [`${i}:${Math.round(f.task)}/${Math.round(f.script)}`] : []
  );
  return `${JSON.stringify(rest)} slow frames (task/script ms) ${slow.join(' ')}`;
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
  return timedFrames(page, cdp, CAMERA_SAVE_FRAMES, 0);
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
  for (let i = 0; i < MAX_ZOOM_STEPS && tile < closeTile; i++) {
    perFrame.push(...(await wheelFrames(page, cdp, -120)));
    tile = await tileWidth(page);
  }
  for (let i = 0; i < MAX_ZOOM_STEPS && tile > closeTile; i++) {
    perFrame.push(...(await wheelFrames(page, cdp, 120)));
    tile = await tileWidth(page);
  }
  if (tile !== closeTile) throw new Error(`zoom came back to tile ${tile}, left from ${closeTile}`);
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
      log(`round ${r} ${phase.name}: ${shown(round[phase.name])}`);
    }
    round[ZOOM] = await zoomOutAndBack(page, cdp);
    log(`round ${r} ${ZOOM}: ${shown(round[ZOOM])}`);
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
