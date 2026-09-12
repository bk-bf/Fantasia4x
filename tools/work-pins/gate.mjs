#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { report } from './compare.mjs';

const HARNESS_DIR = 'tools/work-pins';
const HOOK_DIR = 'src/lib/workPins';
const WASM_CRATES = ['spatial-core', 'sim-core'];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function sh(cmd, args, opts = {}) {
  process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function wasmUnchanged(ref) {
  try {
    execFileSync('git', ['diff', '--quiet', ref, '--', ...WASM_CRATES]);
    return true;
  } catch {
    return false;
  }
}

function prepareTree(ref, dir) {
  sh('git', ['worktree', 'add', '--detach', dir, ref]);
  rmSync(join(dir, HARNESS_DIR), { recursive: true, force: true });
  cpSync(HARNESS_DIR, join(dir, HARNESS_DIR), { recursive: true });
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

function runHarness(cwd, out) {
  mkdirSync(out, { recursive: true });
  sh('pnpm', ['exec', 'vitest', 'run', '--config', `${HARNESS_DIR}/vitest.config.ts`], {
    cwd,
    env: { ...process.env, WORK_PINS_OUT: out }
  });
}

function runBrowser(script, tree, out) {
  sh('node', [join(HARNESS_DIR, script), '--tree', tree, '--out', out]);
}

function summary(text) {
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}

function refHasHook(ref) {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}:${HOOK_DIR}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function browserLeg(script, tree, base, head, results, hookFrom) {
  const headTree = head ? tree(head, 'head-tree') : process.cwd();
  if (!hasHook(headTree, hookFrom)) throw new Error(`head has no ${HOOK_DIR}, nothing to run`);
  if (!refHasHook(base) && !hookFrom) {
    runBrowser(script, headTree, join(results, 'head'));
    summary(`## Browser work pins: base has no \`${HOOK_DIR}\`, so head ran alone\n`);
    return true;
  }
  const baseTree = tree(base, 'tree');
  if (!hasHook(baseTree, hookFrom)) throw new Error(`base has no ${HOOK_DIR} after the patch`);
  runBrowser(script, baseTree, join(results, 'base'));
  runBrowser(script, headTree, join(results, 'head'));
  return report(join(results, 'base'), join(results, 'head'));
}

const leg = arg('--leg', 'sim');
const base = arg('--base', 'HEAD');
const head = arg('--head');
const hookFrom = arg('--hook-from');
const scratch = mkdtempSync(join(tmpdir(), 'work-pins-'));
const results = resolve(arg('--out', scratch));
const trees = [];
const tree = (ref, name) => {
  const dir = join(scratch, name);
  trees.push(dir);
  process.stdout.write(`${name} ${execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' })}`);
  prepareTree(ref, dir);
  return dir;
};
let ok = false;
try {
  const script = { browser: 'browser.mjs', day: 'day.mjs' }[leg];
  if (script) ok = browserLeg(script, tree, base, head, results, hookFrom);
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
