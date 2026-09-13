#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';

import * as B from './lib/board.mjs';
import { ROOT } from './lib/harness.mjs';
import { AUDIT_UNITS, activeUnits, readControl, readPlan, schedule } from './lib/pace.mjs';

const ORDER = { tests: 0, headless: 1, playtest: 2 };
const POINTS_FLOOR = Number(process.env.RESOLVE_POINTS_FLOOR) || 600;
const REPEAT_MS = 10 * 60_000;
const DRY = process.argv.includes('--dry-run');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => process.stdout.write(`[resolve ${new Date().toISOString().slice(11, 19)}] ${s}\n`);

const said = new Map();
function sayEvery(key, text) {
  const last = said.get(key) ?? 0;
  if (Date.now() - last < REPEAT_MS) return;
  said.set(key, Date.now());
  log(text);
}

async function paceVerdict(holding) {
  const control = readControl();
  const poll = Math.max(15, Number(control.poll_seconds) || 60) * 1000;
  const audit = activeUnits(AUDIT_UNITS);
  if (audit.length) return { go: false, key: 'waiting', reason: `${audit.join(' and ')} is running`, poll };
  const s = schedule(await readPlan(control.plan_url), control, Date.now(), holding);
  return { go: s.verdict === 'go', key: 'holding', reason: s.reason, poll };
}

async function gate() {
  let holding = false;
  for (;;) {
    const v = await paceVerdict(holding);
    if (v.go) {
      if (holding) log(`going — ${v.reason}`);
      return;
    }
    holding = true;
    sayEvery(v.key, `${v.key} — ${v.reason}`);
    await sleep(v.poll);
  }
}

function rateLimit() {
  const raw = execFileSync('gh', ['api', 'graphql', '-f', 'query={rateLimit{remaining resetAt}}'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return JSON.parse(raw).data.rateLimit;
}

async function points() {
  for (;;) {
    let rl;
    try {
      rl = rateLimit();
    } catch (e) {
      sayEvery('github', `cannot read the GitHub rate limit (${String(e.message).split('\n')[0]}); retrying every minute`);
      await sleep(60_000);
      continue;
    }
    if (rl.remaining >= POINTS_FLOOR) return rl;
    sayEvery('github', `${rl.remaining} GitHub points left, under ${POINTS_FLOOR}; waiting until ${rl.resetAt}`);
    await sleep(Math.max(30_000, Date.parse(rl.resetAt) - Date.now() + 30_000));
  }
}

function readyCards(tried) {
  B.invalidate();
  return B.inLane('ready')
    .filter((it) => it.content?.type === 'Issue' && !tried.has(it.content.number))
    .filter((it) => (it.verify ?? '').toLowerCase() in ORDER)
    .sort(
      (a, b) =>
        ORDER[a.verify.toLowerCase()] - ORDER[b.verify.toLowerCase()] ||
        a.content.number - b.content.number
    );
}

const routeAndAgent = (card) => `${card.verify.toLowerCase()}, ${card.agent ?? 'no agent'}`;

const runFix = (n) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ['tools/audit/fix.mjs', '--issue', String(n), '--force'], {
      cwd: ROOT,
      stdio: 'inherit'
    });
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });

if (DRY) {
  const v = await paceVerdict(false);
  log(`pace: ${v.go ? 'go' : 'wait'} — ${v.reason}`);
  const rl = rateLimit();
  log(`github: ${rl.remaining} points left, floor ${POINTS_FLOOR}, resets ${rl.resetAt}`);
  const cards = readyCards(new Set());
  log(`${cards.length} card(s) in Ready, in the order they would be worked:`);
  for (const c of cards) log(`  #${c.content.number} (${routeAndAgent(c)}) ${c.content.title ?? ''}`);
  process.exit(0);
}

process.on('SIGTERM', () => {
  log('stopped; the fixer returns its current card to Ready');
  process.exit(0);
});

const tried = new Set();
let worked = 0;
log(`started, pid ${process.pid}`);

for (;;) {
  await gate();
  await points();
  let card;
  try {
    card = readyCards(tried)[0] ?? null;
  } catch (e) {
    sayEvery('board', `cannot read the board (${String(e.message).split('\n')[0]}); retrying every minute`);
    await sleep(60_000);
    continue;
  }
  if (!card) break;
  const n = card.content.number;
  tried.add(n);
  const t0 = Date.now();
  log(`#${n} (${routeAndAgent(card)}) ${card.content.title ?? ''}`);
  const { code, signal } = await runFix(n);
  worked += 1;
  log(
    `#${n} finished: fix.mjs ${signal ? `killed by ${signal}` : `exited ${code}`} after ` +
      `${((Date.now() - t0) / 60_000).toFixed(1)} min`
  );
}

log(`Ready has no untried card left; ${worked} card(s) worked this run`);
