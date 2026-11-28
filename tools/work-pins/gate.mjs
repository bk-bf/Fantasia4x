#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { checkBudgets, median } from './budgets.mjs';
import { report } from './compare.mjs';

const HARNESS_DIR = 'tools/work-pins';
const BENCH_DIR = 'tools/bench';
const HOOK_DIR = 'src/lib/workPins';
const WASM_CRATES = ['spatial-core', 'sim-core'];
const TPS_CONFIG = `${BENCH_DIR}/tps.config.ts`;
const TPS_ROUNDS = Number(process.env.TPS_ROUNDS ?? 9);
const TPS_THRESHOLD = Number(process.env.TPS_THRESHOLD ?? 0.05);
const PERF_CHANGE_ACCEPTED = process.env.PERF_CHANGE_ACCEPTED === 'true';
const TPS_CORE = process.env.TPS_CORE ?? String(cpus().length - 1);
const TPS_BENCH = 'tps/ticks.bench';
const FLOOR_BENCH = 'tps/large-wilderness.bench';
const FLOOR_ROUNDS = Number(process.env.TPS_FLOOR_ROUNDS ?? 5);
const IDLE_RUNS = { page: 'browser idle page', worker: 'browser idle worker' };

/** @typedef {(ref: string, name: string) => string} TreeOf */
/** @typedef {'base' | 'head'} Side */

/** @template {string | undefined} F @param {string} name @param {F} [fallback] @returns {string | F} */
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : /** @type {F} */ (fallback);
}

/** @param {string} cmd @param {string[]} args @param {import('node:child_process').ExecFileSyncOptions} [opts] */
function sh(cmd, args, opts = {}) {
  process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

/** @param {string} ref */
function wasmUnchanged(ref) {
  try {
    execFileSync('git', ['diff', '--quiet', ref, '--', ...WASM_CRATES]);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} ref @param {string} dir @param {string[]} harnessDirs */
function prepareTree(ref, dir, harnessDirs) {
  sh('git', ['worktree', 'add', '--detach', dir, ref]);
  for (const harness of harnessDirs) {
    rmSync(join(dir, harness), { recursive: true, force: true });
    cpSync(harness, join(dir, harness), { recursive: true });
  }
  sh('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { cwd: dir });
  if (wasmUnchanged(ref)) {
    for (const crate of WASM_CRATES)
      cpSync(`src/lib/${crate}-pkg`, join(dir, `src/lib/${crate}-pkg`), { recursive: true });
  } else {
    for (const crate of WASM_CRATES)
      sh('wasm-pack', ['build', '--target', 'web', '--out-dir', `../src/lib/${crate}-pkg`], {
        cwd: join(dir, crate)
      });
  }
  sh('pnpm', ['exec', 'svelte-kit', 'sync'], { cwd: dir });
}

/** @param {string} dir @param {string | undefined} hookFrom */
function hasHook(dir, hookFrom) {
  if (existsSync(join(dir, HOOK_DIR))) return true;
  if (!hookFrom || resolve(dir) === process.cwd()) return false;
  const patch = execFileSync('git', ['diff', '--binary', hookFrom, 'HEAD', '--', 'src'], {
    maxBuffer: 1 << 28
  });
  if (patch.length === 0) return false;
  process.stdout.write(`applying src changes ${hookFrom}..HEAD to ${dir}\n`);
  execFileSync('git', ['apply', '--3way'], { cwd: dir, input: patch, stdio: ['pipe', 'inherit', 'inherit'] });
  return existsSync(join(dir, HOOK_DIR));
}

/** @param {string} cwd @param {string} out */
function runHarness(cwd, out) {
  mkdirSync(out, { recursive: true });
  sh('pnpm', ['exec', 'vitest', 'run', '--config', `${HARNESS_DIR}/vitest.config.ts`], {
    cwd,
    env: { ...process.env, WORK_PINS_OUT: out }
  });
}

/** @param {string} script @param {string} tree @param {string} out */
function runBrowser(script, tree, out) {
  sh('node', [join(HARNESS_DIR, script), '--tree', tree, '--out', out]);
}

/** @param {string} text */
function summary(text) {
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}

/** @param {string} ref */
function refHasHook(ref) {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${HOOK_DIR}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** @param {string} dir */
function idleCalls(dir) {
  /** @param {string} scenario */
  const perFrame = (scenario) => {
    const run = JSON.parse(readFileSync(join(dir, `${scenario.replaceAll(' ', '-')}.json`), 'utf8'));
    const calls = Object.values(run.functions).reduce((s, f) => s + f.count, 0) / run.ticks;
    return { value: calls, runs: [calls] };
  };
  return checkBudgets('browser work pins idle phase', {
    'idle page calls per frame': perFrame(IDLE_RUNS.page),
    'idle worker calls per frame': perFrame(IDLE_RUNS.worker)
  });
}

/** @param {string} script @param {TreeOf} tree @param {string} base @param {string | undefined} head @param {string} results @param {string | undefined} hookFrom */
function browserLeg(script, tree, base, head, results, hookFrom) {
  const headTree = head ? tree(head, 'head-tree') : process.cwd();
  if (!hasHook(headTree, hookFrom)) throw new Error(`head has no ${HOOK_DIR}, nothing to run`);
  const absolute = () => script !== 'browser.mjs' || idleCalls(join(results, 'head'));
  if (!refHasHook(base) && !hookFrom) {
    runBrowser(script, headTree, join(results, 'head'));
    summary(`## Browser work pins: base has no \`${HOOK_DIR}\`, so head ran alone\n`);
    return absolute();
  }
  const baseTree = tree(base, 'tree');
  if (!hasHook(baseTree, hookFrom)) throw new Error(`base has no ${HOOK_DIR} after the patch`);
  runBrowser(script, baseTree, join(results, 'base'));
  runBrowser(script, headTree, join(results, 'head'));
  const compared = report(join(results, 'base'), join(results, 'head'));
  return absolute() && compared;
}

/** @param {string} cwd @param {string} out @param {string} [file] */
function tpsRun(cwd, out, file = TPS_BENCH) {
  sh('taskset', ['-c', TPS_CORE, 'pnpm', 'exec', 'vitest', 'bench', '--run', '--config', TPS_CONFIG, '--outputJson', out, file], {
    cwd
  });
  const bench = JSON.parse(readFileSync(out, 'utf8')).files[0].groups[0].benchmarks[0];
  return { name: bench.name, ms: bench.median ?? bench.mean };
}

/** @param {string} name */
const ticksIn = (name) => Number(name.match(/(\d+) ticks/)?.[1] ?? 0);

/** @param {string} cwd @param {string} results */
function tpsFloor(cwd, results) {
  /** @type {number[]} */
  const runs = [];
  for (let round = 0; round < FLOOR_ROUNDS; round++) {
    const r = tpsRun(cwd, join(results, `tps-floor-${round}.json`), FLOOR_BENCH);
    runs.push((ticksIn(r.name) * 1000) / r.ms);
  }
  return checkBudgets('ticks per second', {
    'large-wilderness ticks per second': { value: median(runs), runs }
  });
}

/** @param {TreeOf} tree @param {string} base @param {string | undefined} head @param {string} results */
function tpsLeg(tree, base, head, results) {
  const trees = { base: tree(base, 'tree'), head: head ? tree(head, 'head-tree') : process.cwd() };
  /** @type {Record<Side, number[]>} */
  const runs = { base: [], head: [] };
  let name = '';
  mkdirSync(results, { recursive: true });
  for (let round = 0; round < TPS_ROUNDS; round++) {
    for (const side of /** @type {Side[]} */ (round % 2 === 0 ? ['base', 'head'] : ['head', 'base'])) {
      const r = tpsRun(trees[side], join(results, `tps-${side}-${round}.json`));
      name = r.name;
      runs[side].push(r.ms);
    }
  }
  const ticks = ticksIn(name);
  const baseMs = median(runs.base);
  const headMs = median(runs.head);
  const change = (headMs - baseMs) / baseMs;
  const overBudget = change > TPS_THRESHOLD;
  const slower = overBudget && !PERF_CHANGE_ACCEPTED;
  /** @param {Side} side @param {number} ms */
  const row = (side, ms) =>
    `| ${side} | ${runs[side].map((x) => x.toFixed(1)).join(', ')} | ${ms.toFixed(1)} | ${ticks ? Math.round((ticks * 1000) / ms) : '-'} |`;
  summary(
    [
      `## Ticks per second: head is ${Math.abs(change * 100).toFixed(1)}% ${change > 0 ? 'slower' : 'faster'} than base${overBudget ? `, past the ${Math.round(TPS_THRESHOLD * 100)}% limit${PERF_CHANGE_ACCEPTED ? ', allowed by the "perf change accepted" label' : ''}` : ''}`,
      '',
      `\`${name}\`, ${TPS_ROUNDS} alternating rounds on core ${TPS_CORE}, ms per run.`,
      '',
      '| side | runs (median ms of each) | median ms | ticks per second |',
      '|---|---|---:|---:|',
      row('base', baseMs),
      row('head', headMs),
      ''
    ].join('\n')
  );
  if (process.env.TPS_NOTES)
    appendFileSync(
      process.env.TPS_NOTES,
      `${JSON.stringify({ name, ticks, base: runs.base, head: runs.head, baseMs, headMs })}\n`
    );
  const floor = tpsFloor(trees.head, results);
  return !slower && floor;
}

const leg = arg('--leg', 'sim');
const base = arg('--base', 'HEAD');
const head = arg('--head');
const hookFrom = arg('--hook-from');
const scratch = mkdtempSync(join(tmpdir(), 'work-pins-'));
const results = resolve(arg('--out', scratch));
const harnessDirs = leg === 'tps' ? [HARNESS_DIR, BENCH_DIR] : [HARNESS_DIR];
/** @type {string[]} */
const trees = [];
/** @type {TreeOf} */
const tree = (ref, name) => {
  const dir = join(scratch, name);
  trees.push(dir);
  process.stdout.write(`${name} ${execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' })}`);
  prepareTree(ref, dir, harnessDirs);
  return dir;
};
let ok = false;
try {
  const script = /** @type {Record<string, string | undefined>} */ ({ browser: 'browser.mjs', day: 'day.mjs' })[leg];
  if (script) ok = browserLeg(script, tree, base, head, results, hookFrom);
  else if (leg === 'tps') ok = tpsLeg(tree, base, head, results);
  else {
    const baseTree = tree(base, 'tree');
    const headTree = head ? tree(head, 'head-tree') : process.cwd();
    runHarness(baseTree, join(results, 'base'));
    runHarness(headTree, join(results, 'head'));
    ok = report(join(results, 'base'), join(results, 'head'));
  }
} finally {
  for (const dir of trees) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', dir], { stdio: 'ignore' });
    } catch {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  if (!process.argv.includes('--keep')) rmSync(scratch, { recursive: true, force: true });
  else process.stdout.write(`kept ${scratch}\n`);
}
process.exit(ok ? 0 : 1);
