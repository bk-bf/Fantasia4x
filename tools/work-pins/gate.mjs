#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { report } from './compare.mjs';

const HARNESS_DIR = 'tools/work-pins';
const WASM_CRATES = ['spatial-core', 'sim-core'];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function sh(cmd, args, opts = {}) {
  process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function wasmUnchanged(base) {
  try {
    execFileSync('git', ['diff', '--quiet', base, '--', ...WASM_CRATES]);
    return true;
  } catch {
    return false;
  }
}

function prepareBase(base, dir) {
  sh('git', ['worktree', 'add', '--detach', dir, base]);
  rmSync(join(dir, HARNESS_DIR), { recursive: true, force: true });
  cpSync(HARNESS_DIR, join(dir, HARNESS_DIR), { recursive: true });
  sh('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { cwd: dir });
  if (wasmUnchanged(base)) {
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

function runHarness(cwd, out) {
  mkdirSync(out, { recursive: true });
  sh('pnpm', ['exec', 'vitest', 'run', '--config', `${HARNESS_DIR}/vitest.config.ts`], {
    cwd,
    env: { ...process.env, WORK_PINS_OUT: out }
  });
}

const base = arg('--base', 'HEAD');
const scratch = mkdtempSync(join(tmpdir(), 'work-pins-'));
const baseTree = join(scratch, 'tree');
let ok = false;
try {
  process.stdout.write(`base ${execFileSync('git', ['rev-parse', base], { encoding: 'utf8' })}`);
  prepareBase(base, baseTree);
  runHarness(baseTree, join(scratch, 'base'));
  runHarness(process.cwd(), join(scratch, 'head'));
  ok = report(join(scratch, 'base'), join(scratch, 'head'));
} finally {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', baseTree], { stdio: 'ignore' });
  } catch {
    rmSync(baseTree, { recursive: true, force: true });
  }
  if (!process.argv.includes('--keep')) rmSync(scratch, { recursive: true, force: true });
  else process.stdout.write(`kept ${scratch}\n`);
}
process.exit(ok ? 0 : 1);
