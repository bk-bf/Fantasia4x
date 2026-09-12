#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  DEFAULT_FIXTURE,
  assertRunning,
  frame,
  frames,
  freezeClock,
  logger,
  metrics,
  openGame,
  setPaused,
  takePanelWrites,
  turnOf,
  watchPanelWrites
} from './browser-session.mjs';

const DAY_TICKS = 18_000;
const SETTLE_FRAMES = 30;
const PAUSE_CHECK_FRAMES = 25;

const { values: opts } = parseArgs({
  options: {
    tree: { type: 'string', default: '.' },
    out: { type: 'string' },
    fixture: { type: 'string', default: process.env.WORK_PINS_FIXTURE ?? DEFAULT_FIXTURE },
    ticks: { type: 'string', default: String(DAY_TICKS) },
    'ticks-per-frame': { type: 'string', default: '4' },
    bucket: { type: 'string', default: '600' }
  }
});

const log = logger('day');

async function bucket(page, cdp, index, count, perFrame) {
  const turn0 = await turnOf(page);
  const m0 = await metrics(cdp);
  for (let i = 0; i < count; i++) {
    if (i % PAUSE_CHECK_FRAMES === 0) await assertRunning(page, `bucket ${index + 1}`);
    await frame(page, perFrame);
  }
  const m1 = await metrics(cdp);
  const turn1 = await turnOf(page);
  const p = await takePanelWrites(page);
  return {
    turns: [turn0, turn1],
    timeOfDay: +((((turn0 % DAY_TICKS) + DAY_TICKS) % DAY_TICKS) / DAY_TICKS).toFixed(3),
    panelStyleWrites: p.panelStyleWrites,
    tintMatrixWrites: p.tintMatrixWrites,
    recalcStyleCount: (m1.RecalcStyleCount ?? 0) - (m0.RecalcStyleCount ?? 0),
    layoutCount: (m1.LayoutCount ?? 0) - (m0.LayoutCount ?? 0)
  };
}

async function main() {
  if (!opts.out)
    throw new Error('usage: day.mjs --out <dir> [--tree <dir>] [--ticks <n>] [--ticks-per-frame <n>] [--bucket <ticks>]');
  const tree = resolve(opts.tree);
  const out = resolve(opts.out);
  const perFrame = Number(opts['ticks-per-frame']);
  const bucketFrames = Math.max(1, Math.round(Number(opts.bucket) / perFrame));
  const buckets = Math.ceil(Number(opts.ticks) / perFrame / bucketFrames);
  mkdirSync(out, { recursive: true });
  const started = Date.now();
  const game = await openGame({ tree, fixture: opts.fixture, serverLog: `${out}.dev-server.log`, log });
  try {
    const { page, cdp, errors } = game;
    await cdp.send('Performance.enable');
    await freezeClock(page);
    log(`watching ${JSON.stringify(await watchPanelWrites(page))}`);
    log(`${buckets} buckets of ${bucketFrames} frames x ${perFrame} ticks`);
    await setPaused(page, false);
    await frames(page, SETTLE_FRAMES, perFrame);
    await takePanelWrites(page);
    const rows = [];
    for (let b = 0; b < buckets; b++) {
      rows.push(await bucket(page, cdp, b, bucketFrames, perFrame));
      log(`bucket ${b + 1}/${buckets} ${JSON.stringify(rows.at(-1))}`);
    }
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    const run = {
      scenario: 'browser day page',
      ticks: rows.length ? rows.at(-1).turns[1] - rows[0].turns[0] : 0,
      turn: rows.at(-1)?.turns[1] ?? null,
      functions: {},
      phases: null,
      messages: {},
      counters: {
        'panel style writes': sum('panelStyleWrites'),
        'tint matrix writes': sum('tintMatrixWrites')
      },
      observed: {
        LayoutCount: sum('layoutCount'),
        RecalcStyleCount: sum('recalcStyleCount'),
        buckets: rows,
        seconds: Math.round((Date.now() - started) / 1000),
        pageErrors: errors
      }
    };
    const file = join(out, 'browser-day-page.json');
    writeFileSync(file, JSON.stringify(run, null, 1));
    log(`${JSON.stringify(run.counters)} over ${run.ticks} ticks in ${run.observed.seconds} s → ${file}`);
  } finally {
    await game.close();
  }
}

await main();
