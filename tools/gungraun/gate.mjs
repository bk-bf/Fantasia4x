#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CRATES = ['spatial-core', 'sim-core'];
const HARNESS = ['Cargo.toml', 'Cargo.lock', 'benches'];
const LIMITS = 'ir=5%';
const REGRESSION = 3;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function benchExecutables(crateDir, targetDir) {
  const out = execFileSync(
    'cargo',
    ['bench', '--no-run', '--message-format=json-render-diagnostics'],
    {
      cwd: crateDir,
      env: { ...process.env, CARGO_TARGET_DIR: targetDir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 64 << 20
    }
  );
  return out
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .filter((m) => m.reason === 'compiler-artifact' && m.target.kind.includes('bench'))
    .map((m) => m.executable)
    .filter(Boolean);
}

function runBenches(crateDir, executables, home, args) {
  const statuses = executables.map((exe) => {
    process.stdout.write(`$ ${exe} --bench ${args.join(' ')}\n`);
    const { status } = spawnSync(exe, ['--bench', ...args], {
      cwd: crateDir,
      stdio: 'inherit',
      env: { ...process.env, GUNGRAUN_HOME: home }
    });
    return status ?? 1;
  });
  return statuses.find((s) => s !== 0 && s !== REGRESSION) ?? statuses.find((s) => s !== 0) ?? 0;
}

function measureBase(crate, baseTree, targetDir, home) {
  const baseCrate = join(baseTree, crate);
  for (const entry of HARNESS) {
    rmSync(join(baseCrate, entry), { recursive: true, force: true });
    cpSync(join(crate, entry), join(baseCrate, entry), { recursive: true });
  }
  let executables;
  try {
    executables = benchExecutables(baseCrate, targetDir);
  } catch {
    process.stdout.write(`::warning::${crate}: the benchmarks do not build on the base, so head is not compared\n`);
    return false;
  }
  if (runBenches(baseCrate, executables, home, ['--save-baseline=base']) !== 0) {
    process.stdout.write(`::warning::${crate}: the benchmarks fail on the base, so head is not compared\n`);
    return false;
  }
  return true;
}

const base = arg('--base', 'HEAD');
const home = resolve(arg('--home', join(tmpdir(), 'gungraun')));
const scratch = mkdtempSync(join(tmpdir(), 'gungraun-base-'));
const baseTree = join(scratch, 'tree');
const results = [];
try {
  process.stdout.write(`base ${execFileSync('git', ['rev-parse', base], { encoding: 'utf8' })}`);
  execFileSync('git', ['worktree', 'add', '--detach', baseTree, base], { stdio: 'inherit' });
  for (const crate of CRATES) {
    const crateHome = join(home, crate);
    rmSync(crateHome, { recursive: true, force: true });
    const targetDir = resolve(crate, 'target');
    const compared = measureBase(crate, baseTree, targetDir, crateHome);
    const args = compared ? ['--baseline=base', `--callgrind-limits=${LIMITS}`] : [];
    const status = runBenches(resolve(crate), benchExecutables(crate, targetDir), crateHome, args);
    results.push({ crate, compared, status });
  }
} finally {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', baseTree], { stdio: 'ignore' });
  } catch {
    rmSync(baseTree, { recursive: true, force: true });
  }
  rmSync(scratch, { recursive: true, force: true });
}

for (const { crate, compared, status } of results) {
  const verdict = status === 0 ? 'ok' : status === REGRESSION ? `over ${LIMITS}` : `failed (${status})`;
  process.stdout.write(`${crate}: ${compared ? 'base against head' : 'head only'}, ${verdict}\n`);
}
process.stdout.write(`flame graphs in ${home}\n`);
const failed = results.find((r) => r.status !== 0 && r.status !== REGRESSION);
process.exit(failed ? failed.status : results.some((r) => r.status === REGRESSION) ? REGRESSION : 0);
