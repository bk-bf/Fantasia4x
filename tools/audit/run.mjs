#!/usr/bin/env node
// The overnight loop. Claim a symbol's rules, ask a model, record the verdicts, repeat.
//
//   node tools/audit/run.mjs --workers 4 --hours 8
//   node tools/audit/run.mjs --once --model haiku          # one batch, for checking a rule
//
// Every batch is a fresh model invocation with no memory: the ledger is the only state,
// so the run can be killed at any moment and resumed with no loss beyond one in-flight
// batch, whose claim expires on its own.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(HERE, 'audit.mjs');
const ROOT = process.env.AUDIT_ROOT || join(HERE, '..', '..');
const TMP = join(HERE, '.ledger', 'tmp');

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const flag = (n) => process.argv.includes(`--${n}`);

const WORKERS = Number(arg('workers', 1));
const HOURS = Number(arg('hours', 8));
const MODEL = arg('model', 'sonnet');
const CLAUDE = process.env.AUDIT_CLAUDE || 'claude';
const ONCE = flag('once');
const RUN_ID = arg('run', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const LOG = join(HERE, '.ledger', `${RUN_ID}.log`);

mkdirSync(TMP, { recursive: true });

const log = (s) => {
  const line = `${new Date().toISOString()} ${s}`;
  process.stdout.write(line + '\n');
  appendFileSync(LOG, line + '\n');
};

// Child audit CLI calls go through process.execPath, not a bare 'node': inside a systemd
// unit PATH resolves to the system node (v20 here), which has no node:sqlite.
function sh(cmd, args, { input, env, cwd, timeoutMs = 600_000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      env: { ...process.env, ...env },
      ...(cwd ? { cwd } : {}),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let out = '',
      err = '',
      settled = false;
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    // A missing binary arrives as an 'error' event, not a non-zero close. Unhandled, it
    // takes down the whole run instead of failing one batch.
    p.on('error', (e) => done({ code: -1, out, err: `${err}spawn ${cmd}: ${e.message}` }));
    p.on('close', (code) => done({ code, out, err }));
    p.stdin.on('error', () => {});
    if (input !== undefined) {
      p.stdin.write(input);
      p.stdin.end();
    }
  });
}

async function askModel(prompt) {
  // --print keeps it non-interactive; a fresh process per batch is what keeps context fixed.
  // `plan` permits the read-only tools and nothing else: the rules ask the model to search
  // the repo for callers and tests, and it must not be able to change what it is auditing.
  // cwd is the checkout, so those searches resolve against the code this batch describes.
  const r = await sh(CLAUDE, ['--print', '--model', MODEL, '--permission-mode', 'plan'], {
    input: prompt,
    cwd: ROOT
  });
  if (r.code !== 0) throw new Error(`claude exited ${r.code}: ${r.err.slice(0, 400)}`);
  return r.out;
}

async function worker(id, deadline) {
  const env = { AUDIT_WORKER: `${hostname()}#${id}` };
  let batches = 0,
    verdicts = 0,
    fails = 0,
    errors = 0;

  while (Date.now() < deadline) {
    const next = await sh(process.execPath, [AUDIT, 'next', '--run', RUN_ID], { env });
    if (next.code !== 0) {
      log(`[w${id}] next failed: ${next.err.trim()}`);
      errors++;
      break;
    }

    let task;
    try {
      task = JSON.parse(next.out.trim().split('\n').pop());
    } catch {
      log(`[w${id}] unparseable task: ${next.out.slice(0, 200)}`);
      errors++;
      break;
    }
    if (task.empty) {
      log(`[w${id}] queue empty`);
      break;
    }

    const taskFile = join(TMP, `task-${id}.json`);
    const respFile = join(TMP, `resp-${id}.txt`);
    writeFileSync(taskFile, JSON.stringify(task));

    const t0 = Date.now();
    try {
      writeFileSync(respFile, await askModel(task.prompt));
    } catch (e) {
      log(`[w${id}] model error on ${task.symbol_key}: ${e.message}`);
      await sh(process.execPath, [AUDIT, 'release'], { env });
      errors++;
      // A missing binary or a revoked login fails identically on every item; spinning
      // through the queue would burn the night marking everything as an error.
      if (/spawn .*ENOENT|not found/.test(e.message) || errors >= 5) {
        log(`[w${id}] giving up after ${errors} model errors`);
        break;
      }
      continue;
    }

    const sub = await sh(
      process.execPath,
      [AUDIT, 'submit', respFile, '--task', taskFile, '--run', RUN_ID, '--model', MODEL],
      { env }
    );
    const accepted = Number(/accepted (\d+)/.exec(sub.out)?.[1] ?? 0);
    const rejected = Number(/rejected (\d+)/.exec(sub.out)?.[1] ?? 0);
    const batchFails = (sub.out.match(/\[FAIL\]/g) ?? []).length;
    verdicts += accepted;
    fails += batchFails;
    batches++;

    log(
      `[w${id}] ${task.symbol_key} — ${task.rules.length} rules, ${accepted} accepted, ` +
        `${rejected} rejected, ${batchFails} fail, ${((Date.now() - t0) / 1000).toFixed(1)}s`
    );
    for (const line of sub.out
      .split('\n')
      .filter((l) => l.includes('[reject]') || l.includes('[FAIL]'))) {
      log(`[w${id}]   ${line.trim()}`);
    }

    // A claim left behind by a rejected batch would otherwise sit until its lease expires.
    if (accepted === 0) await sh(process.execPath, [AUDIT, 'release'], { env });
    if (ONCE) break;
  }
  return { batches, verdicts, fails, errors };
}

const deadline = ONCE ? Date.now() + 15 * 60_000 : Date.now() + HOURS * 3600_000;
log(
  `run ${RUN_ID} — ${WORKERS} worker(s), model ${MODEL}, until ${new Date(deadline).toISOString()}`
);

const results = await Promise.all(
  Array.from({ length: WORKERS }, (_, i) => worker(i + 1, deadline))
);

const total = results.reduce(
  (a, r) => ({
    batches: a.batches + r.batches,
    verdicts: a.verdicts + r.verdicts,
    fails: a.fails + r.fails,
    errors: a.errors + r.errors
  }),
  { batches: 0, verdicts: 0, fails: 0, errors: 0 }
);

log(
  `done — ${total.batches} batches, ${total.verdicts} verdicts, ${total.fails} fails, ${total.errors} errors`
);
await sh(process.execPath, [AUDIT, 'status']).then((r) => process.stdout.write(r.out));
